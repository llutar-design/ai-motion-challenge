// 웹캠 연결. 영상은 메모리에서만 처리하며 녹화·저장하지 않는다. 마이크는 요청하지 않는다.

export class CameraError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MESSAGES = {
  NotAllowedError: ['DENIED', '카메라 사용 권한이 거부되었습니다.'],
  SecurityError: ['DENIED', '보안 설정 때문에 카메라를 사용할 수 없습니다.'],
  NotFoundError: ['NOT_FOUND', '연결된 카메라를 찾을 수 없습니다.'],
  OverconstrainedError: ['NOT_FOUND', '선택한 카메라를 찾을 수 없습니다(분리되었거나 설정이 맞지 않음).'],
  NotReadableError: ['BUSY', '카메라가 다른 프로그램(화상회의 등)에서 사용 중이거나 응답하지 않습니다.'],
  AbortError: ['BUSY', '카메라를 시작하지 못했습니다.'],
};

export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.onLost = null;
  }

  get active() {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === 'live');
  }

  async start({ deviceId = '', resolution = '1280x720' } = {}) {
    this.stop();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new CameraError('INSECURE', '카메라는 http://127.0.0.1 또는 localhost 주소에서만 사용할 수 있습니다. 시작 스크립트로 실행해 주세요.');
    }
    const [w, h] = resolution.split('x').map(Number);
    const video = { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30 } };
    if (deviceId) video.deviceId = { exact: deviceId };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      if (deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
        // 저장된 장치가 사라졌으면 기본 카메라로 재시도
        return this.start({ deviceId: '', resolution });
      }
      const [code, msg] = MESSAGES[e.name] ?? ['UNKNOWN', `카메라 오류: ${e.message || e.name}`];
      throw new CameraError(code, msg);
    }
    this.stream = stream;
    for (const t of stream.getVideoTracks()) {
      t.addEventListener('ended', () => this.onLost?.());
    }
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play().catch(() => {});
    await new Promise((resolve) => {
      if (this.video.readyState >= 2 && this.video.videoWidth) return resolve();
      this.video.addEventListener('loadeddata', () => resolve(), { once: true });
      setTimeout(resolve, 3000);
    });
    return this.info();
  }

  info() {
    const t = this.stream?.getVideoTracks()[0];
    const s = t?.getSettings?.() ?? {};
    return { label: t?.label ?? '', width: this.video.videoWidth || s.width, height: this.video.videoHeight || s.height, frameRate: s.frameRate, deviceId: s.deviceId };
  }

  stop() {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
  }

  static async listDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `카메라 ${i + 1}` }));
    } catch {
      return [];
    }
  }
}
