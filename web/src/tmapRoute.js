const API = 'https://apis.openapi.sk.com/tmap';
const GEO_CACHE = 'sofa-route-geo-v1';
const LEG_CACHE = 'sofa-route-legs-v1';

export function mapAddress(value) {
  const raw = String(value || '').trim();
  const wrapped = raw.match(/\(([^()]*(?:로|길|동|읍|면|리)\s*\d[^()]*)\)/)?.[1];
  return (wrapped || raw).split(',')[0].split('(')[0].trim();
}

// "경기도 성남시 분당구 방아로29번길 7, 103동 301호 (이매동, 동양파크빌)" → "경기도 성남시 분당구 방아로29번길 7"
export function roadAddress(value) {
  const text = String(value || '').replace(/\s+/g, ' ');
  const m = text.match(/((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)[가-힣]*\s)?([가-힣]+(?:시|군)\s)?([가-힣]+구\s)?([가-힣]+(?:읍|면)\s)?([가-힣0-9]+(?:로|길)(?:\s?\d+번?길)?)\s?(\d+(?:-\d+)?)/);
  return m ? (m.slice(1, 6).filter(Boolean).join('') + ' ' + m[6]).replace(/\s+/g, ' ').trim() : '';
}

// 괄호 안 "(이매동, 동양파크빌)" 에서 동 이름과 건물 이름
function placeHints(value) {
  const text = String(value || '');
  const inside = [...text.matchAll(/\(([^()]+)\)/g)].map(m => m[1]).join(',');
  const parts = inside.split(',').map(s => s.trim()).filter(Boolean);
  const dong = parts.find(p => /^[가-힣0-9]+(?:동|읍|면|리|가)$/.test(p)) || text.match(/\s([가-힣]+[0-9]*(?:동|읍|면))(?=[\s,]|$)/)?.[1] || '';
  const building = parts.find(p => p !== dong && /[가-힣]{2,}/.test(p) && !/^\d/.test(p)) || '';
  const city = text.match(/([가-힣]+(?:시|군))(?=\s)/)?.[1] || '';
  return {dong, building, city};
}

// T맵이 알아듣기 쉬운 순서로 검색어 후보를 만든다. 카드에 보이는 주소는 그대로 둔다.
export function searchCandidates(stopOrAddress) {
  const stop = typeof stopOrAddress === 'string' ? {addr: stopOrAddress} : stopOrAddress || {};
  const {dong, building, city} = placeHints(stop.addr);
  const list = [
    stop.mapAddr && {kind: 'addr', q: stop.mapAddr.trim()},
    {kind: 'addr', q: roadAddress(stop.addr)},
    {kind: 'addr', q: mapAddress(stop.addr)},
    building && {kind: 'poi', q: [dong || city, building].filter(Boolean).join(' ')},
    building && city && dong && {kind: 'poi', q: city + ' ' + building},
    dong && {kind: 'addr', q: [city, dong].filter(Boolean).join(' '), approx: true},
  ].filter(c => c && c.q);
  const seen = new Set();
  return list.filter(c => !seen.has(c.kind + c.q) && seen.add(c.kind + c.q));
}

export function parseGeocode(data) {
  const item = data?.coordinateInfo?.coordinate?.[0];
  const lat = Number(item?.newLatEntr || item?.latEntr || item?.newLat || item?.lat);
  const lng = Number(item?.newLonEntr || item?.lonEntr || item?.newLon || item?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 30 && lat < 40 && lng > 120 && lng < 135 ? {lat, lng} : null;
}

export function parsePoi(data) {
  const poi = data?.searchPoiInfo?.pois?.poi?.[0];
  const lat = Number(poi?.frontLat || poi?.noorLat), lng = Number(poi?.frontLon || poi?.noorLon);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 30 && lat < 40 && lng > 120 && lng < 135 ? {lat, lng} : null;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// 인터넷이 잠깐 끊기거나 T맵 서버가 잠시 바쁠 때는 두 번 더 시도한다.
export async function request(url, options, fetcher = fetch, delays = [700, 1600]) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetcher(url, options);
    } catch (error) {
      if (attempt < delays.length) {await wait(delays[attempt]); continue}
      throw new Error('인터넷 연결이 불안정해서 T맵에 연결하지 못했어요.');
    }
    if (response.status === 401 || response.status === 403) throw new Error('T맵 앱키 또는 무료 요금제 신청을 확인해 주세요.');
    if (response.status === 429) throw new Error('오늘 T맵 무료 사용량을 다 썼어요. 내일 다시 받을 수 있어요.');
    if (response.status >= 500 && attempt < delays.length) {await wait(delays[attempt]); continue}
    return response;
  }
}

