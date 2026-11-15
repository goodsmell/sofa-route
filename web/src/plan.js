import {visitWindow, serviceMin, toMin} from './logic.js';
import {applyLegs} from './tmapRoute.js';

// 직선거리(km). 도로는 이보다 길어서 운전 시간 추정에만 쓴다.
export function km(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// 화물차 평균 시속 약 40km, 도로는 직선의 1.3배로 잡은 대략 시간(분)
export const driveMin = (a, b) => Math.round(km(a, b) * 1.3 / 40 * 60);

const pathKm = (start, stops, end, pos) => {
  let total = 0, prev = start;
  for (const s of stops) {total += km(prev, pos[s.id]); prev = pos[s.id]}
  return total + km(prev, end);
};

// 운전이 가장 편한 순서: 가까운 곳부터 잇고(최근접) 2-opt로 꼬인 구간을 푼다. 고객 희망 시간은 보지 않는다.
export function driverOrder(stops, start, end, pos) {
  const left = stops.filter(s => pos[s.id]), unknown = stops.filter(s => !pos[s.id]);
  const order = [];
  let here = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (km(here, pos[left[i].id]) < km(here, pos[left[best].id])) best = i;
    const [next] = left.splice(best, 1);
    order.push(next); here = pos[next.id];
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
      const next = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
      if (pathKm(start, next, end, pos) + 1e-9 < pathKm(start, order, end, pos)) {order.splice(0, order.length, ...next); improved = true}
    }
  }
  return [...order, ...unknown];
}

const prefers = c => /가장\s*늦게|가능하면\s*늦게|늦은\s*시간/.test(c.memo || '') ? 'late' : /가장\s*이르게|가능하면\s*이르게/.test(c.memo || '') ? 'early' : '';

// 대략 시간으로 순서를 돌려 보고, 약속을 어기거나 요청과 다르면 큰 벌점을 준다.
export function customerScore(day, stops, start, end, pos) {
  let t = toMin(day.depart), here = start, penalty = 0, drive = 0;
  stops.forEach((c, i) => {
    const p = pos[c.id];
    const move = p ? driveMin(here, p) : 30;
    drive += move;
    const w = visitWindow(c), reach = t + move, begin = Math.max(reach, w.s);
    if (begin >= w.e && (c.slot === 'am' || c.slot === 'pm' || isFixed(c))) penalty += 1000 + (begin - w.e) * 10;
    // 희망 순서는 약속 시간과 운전 거리보다 약한 조건이다.
    if (prefers(c) === 'late') penalty += (stops.length - 1 - i) * 8;
    if (prefers(c) === 'early') penalty += i * 8;
    if (/분당|판교/.test(c.addr || '') && begin < 600) penalty += 80;
    if (/이천|여주|원주|강원/.test(c.addr || '') && begin >= 720) penalty += 25;
    if (t >= 1020 && move > 20) penalty += 20;
    t = begin + serviceMin(c, move);
    if (p) here = p;
  });
  drive += driveMin(here, end);
  return penalty + drive;
}

// 고객 희망 시간에 맞춘 순서: 시간대 순으로 시작해 한 곳씩 옮겨 보며 점수가 낮아지는 쪽을 고른다.
export function customerOrder(day, stops, start, end, pos) {
  const slot = {am: 0, any: 1, pm: 2};
  let best = driverOrder(stops, start, end, pos).sort((a, b) => visitWindow(a).s - visitWindow(b).s || slot[a.slot] - slot[b.slot]);
  let bestScore = customerScore(day, best, start, end, pos);
  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (let i = 0; i < best.length; i++) for (let j = 0; j < best.length; j++) {
      if (i === j) continue;
      const next = best.slice(), [item] = next.splice(i, 1);
      next.splice(j, 0, item);
      const value = customerScore(day, next, start, end, pos);
      if (value < bestScore) {best = next; bestScore = value; changed = true}
    }
    if (!changed) break;
  }
  return best;
}

// 시간 약속 위반은 크게 피하면서 운전 거리에도 비중을 두는 절충안.
export function balancedOrder(day, stops, start, end, pos) {
  let best = driverOrder(stops, start, end, pos);
  const score = order => customerScore(day, order, start, end, pos) +
    pathKm(start, order.filter(c => pos[c.id]), end, pos) * 2;
  let bestScore = score(best);
  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (let i = 0; i < best.length; i++) for (let j = 0; j < best.length; j++) {
      if (i === j) continue;
      const next = best.slice(), [item] = next.splice(i, 1);
      next.splice(j, 0, item);
      const value = score(next);
      if (value < bestScore) {best = next; bestScore = value; changed = true}
    }
    if (!changed) break;
  }
  return best;
}

