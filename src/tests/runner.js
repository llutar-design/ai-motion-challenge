// 의존성 없는 아주 작은 테스트 러너(브라우저에서 실행, 오프라인 동작).

const tests = [];
let currentGroup = '';

export function describe(name, fn) {
  currentGroup = name;
  fn();
  currentGroup = '';
}

export function test(name, fn) {
  tests.push({ group: currentGroup, name, fn });
}

export const assert = {
  ok(v, msg = '값이 참이 아님') { if (!v) throw new Error(msg); },
  equal(a, b, msg) { if (a !== b) throw new Error(msg ?? `기대값 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`); },
  gte(a, b, msg) { if (!(a >= b)) throw new Error(msg ?? `${a} >= ${b} 이어야 함`); },
  lt(a, b, msg) { if (!(a < b)) throw new Error(msg ?? `${a} < ${b} 이어야 함`); },
  isNull(v, msg) { if (v !== null) throw new Error(msg ?? `null 이어야 함, 실제 ${v}`); },
  notNull(v, msg) { if (v == null) throw new Error(msg ?? 'null 이 아니어야 함'); },
};

export function run(root) {
  const results = [];
  for (const t of tests) {
    try {
      t.fn();
      results.push({ ...t, ok: true });
    } catch (e) {
      results.push({ ...t, ok: false, err: e.message });
    }
  }
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  const summary = `TESTS ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${results.length}`;
  document.title = summary;
  const lines = results.map((r) => `${r.ok ? '✅' : '❌'} [${r.group}] ${r.name}${r.ok ? '' : `\n     → ${r.err}`}`);
  root.textContent = '';
  const h = document.createElement('h2');
  h.id = 'summary';
  h.textContent = summary;
  h.style.color = fail ? '#ff6b6b' : '#3ddc84';
  const pre = document.createElement('pre');
  pre.id = 'details';
  pre.textContent = lines.join('\n');
  root.append(h, pre);
  return { pass, fail, results };
}
