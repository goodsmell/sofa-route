import { legInfo, fmtDuration, routeTotals } from "./tmapRoute.js";
export const KEY = "sofa-route-v1",
  HISTORY_KEY = "sofa-route-history-v1",
  TABKEY = "sofa-route-tab";
export const SLOT = {
  am: { label: "오전", s: 540, e: 780 },
  pm: { label: "오후", s: 780, e: 1020 },
  any: { label: "시간 지정 없음", s: 540, e: 1020 },
};
export const toMin = (s) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || "");
  return m ? +m[1] * 60 + +m[2] : 480;
};
export const fmt = (m) => {
  m = Math.round(m);
  return (
    String(Math.floor(m / 60)).padStart(2, "0") +
    ":" +
    String(m % 60).padStart(2, "0")
  );
};
export const digits = (s) => String(s || "").replace(/[^0-9+]/g, "");
export const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
export const shiftDate = (date, days) => {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};
export const emptyDay = (date) => ({
  example: false,
  date,
  depart: "06:40",
  start: "그레이박스 (경기 안산시 단원구 해봉로 232)",
  end: "팔곡화물차고지 (경기 안산시 팔곡산단1길 13)",
  endTravel: 30,
  list: [],
  contacts: [],
});
export function restoreDay(stored, storedHistory = {}, current = today()) {
  const history = { ...storedHistory };
  let day = stored && Array.isArray(stored.list) ? stored : emptyDay(current);
  if (day.date) history[day.date] = structuredClone(day);
  day = {
    ...emptyDay(day.date || current),
    ...day,
    contacts: day.contacts || [],
  };
  day.list = day.list.map((customer) =>
    /^0508/.test(digits(customer.phone))
      ? {
          ...customer,
          safePhone: customer.phone,
          phone: "",
          verified: customer.verified !== false,
        }
      : { ...customer, verified: customer.verified !== false },
  );
  return { d: day, h: history };
}
export const normalizePhone = (s) => {
  const d = digits(s);
  return d.length === 11
    ? d.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3")
    : d.length === 12
      ? d.replace(/^(\d{4})(\d{4})(\d{4})$/, "$1-$2-$3")
      : d;
};
export function baseCustomer(x = {}) {
  return {
    id: crypto.randomUUID(),
    source: x.source || "manual",
    imageId: x.imageId || "",
    name: x.name || "",
    addr: x.addr || "",
    phone: x.phone || "",
    safePhone: x.safePhone || "",
    phone2: x.phone2 || "",
    slot: x.slot || "any",
    promiseTime: x.promiseTime || "",
    callMemo: x.callMemo || "",
    callConfirmed: !!x.callConfirmed,
    noelev: !!x.noelev,
    elevSize: x.elevSize || "",
    elevatorKnown: !!x.elevatorKnown,
    bs: !!x.bs,
    single: !!x.single,
    call: !!x.call,
    sorry: !!x.sorry,
    prod: x.prod || "",
    weight: x.weight || "",
    mapAddr: x.mapAddr || "",
    memo: x.memo || "",
    travel: x.travel ?? 30,
    work: x.work || "",
    verified: x.verified !== false,
    done: !!x.done,
    arrivedAt: x.arrivedAt || "",
    doneAt: x.doneAt || "",
  };
}
// 물건 무게(kg). 모르면 null
export const weightKg = (c) => (+c.weight > 0 ? +c.weight : null);
// 한 집에 잡는 시간(이동+작업): 50kg 미만 30분, 50kg 이상이나 무게를 모르면 1시간
export const blockMin = (c) => {
  const w = weightKg(c);
  return w != null && w < 50 ? 30 : 60;
};
// 이동 20분까지는 무게별 기본 시간에 포함한다. 계단·수거·복잡한 제품은 별도 여유를 더한다.
export const serviceMin = (c, travel) => {
  const base = blockMin(c) - Math.min(Math.max(+travel || 0, 0), 20);
  return +c.work > 0 ? Math.max(base, +c.work) : base + workMin(c) - 15;
};
export function workMin(c) {
  if (+c.work > 0) return +c.work;
  let n = /리클라이너|전동/.test(c.prod || "") ? 30 : 15;
  if (c.noelev) n += 15;
  if (c.bs) n += 15;
  if (/스툴/.test(c.prod || "")) n += 5;
  if (/멀티|모듈|유닛/.test(c.prod || "")) n += 10;
  return n;
}
export function softUnmet(c, start) {
  const m = c.memo || "";
  return /가능하면\s*늦게|가장\s*늦게|늦은\s*시간/.test(m) && start < 900
    ? "늦은 방문 요청 확인"
    : /가능하면\s*이르게|가장\s*이르게|이른\s*시간/.test(m) && start > 660
      ? "이른 방문 요청 확인"
      : "";
}
export function visitWindow(c) {
  if (/^\d{2}:\d{2}$/.test(c.promiseTime || "")) {
    const s = toMin(c.promiseTime);
    return { label: c.promiseTime + " 약속", s, e: s + 30 };
  }
  return SLOT[c.slot] || SLOT.any;
}
export function compute(day) {
  let t = toMin(day.depart),
    rows = [];
  for (const c of day.list) {
    const sl = visitWindow(c),
      reach = t + (+c.travel || 0),
      start = c.arrivedAt ? toMin(c.arrivedAt) : Math.max(reach, sl.s),
      wait = start - reach,
      end = start + serviceMin(c, +c.travel || 0),
      flags = [];
    if (start >= sl.e && (c.slot === "am" || c.slot === "pm" || c.promiseTime)) flags.push(["bad", sl.label + " 시간 넘김"]);
    else if (start >= 1020) flags.push(["warn", "17시 넘어 도착"]);
    if (c.noelev) flags.push(["", "엘리베이터 없음"]);
    if (c.bs) flags.push(["", "기존 소파 수거"]);
    if (c.elevSize) flags.push(["", "엘리베이터 " + c.elevSize]);
    if (c.call) flags.push(["call", "전날 전화"]);
    if (c.sorry) flags.push(["call", "양해 전화"]);
    if (softUnmet(c, start)) flags.push(["call", "방문 순서 요청 확인"]);
    if (c.verified === false) flags.push(["warn", "사진 글자 확인"]);
    rows.push({ c, start, end, wait, flags, sl });
    t =
      c.done && /^\d{2}:\d{2}$/.test(c.doneAt || "")
        ? Math.max(toMin(day.depart), toMin(c.doneAt))
        : end;
  }
  return { rows, home: t + (+day.endTravel || 0), last: t };
}
export function precallList(rows) {
  return rows
    .map((r, i) => {
      const c = r.c,
        why = [];
      if (c.done) return null;
      if (
        c.call ||
        /전날|해피콜|진입시간|설치\s*전날|배송\s*전\s*연락/.test(c.memo || "")
      )
        why.push("전날 연락 요청");
      if (r.start >= r.sl.e && (c.slot === "am" || c.slot === "pm" || c.promiseTime)) why.push(r.sl.label + " 약속 · 시간 조율");
      if (r.start >= 1020) why.push("늦은 도착 안내");
      if (c.sorry) why.push("양해 전화");
      if (softUnmet(c, r.start)) why.push(softUnmet(c, r.start));
      return why.length ? { i, c, why } : null;
    })
    .filter(Boolean);
}
export function areaKey(addr) {
  const m = String(addr || "").match(
    /(?:특별시|광역시|특별자치시|도)?\s*([가-힣]+시)\s*([가-힣]+구|[가-힣]+군)?/,
  );
  return m
    ? (m[1] + " " + (m[2] || "")).trim()
    : String(addr || "")
        .split(/\s+/)
        .slice(0, 2)
        .join(" ");
}
function score(day, list) {
  let t = toMin(day.depart),
    score = 0,
    previous = areaKey(day.start);
  for (const c of list) {
    const area = areaKey(c.addr),
      sl = visitWindow(c),
      reach = t + (+c.travel || 30),
      start = Math.max(reach, sl.s);
    if (start >= sl.e && (c.slot === "am" || c.slot === "pm" || c.promiseTime)) score += 10000 + (start - sl.e + 1) * 100;
    score += Math.max(0, start - reach) * 0.3;
    if (area !== previous)
      score += area.split(" ")[0] === previous.split(" ")[0] ? 12 : 30;
    if (/성남시|판교|분당/.test(c.addr) && start < 600) score += 250;
    if (/이천시|여주시|원주시|강원/.test(c.addr) && start >= 720) score += 120;
    if (softUnmet(c, start)) score += 40;
    previous = area;
    t =
      c.done && /^\d{2}:\d{2}$/.test(c.doneAt || "")
        ? toMin(c.doneAt)
        : start + serviceMin(c, +c.travel || 30);
  }
  if (list.length) {
    const last = list.at(-1).addr || "";
    score += /안산시/.test(last) ? 0 : /화성시|수원시/.test(last) ? 35 : 90;
  }
  return score;
}
export function recommendOrder(day) {
  const fixed = day.list.filter((c) => c.done),
    rest = day.list.filter((c) => !c.done);
  if (rest.length < 2) return day;
  const slotOrder = { am: 0, any: 1, pm: 2 };
  let best = rest
    .slice()
    .sort(
      (a, b) =>
        visitWindow(a).s - visitWindow(b).s ||
        slotOrder[a.slot] - slotOrder[b.slot] ||
        areaKey(a.addr).localeCompare(areaKey(b.addr), "ko"),
    );
  if (score(day, [...fixed, ...rest]) < score(day, [...fixed, ...best]))
    best = rest.slice();
  for (let pass = 0; pass < 12; pass++) {
    let candidate = best,
      candidateScore = score(day, [...fixed, ...best]);
    for (let i = 0; i < best.length; i++)
      for (let j = 0; j < best.length; j++) {
        if (i === j) continue;
        const next = best.slice(),
          [item] = next.splice(i, 1);
        next.splice(j, 0, item);
        const value = score(day, [...fixed, ...next]);
        if (value < candidateScore) {
          candidate = next;
          candidateScore = value;
        }
      }
    if (candidate === best) break;
    best = candidate;
  }
  return { ...day, list: [...fixed, ...best] };
}
const same = (a, b) => {
  const clean = (x) => String(x || "").replace(/[^가-힣0-9]/g, "");
  return (
    clean(a.name) &&
    clean(a.name) === clean(b.name) &&
    (clean(a.addr) === clean(b.addr) || a.source !== b.source)
  );
};
export function mergeCustomer(day, c) {
  const next = structuredClone(day),
    matches = next.list.filter((x) => same(x, c)),
    found = matches.length === 1 ? matches[0] : null;
  if (!found && c.source === "list") {
    if (
      !next.contacts.some(
        (x) =>
          x.name.replace(/\s/g, "") === c.name.replace(/\s/g, "") &&
          digits(x.phone) === digits(c.phone),
      )
    )
      next.contacts.push(baseCustomer(c));
    return next;
  }
  if (!found) {
    const person = baseCustomer(c),
      contacts = next.contacts.filter((x) => same(x, person));
    if (contacts.length === 1) {
      person.phone = contacts[0].phone || person.phone;
      next.contacts = next.contacts.filter((x) => x !== contacts[0]);
    }
    next.list.push(person);
    return next;
  }
  for (const f of ["phone", "safePhone", "phone2", "prod", "elevSize", "weight"])
    if (c[f] && !found[f]) found[f] = c[f];
  if (c.elevatorKnown) found.elevatorKnown = true;
  if (c.imageId) found.imageId = c.imageId;
  if (c.addr && c.addr.length > (found.addr || "").length) found.addr = c.addr;
  if (c.slot && (c.source === "form" || c.slot !== "any")) found.slot = c.slot;
  if (c.memo && !found.memo?.includes(c.memo))
    found.memo = [found.memo, c.memo].filter(Boolean).join(" · ");
  for (const f of ["noelev", "bs", "single", "call"])
    found[f] = !!(found[f] || c[f]);
  found.verified = found.verified && c.verified !== false;
  return next;
}
export function fillMissingFormFields(current, read) {
  const next = {...current};
  if (!next.prod && read.prod) next.prod = read.prod;
  if (weightKg(next) == null && weightKg(read) != null) next.weight = read.weight;
  if (!next.noelev && !next.elevSize && !next.elevatorKnown && read.elevatorKnown) {
    next.noelev = !!read.noelev;
    next.elevatorKnown = true;
    next.elevSize = read.elevSize || '';
  }
  return next;
}
export function stopFacts(c) {
  return [
    ["제품", c.prod || "확인 필요"],
    [
      "엘리베이터",
      c.noelev
        ? "없음 · 계단 작업"
        : c.elevSize
          ? "있음 · " + c.elevSize
          : c.elevatorKnown
            ? "있음"
          : "확인 필요",
    ],
    ["무게", weightKg(c) != null ? weightKg(c) + "kg" : "확인 필요"],
    ["기존 소파 수거", c.bs ? "있음" : "없음"],
    ["특이사항", c.memo || "없음"],
  ];
}
const legText = (day, i) => {
  const leg = legInfo(day, i);
  return leg.state === "tmap"
    ? leg.km + "km · " + fmtDuration(leg.min)
    : "확인 전 (T맵 이동시간 받기 필요)";
};
export function courseText(day) {
  const { rows, home } = compute(day),
    calls = precallList(rows),
    line = "━━━━━━━━━━━━━━━━━━━━",
    totals = routeTotals(day),
    out = [
      day.date + " 배송 코스 · " + rows.length + "곳",
      "출발 " + day.depart + " " + day.start,
      "귀가 " + day.end,
      totals.exact
        ? "총 이동 " +
          totals.km +
          "km · " +
          fmtDuration(totals.min) +
          " · 출발~귀가 " +
          fmtDuration(home - toMin(day.depart))
        : "총 이동 확인 전 (T맵 이동시간 받기 필요)",
    ];
  if (calls.length)
    out.push(
      "",
      "[먼저 전화할 곳]",
      ...calls.map(
        (x) =>
          "- " +
          (x.i + 1) +
          "번 " +
          (x.c.name || "고객") +
          ": " +
          x.why.join(", ") +
          (x.c.phone2 ? " · 2차 " + normalizePhone(x.c.phone2) : ""),
      ),
    );
  rows.forEach((r, i) => {
    const c = r.c,
      phones = [
        c.phone && normalizePhone(c.phone),
        c.safePhone && "안심 " + normalizePhone(c.safePhone),
        c.phone2 && "2차 " + normalizePhone(c.phone2),
      ].filter(Boolean);
    out.push(
      "",
      line,
      i +
        1 +
        ". " +
        (c.name || "이름 확인") +
        " · " +
        r.sl.label +
        " · 예상 " +
        fmt(r.start),
      "이동: " + legText(day, i),
      "전화: " + (phones.join(" / ") || "확인 필요"),
      "주소: " + (c.addr || "확인 필요"),
      ...stopFacts(c).map(([k, v]) => k + ": " + v),
    );
    if (c.callMemo) out.push("통화 메모: " + c.callMemo);
  });
  out.push(
    "",
    line,
    "이동: " + legText(day, rows.length),
    "→ 귀가 " + fmt(home) + " " + day.end,
  );
  return out.join("\n");
}

// "경기도 성남시 분당구 방아로29번길 7, 103동 (이매동, 동양파크빌)" → "성남시 분당구 이매동"
export function shortArea(addr) {
  const text = String(addr || "");
  const city = text.match(/([가-힣]+(?:시|군))(?=\s)/)?.[1] || "";
  const gu = text.match(/\s([가-힣]+구)(?=\s)/)?.[1] || "";
  const dong =
    text.match(/\(([가-힣0-9]+(?:동|읍|면|리|가))(?=[,)\s])/)?.[1] ||
    text.match(/\s([가-힣]+[0-9]*(?:동|읍|면))(?=[\s,]|$)/)?.[1] ||
    "";
  const parts = [/특별시|광역시/.test(city) ? "" : city, gu, dong].filter(Boolean);
  return parts.join(" ") || text.split(",")[0];
}