// 추천 순서(id 목록)를 지금 코스에 적용한다. 이미 완료한 곳은 앞에 그대로 둔다.
export function applyPlan(day, ids) {
  const done = day.list.filter(c => c.done), rest = day.list.filter(c => !c.done);
  const byId = new Map(rest.map(c => [c.id, c]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean);
  const missing = rest.filter(c => !ids.includes(c.id));
  return {...day, list: [...done, ...ordered, ...missing]};
}

export function planStops(day, ids) {
  const byId = new Map(day.list.map(c => [c.id, c]));
  const listed = (ids || []).map(id => byId.get(id)).filter(c => c && !c.done);
  return [...listed, ...day.list.filter(c => !c.done && !(ids || []).includes(c.id))];
}

export const isFixed = c => /^\d{2}:\d{2}$/.test(c.promiseTime || '');

// 확정 시간이 있는 고객끼리만 시간 순으로 자리를 바꾼다. 아직 통화 안 한 고객은 자리를 그대로 둔다.
export function sortByFixed(day) {
  const slots = day.list.map((c, i) => (!c.done && isFixed(c) ? i : -1)).filter(i => i >= 0);
  const fixed = slots.map(i => day.list[i]).sort((a, b) => toMin(a.promiseTime) - toMin(b.promiseTime));
  const list = day.list.slice();
  slots.forEach((slotIndex, k) => {list[slotIndex] = fixed[k]});
  return {...day, list};
}

export const planKey = day => day.list.map(c => c.id).join(',');

// 추천을 처음 만들 때 각 순서의 실제 도로 구간을 받아 둔다. 같은 순서는 한 번만 요청한다.
export async function calculateRecommendedLegs(day, fetchRoute) {
  const plans = {...day.plans}, located = {}, errors = [], routes = new Map();
  for (const kind of ['customer', 'driver', 'balanced']) {
    const plan = plans[kind];
    if (!plan) continue;
    const ordered = applyPlan(day, plan.ids), key = planKey(ordered);
    try {
      let route = routes.get(key);
      if (!route) {
        route = await fetchRoute(ordered);
        if (!route.legs) throw new Error('T맵 구간 시간을 읽지 못했어요.');
        routes.set(key, route);
      }
      plans[kind] = {...plan, legs: route.legs, legsKey: key, timeError: ''};
      Object.assign(located, route.located);
    } catch (error) {
      errors.push({kind, error});
      plans[kind] = {...plan, timeError: error.message || 'T맵 이동 시간을 받지 못했어요.'};
    }
  }
  return {plans, located, errors};
}

// 추천 순서로 바꾼 하루. T맵 구간 시간을 그 순서로 받아 뒀으면 붙이고, 없으면 좌표로 어림한 시간만 넣는다.
export function planDay(day, plan) {
  const ordered = applyPlan(day, plan.ids);
  if (plan.legs && plan.legsKey === planKey(ordered)) return applyLegs(ordered, plan.legs);
  const geo = day.plans?.geo;
  const at = c => (Number.isFinite(c?.lat) ? {lat: c.lat, lng: c.lng} : null);
  let prev = geo?.start || null;
  const list = ordered.list.map(c => {
    const here = at(c);
    const travel = prev && here ? Math.max(5, driveMin(prev, here)) : 30;
    if (here) prev = here;
    return {...c, travel, travelKm: undefined, travelFrom: undefined};
  });
  const last = at(list.at(-1));
  return {...ordered, list, endTravel: last && geo?.end ? Math.max(5, driveMin(last, geo.end)) : 30, endTravelKm: undefined, endFrom: undefined};
}

export function movePlan(day, kind, from, to) {
  const plan = day.plans?.[kind];
  if (!plan || from === to) return day;
  const list = applyPlan(day, plan.ids).list.slice();
  if (to < 0 || to >= list.length || list[from]?.done || list[to]?.done) return day;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return {...day, plans: {...day.plans, [kind]: {...plan, ids: list.filter(c => !c.done).map(c => c.id)}}};
}