const storage = {
  get(name) {try {return JSON.parse(localStorage.getItem(name) || '{}')} catch {return {}}},
  set(name, value, limit) {
    try {
      const keys = Object.keys(value);
      if (keys.length > limit) for (const k of keys.slice(0, keys.length - limit)) delete value[k];
      localStorage.setItem(name, JSON.stringify(value));
    } catch {}
  },
};

async function lookup(candidate, key, fetcher) {
  const cache = typeof localStorage === 'undefined' ? {} : storage.get(GEO_CACHE);
  const id = candidate.kind + ':' + candidate.q;
  if (cache[id]) return cache[id];
  const url = candidate.kind === 'poi'
    ? `${API}/pois?${new URLSearchParams({version: '1', searchKeyword: candidate.q, count: '1', resCoordType: 'WGS84GEO', reqCoordType: 'WGS84GEO'})}`
    : `${API}/geo/fullAddrGeo?${new URLSearchParams({version: '1', format: 'json', addressFlag: 'F00', coordType: 'WGS84GEO', fullAddr: candidate.q, page: '1', count: '1'})}`;
  const response = await request(url, {headers: {appKey: key, Accept: 'application/json'}}, fetcher);
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const point = candidate.kind === 'poi' ? parsePoi(data) : parseGeocode(data);
  if (point && typeof localStorage !== 'undefined') {cache[id] = point; storage.set(GEO_CACHE, cache, 400)}
  return point;
}

// 후보를 차례로 찾아보고 처음 찾은 좌표를 쓴다.
export async function locate(stopOrAddress, key, fetcher = fetch) {
  for (const candidate of searchCandidates(stopOrAddress)) {
    const point = await lookup(candidate, key, fetcher);
    if (point) return {...point, approx: !!candidate.approx, query: candidate.q};
  }
  return null;
}

export function validTruck(profile) {
  const ranges = {width: [100, 300], height: [100, 600], weight: [500, 600000], totalWeight: [500, 600000], length: [200, 4000]};
  return Object.entries(ranges).every(([field, [min, max]]) => Number(profile?.[field]) >= min && Number(profile?.[field]) <= max);
}

export function routeBody(day, points, profile) {
  const start = points[0], end = points.at(-1);
  const body = {
    reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', startName: '출발', startX: String(start.lng), startY: String(start.lat),
    startTime: `${day.date.replaceAll('-', '')}${day.depart.replace(':', '')}`,
    endName: '귀가', endX: String(end.lng), endY: String(end.lat), searchOption: '0', carType: '4',
    viaPoints: points.slice(1, -1).map((point, i) => ({viaPointId: `stop${i + 1}`, viaPointName: `${i + 1}번`, viaX: String(point.lng), viaY: String(point.lat)})),
  };
  if (validTruck(profile)) Object.assign(body, {
    truckType: '1', truckWidth: String(profile.width), truckHeight: String(profile.height),
    truckWeight: String(profile.weight), truckTotalWeight: String(profile.totalWeight), truckLength: String(profile.length),
  });
  return body;
}

export function routeLines(data) {
  return (data?.features || []).filter(feature => feature?.geometry?.type === 'LineString')
    .map(feature => feature.geometry.coordinates.map(([lng, lat]) => ({lat: Number(lat), lng: Number(lng)})))
    .filter(line => line.length > 1 && line.every(point => Number.isFinite(point.lat) && Number.isFinite(point.lng)));
}

const near = (a, b, km = 1.5) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 88) < km;
const toLeg = (distance, time) => ({km: Math.round(distance / 100) / 10, min: Math.max(1, Math.round(time / 60))});
const clock = s => {const m = String(s || '').match(/^\d{8}(\d{2})(\d{2})(\d{2})?$/); return m ? +m[1] * 60 + +m[2] + (+m[3] || 0) / 60 : null};

