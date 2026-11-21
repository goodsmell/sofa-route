// 지도 핀 묶기: 같은 자리(같은 주소)의 배송지는 핀 하나로, 겹쳐 보이는 핀은 누를 때 고르게 한다.

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

// 화면에서 radiusPx 안에 겹쳐 보이는 배송지 번호들 (같은 자리 포함)
export function nearbyStops(spots, at, zoom, radiusPx = 40) {
  const metersPerPx = (156543.03392 * Math.cos((at.lat * Math.PI) / 180)) / 2 ** zoom;
  const limit = radiusPx * metersPerPx;
  return spots
    .filter((s) => s.stops.length && meters(s, at) <= limit)
    .flatMap((s) => s.stops)
    .sort((a, b) => a - b);
}
