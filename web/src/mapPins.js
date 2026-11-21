// 지도 핀 묶기: 같은 자리(같은 주소)의 배송지와 화면에서 겹쳐 보이는 배송지를 핀 하나로 묶는다.

const spotKey = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`; // 약 1m 안이면 같은 자리

export function pinLabel(labels) {
  if (labels.length <= 3) return labels.join("·");
  return `${labels[0]}·${labels[1]} 외 ${labels.length - 2}`;
}

// points: [{lat, lng, index, label}] — index가 고객 범위 밖이면 출발·귀가 점
export function groupPins(points, stopCount) {
  const spots = new Map();
  for (const p of points) {
    const key = spotKey(p);
    if (!spots.has(key)) spots.set(key, { lat: p.lat, lng: p.lng, stops: [], ends: [] });
    const spot = spots.get(key);
    const isStop = p.index >= 0 && p.index < stopCount;
    if (isStop) {
      if (!spot.stops.includes(p.index)) spot.stops.push(p.index);
    } else if (!spot.ends.includes(p.label)) spot.ends.push(p.label);
  }
  return [...spots.values()].map((spot) => {
    spot.stops.sort((a, b) => a - b);
    return {
      ...spot,
      label: spot.stops.length ? pinLabel(spot.stops.map((i) => String(i + 1))) : spot.ends.join("·"),
    };
  });
}

const meters = (a, b) => {
  const lat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (b.lng - a.lng) * Math.cos(lat) * 111320;
  const dy = (b.lat - a.lat) * 110540;
  return Math.hypot(dx, dy);
};

// 지금 확대 정도에서 화면상 radiusPx 안에 겹치는 배송지 핀을 하나로 묶는다.
// 출발·귀가 핀은 묶지 않는다. 확대하면 다시 따로 보인다.
export function clusterSpots(spots, zoom, radiusPx = 34) {
  const ends = spots.filter((s) => !s.stops.length);
  const clusters = [];
  for (const spot of spots.filter((s) => s.stops.length).sort((a, b) => a.stops[0] - b.stops[0])) {
    const metersPerPx = (156543.03392 * Math.cos((spot.lat * Math.PI) / 180)) / 2 ** zoom;
    const near = clusters.find((c) => c.members.some((m) => meters(m, spot) <= radiusPx * metersPerPx));
    if (near) near.members.push(spot);
    else clusters.push({ members: [spot] });
  }
  const merged = clusters.map(({ members }) => {
    const stops = members.flatMap((m) => m.stops).sort((a, b) => a - b);
    const weight = (m) => m.stops.length;
    const total = stops.length;
    return {
      lat: members.reduce((n, m) => n + m.lat * weight(m), 0) / total,
      lng: members.reduce((n, m) => n + m.lng * weight(m), 0) / total,
      stops,
      ends: [],
      label: pinLabel(stops.map((i) => String(i + 1))),
    };
  });
  return [...ends, ...merged];
}