// 출발→1번, 1번→2번 … 마지막→귀가 구간별 거리(km)와 시간(분)
export function routeLegs(data, points) {
  const count = points.length - 1;
  const features = data?.features || [];
  const lines = features.filter(feature => feature?.geometry?.type === 'LineString');

  // 1) 응답 순서대로: 출발(S)·경유지(B1, B2…)·도착(E) 점 사이에 있는 선들을 한 구간으로 묶는다.
  const marks = features.filter(f => f?.geometry?.type === 'Point' && /^(S|E|B\d+)$/.test(f.properties?.pointType || ''));
  if (marks.length === count + 1) {
    const sums = Array.from({length: count}, () => ({distance: 0, time: 0}));
    let leg = -1;
    for (const f of features) {
      if (f?.geometry?.type === 'Point' && /^(S|B\d+)$/.test(f.properties?.pointType || '')) leg++;
      else if (f?.geometry?.type === 'LineString' && leg >= 0 && leg < count) {sums[leg].distance += +f.properties?.distance || 0; sums[leg].time += +f.properties?.time || 0}
    }
    // 선에 시간이 없으면 경유지 도착·출발 시각 차이로 채운다.
    sums.forEach((s, i) => {
      if (s.time > 0) return;
      const from = clock(marks[i].properties?.completeTime || marks[i].properties?.arriveTime), to = clock(marks[i + 1].properties?.arriveTime);
      if (from != null && to != null && to >= from) s.time = (to - from) * 60;
    });
    if (sums.every(s => s.time > 0)) return sums.map(s => toLeg(s.distance, s.time));
  }

  // 2) 선 개수가 구간 수와 같으면 그대로
  if (lines.length === count) return lines.map(f => toLeg(+f.properties?.distance || 0, +f.properties?.time || 0));

  // 3) 선 끝이 다음 장소 근처에 닿을 때마다 구간을 끊는다.
  const legs = [];
  let distance = 0, time = 0;
  for (const f of lines) {
    distance += +f.properties?.distance || 0; time += +f.properties?.time || 0;
    const [lng, lat] = f.geometry.coordinates.at(-1) || [];
    if (legs.length < count - 1 && near({lat: +lat, lng: +lng}, points[legs.length + 1])) {legs.push(toLeg(distance, time)); distance = 0; time = 0}
  }
  legs.push(toLeg(distance, time));
  return legs.length === count ? legs : null;
}

// 찾은 장소끼리만 받은 구간을 원래 코스의 구간 자리에 놓는다. 못 찾은 고객 앞뒤 구간은 null.
export function spreadLegs(subLegs, order, stopCount) {
  const full = Array(stopCount + 1).fill(null);
  if (!subLegs) return full;
  subLegs.forEach((leg, j) => {
    const from = order[j], to = order[j + 1];
    if (to === from + 1) full[to] = leg;
  });
  return full;
}

const place = (i, n, stop) => (i < 0 ? '출발지' : i >= n ? '귀가 장소' : `${i + 1}번 ${stop?.name || '고객'}`);

// 출발·귀가·고객 위치를 찾는다. 고객은 못 찾아도 넘어가고, 누구를 못 찾았는지 돌려준다.
export async function resolvePoints(day, key, fetcher = fetch) {
  const start = await locate(day.start, key, fetcher);
  if (!start) throw new Error('출발지 위치를 T맵에서 찾지 못했어요. 출발 장소 주소를 확인해 주세요.');
  const end = await locate(day.end, key, fetcher);
  if (!end) throw new Error('귀가 장소 위치를 T맵에서 찾지 못했어요. 귀가 장소 주소를 확인해 주세요.');
  const stops = [], missing = [];
  for (let i = 0; i < day.list.length; i++) {
    const stop = day.list[i];
    const cached = stop.geoAddr === (stop.mapAddr || stop.addr) && Number.isFinite(stop.lat) ? {lat: stop.lat, lng: stop.lng, approx: !!stop.geoApprox} : null;
    const point = cached || await locate(stop, key, fetcher);
    if (point) stops.push({...point, index: i, id: stop.id, label: String(i + 1)});
    else missing.push({index: i, id: stop.id, name: place(i, day.list.length, stop)});
  }
  return {start: {...start, index: -1, label: '출발'}, end: {...end, index: day.list.length, label: '귀가'}, stops, missing};
}

const legKey = (day, points, profile) => JSON.stringify([day.date, day.depart, validTruck(profile) ? [profile.height, profile.width, profile.length, profile.weight, profile.totalWeight] : 0, points.map(p => [p.lat.toFixed(5), p.lng.toFixed(5)])]);

