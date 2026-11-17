import { legInfo, fmtDuration, routeTotals, GEO_VERSION, invalidateAddress } from "./tmapRoute.js";
import { workMin } from "./timeRules.js";
import {documentTypeLabel, documentDateLabel, documentAddressLabel, documentSpecificFields} from './documentTypes.js';
export { workMin } from "./timeRules.js";
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
  end: "팔곡화물차고지 (경기 안산시 상록구 팔곡산단1길 13)",
  endTravel: 30,
  list: [],
  contacts: [],
  imports: [],
});
export function deleteCustomer(day, id) {
  const customer = day.list.find((item) => item.id === id);
  if (!customer) return day;
  const imports = (day.imports || day.list.filter((item) => item.source === "form"))
    .filter((item) => item.id !== id && !(customer.imageId && item.imageId === customer.imageId && item.name === customer.name));
  return {
    ...day,
    list: day.list.filter((item) => item.id !== id).map((item) => ({
      ...item, travel: 30, travelKm: undefined, travelFrom: undefined, travelVersion: undefined,
    })),
    imports,
    plans: null,
    phase: day.list.length === 1 ? "draft" : day.phase,
    endTravel: 30, endTravelKm: undefined, endFrom: undefined, endTravelVersion: undefined,
  };
}
export function deleteDayCustomers(day) {
  return { ...day, list: [], contacts: [], imports: [], plans: null, phase: "draft",
    endTravel: 30, endTravelKm: undefined, endFrom: undefined, endTravelVersion: undefined };
}
export function restoreDay(stored, storedHistory = {}, current = shiftDate(today(), 1)) {
  const history = { ...storedHistory };
  const staleEmptyDay = stored?.date < current &&
    Array.isArray(stored.list) && !stored.list.length &&
    !stored.imports?.length && !stored.contacts?.length;
  let day = stored && Array.isArray(stored.list) && !staleEmptyDay ? stored : emptyDay(current);
  day = {
    ...emptyDay(day.date || current),
    ...day,
    contacts: day.contacts || [],
    imports: day.imports || day.list.filter((customer) => customer.source === "form"),
  };
  if (day.end === "팔곡화물차고지 (경기 안산시 팔곡산단1길 13)") {
    day.end = "팔곡화물차고지 (경기 안산시 상록구 팔곡산단1길 13)";
    day.plans = null;
    day.endTravelKm = undefined;
    day.endFrom = undefined;
    day.endTravelVersion = undefined;
  }
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
  for (const customer of day.list) {
    if (customer.source === 'manual') continue;
    const corrected = normalizeOcrAddress(customer.addr);
    if (corrected !== customer.addr) day = invalidateAddress(day, customer.id, {addr: corrected});
  }
  if (day.date) history[day.date] = structuredClone(day);
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
export const normalizeOcrAddress = (value) => String(value || '').replace(/충부대로/g, '중부대로');
export function baseCustomer(x = {}) {
  return {
    id: crypto.randomUUID(),
    source: x.source || "manual",
    documentType: x.documentType || "",
    imageId: x.imageId || "",
    name: x.name || "",
    addr: x.addr || "",
    fromAddr: x.fromAddr || "",
    toAddr: x.toAddr || "",
    requestReason: x.requestReason || "",
    requestDetails: x.requestDetails || "",
    orderNo: x.orderNo || "",
    siteNo: x.siteNo || "",
    phone: x.phone || "",
    safePhone: x.safePhone || "",
    phone2: x.phone2 || "",
    installDate: x.installDate || "",
    slot: x.slot || "any",
    promiseTime: x.promiseTime || "",
    callMemo: x.callMemo || "",
    callConfirmed: !!x.callConfirmed,
    noelev: !!x.noelev,
    elevSize: x.elevSize || "",
    elevatorKnown: !!x.elevatorKnown,
    ladderNeeded: !!x.ladderNeeded,
    ladderKnown: !!x.ladderKnown,
    bs: !!x.bs,
    single: !!x.single,
    call: !!x.call,
    sorry: !!x.sorry,
    prod: x.prod || "",
    productRows: x.productRows || [],
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
// 현장 작업 시간만 반환한다. 이동은 방문 시각을 계산할 때 따로 더한다.
export const serviceMin = (c) => workMin(c);
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
  for (const [index, c] of day.list.entries()) {
    const travel = legInfo(day, index).min;
    const sl = visitWindow(c),
      reach = t + travel,
      start = c.arrivedAt ? toMin(c.arrivedAt) : Math.max(reach, sl.s),
      wait = start - reach,
      end = start + serviceMin(c, travel),
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
    rows.push({ c, start, end, wait, flags, sl, travel });
    t =
      c.done && /^\d{2}:\d{2}$/.test(c.doneAt || "")
        ? Math.max(toMin(day.depart), toMin(c.doneAt))
        : end;
  }
  return { rows, home: t + legInfo(day, day.list.length).min, last: t };
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
      travel = c.travelKm != null && c.travelVersion !== GEO_VERSION ? 30 : (+c.travel || 30),
      reach = t + travel,
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
        : start + serviceMin(c, travel);
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
    (!a.documentType || !b.documentType || a.documentType === b.documentType) &&
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
  for (const f of ["phone", "safePhone", "phone2", "installDate", "prod", "elevSize", "weight", "documentType", "fromAddr", "toAddr", "requestReason", "requestDetails", "orderNo", "siteNo"])
    if (c[f] && !found[f]) found[f] = c[f];
  if (c.productRows?.length && !found.productRows?.length) found.productRows = c.productRows;
  if (c.elevatorKnown) found.elevatorKnown = true;
  if (c.ladderKnown && !found.ladderKnown) { found.ladderKnown = true; found.ladderNeeded = !!c.ladderNeeded; }
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
export function applyPhotoImports(day, items) {
  const forms = items.filter((item) => item.source === "form");
  const contacts = items.filter((item) => item.source === "list");
  let next = structuredClone(day);
  next.imports = (next.imports || next.list.filter((item) => item.source === "form"))
    .filter((item) => item.source === "form");
  for (const form of forms) next = mergeCustomer(next, { ...form, verified: true });
  const clean = (name) => String(name || "").replace(/\s/g, "");
  const unmatched = [];
  let matched = 0;
  const contactNumbers = new Map();
  for (const contact of contacts) {
    const name = clean(contact.name);
    const numbers = contactNumbers.get(name) || new Set();
    numbers.add(digits(normalizePhone(contact.phone)));
    contactNumbers.set(name, numbers);
  }
  for (const contact of contacts) {
    const phone = normalizePhone(contact.phone);
    const candidates = next.list.filter((item) => item.source === "form" && clean(item.name) === clean(contact.name));
    if (candidates.length !== 1 || contactNumbers.get(clean(contact.name)).size !== 1 || !/^010\d{8}$/.test(digits(phone))) {
      unmatched.push(contact);
      continue;
    }
    candidates[0].phone = phone;
    matched++;
    next.imports = next.imports.map((item) =>
      clean(item.name) === clean(candidates[0].name) && item.addr === candidates[0].addr
        ? { ...item, phone }
        : item,
    );
  }
  next.imports.push(...forms.map((form) => {
    const customer = next.list.find((item) => item.source === "form" && clean(item.name) === clean(form.name) && item.addr === form.addr && item.documentType === form.documentType);
    return { ...form, phone: customer?.phone || form.phone, verified: true };
  }));
  return { day: next, matched, unmatched, formsAdded: forms.length };
}
export function fillMissingFormFields(current, read) {
  const next = {...current};
  for (const field of ['documentType','fromAddr','toAddr','requestReason','requestDetails','orderNo','siteNo'])
    if (!next[field] && read[field]) next[field] = read[field];
  if (!next.prod && read.prod) next.prod = read.prod;
  if (!next.productRows?.length && read.productRows?.length) next.productRows = read.productRows;
  if (!next.installDate && read.installDate) next.installDate = read.installDate;
  if (!next.ladderKnown && read.ladderKnown) { next.ladderKnown = true; next.ladderNeeded = !!read.ladderNeeded; }
  if (weightKg(next) == null && weightKg(read) != null) next.weight = read.weight;
  if (!next.noelev && !next.elevSize && !next.elevatorKnown && read.elevatorKnown) {
    next.noelev = !!read.noelev;
    next.elevatorKnown = true;
    next.elevSize = read.elevSize || '';
  }
  return next;
}
export function stopFacts(c) {
  const type = c.documentType || 'dispatch';
  const facts = [
    ['문서', documentTypeLabel(type)],
    [documentDateLabel(type), c.installDate || '확인 필요'],
    [documentAddressLabel(type), c.addr || '확인 필요'],
    ...documentSpecificFields(c),
  ];
  if (['dispatch','return','incident'].includes(type) && (c.productRows?.length || c.prod || type === 'dispatch'))
    facts.push(["제품", c.productRows?.length ? c.productRows.join(" · ") : c.prod || "확인 필요"]);
  if (type === 'dispatch') facts.push(
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
    ["사다리차", c.ladderKnown ? c.ladderNeeded ? "필요" : "불필요" : "확인 필요"],
    ["기존 소파 수거", c.bs ? "있음" : "없음"],
  );
  if (c.memo) facts.push(["특이사항", c.memo]);
  return facts;
}
// 코스 복사 때 고객마다 넣는 항목 (주소·전화 다음 순서대로)
const COPY_FIELDS = ["주문·요청번호", "제품", "엘리베이터", "무게", "사다리차", "기존 소파 수거", "특이사항"];
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
      "주소: " + (c.addr || "확인 필요"),
      "전화: " + (phones.join(" / ") || "확인 필요"),
      ...stopFacts(c)
        .filter(([k]) => COPY_FIELDS.includes(k))
        .map(([k, v]) => k + ": " + v),
    );
  });
  out.push("", line, "→ 귀가 " + fmt(home) + " " + day.end);
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
