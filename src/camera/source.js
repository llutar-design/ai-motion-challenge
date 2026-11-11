// AI 와 화면이 함께 쓰는 영상 입력. 카메라를 돌려 설치한 경우(90/180/270도) 바로 세운 영상을 만든다.
// 회전이 0 이면 비디오 요소를 그대로 쓰고, 아니면 매 프레임 회전된 캔버스를 만든다(메모리에서만, 저장 안 함).

export class FrameSource {
  constructor(video) {
    this.video = video;
    this.rotation = 0;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.override = null; // DEMO 모드: { image, width, height }
  }

  setRotation(deg) { this.rotation = ((Number(deg) % 360) + 360) % 360; }

  get ready() {
    if (this.override) return true;
    return this.video.readyState >= 2 && this.video.videoWidth > 0;
  }

  /** 이번 프레임 이미지(회전 적용). 호출할 때마다 회전 캔버스를 갱신한다. */
  grab() {
    if (this.override) return this.override;
    const v = this.video;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!this.rotation) return { image: v, width: vw, height: vh };
    const swap = this.rotation === 90 || this.rotation === 270;
    const w = swap ? vh : vw;
    const h = swap ? vw : vh;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.translate(w / 2, h / 2);
    c.rotate((this.rotation * Math.PI) / 180);
    c.drawImage(v, -vw / 2, -vh / 2, vw, vh);
    return { image: this.canvas, width: w, height: h };
  }

  /** 새 영상 프레임이 들어왔는지(같은 프레임을 두 번 추론하지 않기 위해) */
  frameStamp() {
    if (this.override) return this.override.stamp;
    return this.video.currentTime;
  }
}

/** 밝기·역광 점검: 작은 크기로 줄여 평균 밝기를 잰다. person 은 사람 영역(정규화 상자). */
export function measureLight(image, width, height, person = null) {
  const c = measureLight.c ?? (measureLight.c = document.createElement('canvas'));
  const W = 64;
  const H = Math.max(8, Math.round((W * height) / width));
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  let all = 0, n = 0, inner = 0, m = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      all += l; n++;
      if (person && x / W >= person.x0 && x / W <= person.x1 && y / H >= person.y0 && y / H <= person.y1) { inner += l; m++; }
    }
  }
  const mean = all / n;
  const personMean = m > 0 ? inner / m : null;
  return { mean, personMean, backlit: personMean != null && mean > 60 && personMean / mean < 0.6, dark: mean < 45 };
}