export async function fetchTmapRoute(day, key, profile, fetcher = fetch, {useCache = true} = {}) {
  if (!day.list.length) throw new Error('배송지가 없습니다.');
  if (day.list.length > 30) throw new Error('경로는 배송지 30곳까지 받을 수 있어요.');
  const found = await resolvePoints(day, key, fetcher);
  const points = [found.start, ...found.stops, found.end];
  const order = points.map(p => p.index);
  const located = Object.fromEntries(found.stops.map(p => [p.id, {lat: p.lat, lng: p.lng, geoApprox: p.approx, geoAddr: day.list[p.index].mapAddr || day.list[p.index].addr}]));
  const cacheKey = legKey(day, points, profile);
  const cache = useCache && typeof localStorage !== 'undefined' ? storage.get(LEG_CACHE) : {};
  if (useCache && cache[cacheKey]) {
    return {points, lines: [], legs: spreadLegs(cache[cacheKey], order, day.list.length), missing: found.missing, located, truck: validTruck(profile), cached: true};
  }
  const response = await request(`${API}/routes/routeSequential30?version=1`, {
    method: 'POST', headers: {appKey: key, Accept: 'application/json', 'Content-Type': 'application/json'},
    body: JSON.stringify(routeBody(day, points, profile)),
  }, fetcher);
  if (!response.ok) throw new Error('T맵 경로를 가져오지 못했어요. 잠시 뒤 "다시 받기"를 눌러 주세요.');
  const data = await response.json();
  const lines = routeLines(data);
  if (!lines.length) throw new Error('T맵이 도로 경로를 돌려주지 않았어요.');
  const subLegs = routeLegs(data, points);
  if (subLegs && typeof localStorage !== 'undefined') {const all = storage.get(LEG_CACHE); all[cacheKey] = subLegs; storage.set(LEG_CACHE, all, 60)}
  return {points, lines, legs: subLegs ? spreadLegs(subLegs, order, day.list.length) : null, missing: found.missing, located, truck: validTruck(profile)};
}

// 구간 결과를 고객별 이동 시간에 저장한다. travelFrom은 그때의 바로 앞 장소라서 순서가 바뀌면 다시 받아야 함을 알 수 있다.
// 못 받은 구간(null)은 이동 시간을 모르는 채로 둔다.
export function applyLegs(day, legs) {
  if (!legs || legs.length !== day.list.length + 1) return day;
  const list = day.list.map((stop, i) => legs[i]
    ? {...stop, travel: legs[i].min, travelKm: legs[i].km, travelFrom: i ? day.list[i - 1].id : 'start'}
    : {...stop, travelKm: undefined, travelFrom: undefined});
  const last = legs.at(-1);
  return last
    ? {...day, list, endTravel: last.min, endTravelKm: last.km, endFrom: day.list.at(-1)?.id || 'start'}
    : {...day, list, endTravelKm: undefined, endFrom: undefined};
}

export function legInfo(day, i) {
  const stop = i < day.list.length ? day.list[i] : null, prev = i ? day.list[i - 1].id : 'start';
  const km = stop ? stop.travelKm : day.endTravelKm, from = stop ? stop.travelFrom : day.endFrom, min = stop ? (stop.travel ?? 30) : (day.endTravel ?? 30);
  if (km == null) return {min, km: null, state: 'default'};
  return {min, km, state: from === prev ? 'tmap' : 'stale'};
}

export const fmtDuration = min => {min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`};

// 출발~귀가 전체 이동 거리·시간. 거리는 모든 구간을 T맵으로 받았을 때만 합산한다.
export function routeTotals(day) {
  const legs = Array.from({length: day.list.length + 1}, (_, i) => legInfo(day, i));
  const km = legs.every(leg => leg.km != null) ? Math.round(legs.reduce((sum, leg) => sum + leg.km, 0) * 10) / 10 : null;
  return {km, min: legs.reduce((sum, leg) => sum + (+leg.min || 0), 0), exact: legs.every(leg => leg.state === 'tmap')};
}

// 추천 코스 계산용: 출발·귀가·고객 좌표. 못 찾은 고객은 pos에 없다.
export async function geocodeDay(day, key, fetcher = fetch) {
  const found = await resolvePoints(day, key, fetcher);
  const pos = {}, cache = {};
  for (const p of found.stops) {
    pos[p.id] = {lat: p.lat, lng: p.lng};
    const stop = day.list[p.index];
    cache[p.id] = {lat: p.lat, lng: p.lng, geoApprox: p.approx, geoAddr: stop.mapAddr || stop.addr};
  }
  return {start: found.start, end: found.end, pos, cache, missing: found.missing};
}
