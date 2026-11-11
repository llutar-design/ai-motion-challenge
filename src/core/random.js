// 랜덤 선택(바로 앞 항목 중복 최소화). rng 를 주입할 수 있어 테스트가 가능하다.

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** ids 에서 n 개를 뽑는다. 풀이 n 보다 작으면 다시 섞어 이어 붙이되 연속 중복은 피한다. */
export function pickSequence(ids, n, rng = Math.random, avoidFirst = null) {
  if (!ids.length) return [];
  const out = [];
  let prev = avoidFirst;
  while (out.length < n) {
    let batch = shuffle(ids, rng);
    if (ids.length > 1 && batch[0] === prev) {
      const k = 1 + Math.floor(rng() * (batch.length - 1));
      [batch[0], batch[k]] = [batch[k], batch[0]];
    }
    for (const id of batch) {
      if (out.length >= n) break;
      out.push(id);
      prev = id;
    }
  }
  return out;
}
