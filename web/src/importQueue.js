// 사진 분석 진행 상황을 날짜별로 기기에 저장한다.
// 앱을 나갔다 와도 확인 목록과 아직 못 읽은 사진이 남아 있어서 이어서 진행할 수 있다.
//   queue:            분석 대기 사진 [{ imageId, name }]
//   failed:           분석 실패 사진 [{ imageId, name, error }]
//   pending:          사진에서 읽었지만 아직 확정하지 않은 의뢰서 고객
//   phoneCandidates:  고객 번호 표에서 읽었지만 아직 짝을 못 찾은 번호
export const IMPORT_KEY = "sofa-route-imports-v1";
export const EMPTY_IMPORT = Object.freeze({
  queue: [],
  failed: [],
  pending: [],
  phoneCandidates: [],
});

export const sessionOf = (all, date) => ({ ...EMPTY_IMPORT, ...all[date] });

const isEmpty = (s) =>
  !s.queue.length && !s.failed.length && !s.pending.length && !s.phoneCandidates.length;

// 한 날짜의 진행 상황을 바꾼 새 전체 객체를 돌려준다. 비면 그 날짜는 지운다.
export function updateSession(all, date, fn) {
  const next = fn(sessionOf(all, date));
  const copy = { ...all };
  if (isEmpty(next)) delete copy[date];
  else copy[date] = next;
  return copy;
}

// 대기 사진이 남은 첫 날짜와 그 사진
export function nextQueued(all) {
  for (const [date, s] of Object.entries(all))
    if (s.queue?.length) return { date, item: s.queue[0] };
  return null;
}

export const queuedCount = (all) =>
  Object.values(all).reduce((n, s) => n + (s.queue?.length || 0), 0);

export function loadImports(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(IMPORT_KEY));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function saveImports(all, storage = localStorage) {
  try {
    if (Object.keys(all).length) storage.setItem(IMPORT_KEY, JSON.stringify(all));
    else storage.removeItem(IMPORT_KEY);
    return true;
  } catch {
    return false;
  }
}
