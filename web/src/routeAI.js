import {workMin} from './logic.js';

const MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export function coarseArea(address) {
  const text = String(address || '');
  const location = text.match(/\((?=(?:경기|서울|인천|강원|충청|전라|경상|부산|대구|대전|광주|울산|세종|제주))([^)]*)\)/)?.[1] || text;
  const main = location.split(/[,(]/)[0].trim().split(/\s+/).slice(0, 3).join(' ');
  const neighborhood = text.match(/([가-힣]{2,}(?:동|읍|면|리))(?=[\s,)]|$)/)?.[1] || '';
  return [main, neighborhood].filter(Boolean).join(' ');
}

export function routeInput(day) {
  const completed = day.list.filter(stop => stop.done);
  const pending = day.list.filter(stop => !stop.done);
  return {
    date: day.date,
    depart: completed.at(-1)?.doneAt || day.depart,
    start: coarseArea(completed.at(-1)?.addr || day.start),
    end: coarseArea(day.end),
    stops: pending.map(stop => ({
      id: stop.id,
      area: coarseArea(stop.addr),
      window: stop.promiseTime ? `${stop.promiseTime}부터 30분` : stop.slot === 'am' ? '09:00~13:00' : stop.slot === 'pm' ? '13:00~17:00' : '09:00~17:00',
      workMinutes: workMin(stop),
      preferred: /가장\s*늦게|가능하면\s*늦게/.test(stop.memo || '') ? '늦게' : /가장\s*이르게|가능하면\s*이르게/.test(stop.memo || '') ? '이르게' : '',
    })),
  };
}

export function applyAiOrder(day, order) {
  const fixed = day.list.filter(stop => stop.done);
  const remaining = day.list.filter(stop => !stop.done);
  const ids = remaining.map(stop => stop.id);
  if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== ids.length || order.some(id => !ids.includes(id))) {
    throw new Error('AI가 완전한 방문 순서를 돌려주지 않았습니다.');
  }
  const byId = new Map(remaining.map(stop => [stop.id, stop]));
  return { ...day, list: [...fixed, ...order.map(id => byId.get(id))], aiRecommended: true };
}

export async function planWithGemini(day, key, fetcher = fetch) {
  const input = routeInput(day);
  if (input.stops.length < 2) return day;
  const instruction = [
    '당신은 한국의 3.5톤 소파 배송 기사 방문 순서를 추천한다.',
    '아래 데이터에는 고객 이름, 전화번호, 정확한 번지가 없다. 지역과 시간 조건만 보고 순서를 정한다.',
    '시간 약속을 가장 우선한다. 오전은 13시 전, 오후는 13~17시, 정확한 시각은 시작부터 30분 안에 도착해야 한다.',
    '06:40 안산 출발, 먼 외곽은 이른 시간 후보, 분당·판교는 10시 이후 후보, 마지막은 안산 복귀에 유리한 지역을 고려한다.',
    '실시간 교통이나 정확한 도로 거리는 알 수 없으므로 추측한 분 단위 이동시간을 만들지 말라.',
    '모든 stop id를 정확히 한 번씩 포함한 방문 순서만 JSON {"order":["id",...]}로 답하라.',
    JSON.stringify(input),
  ].join('\n');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetcher(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: instruction }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
  } catch (error) {
    throw new Error(error.name === 'AbortError' ? 'AI 응답이 늦어 기존 순서를 유지했습니다.' : 'AI에 연결하지 못했습니다.');
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload.error?.status || response.status;
    throw new Error(code === 'RESOURCE_EXHAUSTED' ? '무료 사용 한도에 도달했습니다.' : code === 'API_KEY_INVALID' || response.status === 400 || response.status === 403 ? 'AI 키를 확인해 주세요.' : 'AI 연결에 실패했습니다.');
  }
  const content = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw new Error('AI 답변을 읽지 못했습니다.'); }
  return applyAiOrder(day, parsed.order);
}
