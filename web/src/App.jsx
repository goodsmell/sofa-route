import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KEY,
  HISTORY_KEY,
  TABKEY,
  today,
  emptyDay,
  restoreDay,
  baseCustomer,
  normalizePhone,
  compute,
  precallList,
  recommendOrder,
  mergeCustomer,
  courseText,
} from "./logic.js";
import {
  loadOCR,
  parseFormOCR,
  readFormFields,
  parseTableOCR,
  imageCanvas,
} from "./ocr.js";
import { saveDocument, loadDocument, deleteDocuments } from "./imageStore.js";
import DocumentViewer from "./DocumentViewer.jsx";
import AiSetup from "./AiSetup.jsx";
import RouteMap from "./RouteMap.jsx";
import { planWithGemini } from "./routeAI.js";
import RouteView from "./RouteView.jsx";
import DriveView from "./DriveView.jsx";
import { fetchTmapRoute, applyLegs, legInfo, geocodeDay } from "./tmapRoute.js";
import {
  driverOrder,
  customerOrder,
  balancedOrder,
  applyPlan,
  planDay,
  calculateRecommendedLegs,
  sortByFixed,
  movePlan,
  planKey,
} from "./plan.js";

const read = (k, f) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? f;
  } catch {
    return f;
  }
};
const init = () => restoreDay(read(KEY, null), read(HISTORY_KEY, {}));
const labelDate = (s) => {
  const d = new Date(s + "T00:00:00");
  return (
    d.getMonth() +
    1 +
    "월 " +
    d.getDate() +
    "일(" +
    "일월화수목금토"[d.getDay()] +
    ")"
  );
};
const tmap = (s) => "tmap://search?name=" + encodeURIComponent(s);
const blank = () => baseCustomer();
const AI_KEY = "sofa-route-gemini-key-v1",
  TMAP_KEY = "sofa-route-tmap-key-v1",
  TRUCK_KEY = "sofa-route-truck-v1";
const TabIcon = ({ name }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {name === "order" ? (
      <>
        <path d="M8 6h11M8 12h11M8 18h11" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </>
    ) : name === "add" ? (
      <>
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <circle cx="12" cy="13" r="3.5" />
        <path d="M9 6l1.5-2h3L15 6" />
      </>
    ) : name === "map" ? (
      <>
        <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
        <path d="M9 4v14M15 6v14" />
      </>
    ) : (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    )}
  </svg>
);
const Field = ({ label, value, onChange, type = "text", placeholder = "" }) => (
  <label className="field">
    <span>{label}</span>
    <input
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);

export default function App() {
  const initial = useRef(null);
  if (!initial.current) initial.current = init();
  const [day, setDay] = useState(initial.current.d),
    [history, setHistory] = useState(initial.current.h);
  const [tab, setTab] = useState(() => {
    const t = localStorage.getItem(TABKEY);
    return ["add", "order", "drive", "map", "calendar"].includes(t)
      ? t
      : initial.current.d.list.length
        ? "order"
        : "add";
  });
  const [draft, setDraft] = useState(blank),
    [editing, setEditing] = useState(null),
    [pending, setPending] = useState([]),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [storageError, setStorageError] = useState(""),
    [selected, setSelected] = useState(day.date),
    [month, setMonth] = useState(day.date.slice(0, 7)),
    [armed, setArmed] = useState(false);
  const [viewer, setViewer] = useState(null),
    [documentUrl, setDocumentUrl] = useState(""),
    [documentStatus, setDocumentStatus] = useState(""),
    [zoom, setZoom] = useState(100);
  const [aiKey, setAiKey] = useState(
    () => sessionStorage.getItem(AI_KEY) || localStorage.getItem(AI_KEY) || "",
  );
  const [aiSetup, setAiSetup] = useState(false),
    [keyDraft, setKeyDraft] = useState(""),
    [rememberKey, setRememberKey] = useState(false),
    [aiBusy, setAiBusy] = useState(false),
    [legBusy, setLegBusy] = useState(false);
  const dayRef = useRef(day);
  const timer = useRef(null),
    calc = useMemo(() => compute(day), [day]),
    calls = useMemo(() => precallList(calc.rows), [calc]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(day));
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify({ ...history, [day.date]: day }),
      );
      setStorageError("");
    } catch {
      setStorageError(
        "이 브라우저에 기록을 저장하지 못했습니다. Chrome에서 다시 열어 주세요.",
      );
    }
  }, [day, history]);
  useEffect(() => localStorage.setItem(TABKEY, tab), [tab]);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);
  useEffect(() => {
    if (!viewer) return;
    let active = true,
      url = "";
    setDocumentUrl("");
    setDocumentStatus(
      viewer.imageId
        ? "불러오는 중…"
        : "저장된 출고표가 없습니다. 사진을 다시 넣어 주세요.",
    );
    setZoom(100);
    if (viewer.imageId)
      loadDocument(viewer.imageId)
        .then((record) => {
          if (!active) return;
          if (!record?.image) {
            setDocumentStatus(
              "저장된 출고표가 없습니다. 사진을 다시 넣어 주세요.",
            );
            return;
          }
          url = URL.createObjectURL(record.image);
          setDocumentUrl(url);
          setDocumentStatus("");
        })
        .catch(() => {
          if (active) setDocumentStatus("출고표를 열지 못했습니다.");
        });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [viewer]);
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e) => {
      if (e.key === "Escape") setViewer(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [viewer]);
  const flash = (s) => {
    setToast(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3000);
  };
  async function copyText(value, label) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      if (!ok) {
        flash("복사하지 못했어요.");
        return;
      }
    }
    flash(label + " 복사됨");
  }
  const change = (k, v) => setDraft((c) => ({ ...c, [k]: v }));
  const update = (id, patch) =>
    setDay((d) => ({
      ...d,
      list: d.list.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  const switchTab = (t) => {
    setTab(t);
    window.scrollTo(0, 0);
  };
  const openDocument = (c) =>
    setViewer({ name: c.name || "고객", imageId: c.imageId || "" });
  const routeSig = (d) =>
    JSON.stringify([
      d.date,
      d.depart,
      d.start,
      d.end,
      d.list.map((c) => [c.id, c.addr, c.mapAddr || ""]),
    ]);
  // 못 찾은 고객 표시와 찾은 좌표를 고객에 저장
  const markLocated = (list, route) =>
    list.map((c) =>
      route.located?.[c.id]
        ? { ...c, ...route.located[c.id], geoMissing: false }
        : route.missing?.some((m) => m.id === c.id)
          ? { ...c, geoMissing: true }
          : c,
    );
  const missingNote = (route) =>
    route.missing?.length
      ? route.missing
          .map((m) => m.name)
          .slice(0, 3)
          .join(", ") +
        (route.missing.length > 3
          ? " 외 " + (route.missing.length - 3) + "곳"
          : "") +
        ' 주소를 T맵에서 못 찾았어요. 카드에서 "T맵 검색용 주소"를 넣어 주세요.'
      : "";
  const signature = (d) =>
    JSON.stringify({
      date: d.date,
      depart: d.depart,
      start: d.start,
      end: d.end,
      list: d.list.map((c) => [
        c.id,
        c.addr,
        c.slot,
        c.promiseTime,
        c.travel,
        c.work,
        c.done,
      ]),
    });
  // 처음 추천을 만들 때 세 코스의 도로 구간 시간도 함께 계산한다.
  async function makePlans(baseDay = day, quiet = false) {
    const rest = baseDay.list.filter((c) => !c.done);
    if (rest.length < 2) {
      if (!quiet) flash("배송지가 2곳 이상일 때 추천 코스를 만들 수 있어요.");
      return;
    }
    setAiBusy(true);
    try {
      const key = localStorage.getItem(TMAP_KEY);
      let geo = null;
      if (key) {
        try {
          geo = await geocodeDay(baseDay, key);
          const note = missingNote(geo);
          if (note && !quiet) flash(note);
        } catch (error) {
          if (!quiet) flash(error.message);
        }
      }
      const lastDone = baseDay.list.filter((c) => c.done).at(-1),
        from = geo && ((lastDone && geo.pos[lastDone.id]) || geo.start);
      const driver = geo
        ? {
            ids: driverOrder(rest, from, geo.end, geo.pos).map((c) => c.id),
            by: "map",
          }
        : null;
      const balanced = geo
        ? {
            ids: balancedOrder(baseDay, rest, from, geo.end, geo.pos).map(
              (c) => c.id,
            ),
            by: "map",
          }
        : null;
      let customer = null;
      if (aiKey) {
        try {
          const next = await planWithGemini(baseDay, aiKey);
          customer = {
            ids: next.list.filter((c) => !c.done).map((c) => c.id),
            by: "ai",
          };
        } catch (error) {
          if (!quiet) flash(error.message);
        }
      }
      if (!customer)
        customer = geo
          ? {
              ids: customerOrder(baseDay, rest, from, geo.end, geo.pos).map(
                (c) => c.id,
              ),
              by: "map",
            }
          : {
              ids: recommendOrder(baseDay)
                .list.filter((c) => !c.done)
                .map((c) => c.id),
              by: "rule",
            };
      const cache = geo?.cache || {};
      const plans = {
        customer,
        driver,
        balanced,
        at: new Date().toTimeString().slice(0, 5),
        geo: geo ? { start: from, end: geo.end } : null,
      };
      const next = {
        ...baseDay,
        list: baseDay.list.map((c) =>
          cache[c.id] ? { ...c, ...cache[c.id] } : c,
        ),
        plans,
      };
      let located = {};
      let failed = 0;
      if (key) {
        let profile = { height: "340", weight: "3500" };
        try {
          profile = { ...profile, ...JSON.parse(localStorage.getItem(TRUCK_KEY) || "{}") };
        } catch {}
        setLegBusy(true);
        try {
          const result = await calculateRecommendedLegs(next, (ordered) =>
            fetchTmapRoute(ordered, key, profile, fetch, { useCache: false }),
          );
          Object.assign(plans, result.plans);
          located = result.located;
          failed = result.errors.length;
        } finally {
          setLegBusy(false);
        }
      }
      setDay((d) => routeSig(d) === routeSig(baseDay) ? ({
        ...d,
        list: d.list.map((c) => ({
          ...c,
          ...(cache[c.id] || {}),
          ...(located[c.id] || {}),
        })),
        plans,
      }) : d);
      if (!quiet) flash(!key ? "추천을 만들었어요. 구간 시간은 T맵 연결 후 계산할 수 있어요." : failed ? `추천은 만들었지만 ${failed}개 코스의 구간 시간을 받지 못했어요.` : "세 코스의 추천과 구간 시간을 만들었어요.");
    } finally {
      setAiBusy(false);
    }
  }
  // 추천 코스 순서 그대로 T맵 구간 시간을 받아 그 추천에 붙여 둔다
  async function fetchPlanLegs(kind, baseDay = dayRef.current) {
    const key = localStorage.getItem(TMAP_KEY),
      plan = baseDay.plans?.[kind];
    if (!key || !plan) return;
    let profile = { height: "340", weight: "3500" };
    try {
      profile = {
        ...profile,
        ...JSON.parse(localStorage.getItem(TRUCK_KEY) || "{}"),
      };
    } catch {}
    const ordered = applyPlan(baseDay, plan.ids),
      wanted = planKey(ordered);
    setLegBusy(true);
    try {
      const route = await fetchTmapRoute(ordered, key, profile, fetch, {
        useCache: false,
      });
      if (!route.legs)
        throw new Error(
          'T맵 구간 시간을 읽지 못했어요. "다시 받기"를 눌러 주세요.',
        );
      setDay((d) => {
        if (routeSig(d) !== routeSig(baseDay)) return d;
        const p = d.plans?.[kind];
        const next = { ...d, list: markLocated(d.list, route) };
        if (!p || planKey(applyPlan(d, p.ids)) !== wanted || routeSig(applyPlan(d, p.ids)) !== routeSig(ordered)) return next;
        return {
          ...next,
          plans: {
            ...d.plans,
            [kind]: { ...p, legs: route.legs, legsKey: wanted, timeError: "" },
          },
        };
      });
    } catch (error) {
      setDay((d) => routeSig(d) === routeSig(baseDay) && d.plans?.[kind] ? ({...d, plans: {...d.plans, [kind]: {...d.plans[kind], timeError: error.message || "T맵 이동 시간을 받지 못했어요."}}}) : d);
      flash(error.message || "T맵 이동 시간을 받지 못했어요.");
    } finally {
      setLegBusy(false);
    }
  }
  async function fetchLegs(baseDay = day, quiet = false) {
    const key = localStorage.getItem(TMAP_KEY);
    if (!key) {
      if (!quiet) {
        flash("지도 탭에서 T맵 앱키를 먼저 넣어 주세요.");
        switchTab("map");
      }
      return;
    }
    if (!baseDay.list.length) return;
    let profile = { height: "340", weight: "3500" };
    try {
      profile = {
        ...profile,
        ...JSON.parse(localStorage.getItem(TRUCK_KEY) || "{}"),
      };
    } catch {}
    setLegBusy(true);
    try {
      const route = await fetchTmapRoute(baseDay, key, profile, fetch, {
        useCache: false,
      });
      if (!route.legs)
        throw new Error(
          'T맵 구간 시간을 읽지 못했어요. "다시 받기"를 눌러 주세요.',
        );
      setDay((d) => {
        const next = { ...d, list: markLocated(d.list, route) };
        return routeSig(d) === routeSig(baseDay)
          ? applyLegs(next, route.legs)
          : next;
      });
      const note = missingNote(route);
      if (note) flash(note);
      else if (!quiet) flash("T맵 이동 시간을 반영했어요.");
    } catch (error) {
      flash(error.message || "T맵 이동 시간을 받지 못했어요.");
    } finally {
      setLegBusy(false);
    }
  }
  const legsReady =
      day.list.length > 0 &&
      Array.from(
        { length: day.list.length + 1 },
        (_, i) => legInfo(day, i).state,
      ).every((x) => x === "tmap"),
    tmapReady = !!localStorage.getItem(TMAP_KEY);
  function connectAI() {
    const key = keyDraft.trim();
    if (!key) return;
    sessionStorage.setItem(AI_KEY, key);
    if (rememberKey) localStorage.setItem(AI_KEY, key);
    else localStorage.removeItem(AI_KEY);
    setAiKey(key);
    setAiSetup(false);
  }
  function forgetAI() {
    sessionStorage.removeItem(AI_KEY);
    localStorage.removeItem(AI_KEY);
    setAiKey("");
    setKeyDraft("");
    flash("AI 키를 지웠어요.");
  }
  function openDay(date, nextTab = "order") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setHistory((h) => ({ ...h, [day.date]: day }));
    setDay(
      structuredClone(
        date === day.date ? day : history[date] || emptyDay(date),
      ),
    );
    setSelected(date);
    setMonth(date.slice(0, 7));
    setPending([]);
    setEditing(null);
    setDraft(blank());
    switchTab(nextTab);
  }
  async function deletePastDates(dates) {
    const records = { ...history, [day.date]: day };
    const targets = dates.filter(
      (date) => date < today() && records[date]?.list?.length,
    );
    if (!targets.length) return;
    if (
      !confirm(
        targets.length === 1
          ? `${labelDate(targets[0])} 배송 기록을 삭제할까요?`
          : `지난 배송 기록 ${targets.length}일을 모두 삭제할까요?`,
      )
    )
      return;
    const nextHistory = { ...records };
    for (const date of targets) delete nextHistory[date];
    const nextDay = targets.includes(day.date)
      ? structuredClone(nextHistory[today()] || emptyDay(today()))
      : day;
    const remainingImages = new Set(
      [nextDay, ...Object.values(nextHistory)].flatMap((record) =>
        record.list.map((stop) => stop.imageId).filter(Boolean),
      ),
    );
    const removedImages = targets.flatMap((date) =>
      records[date].list
        .map((stop) => stop.imageId)
        .filter((id) => id && !remainingImages.has(id)),
    );
    setHistory(nextHistory);
    setDay(nextDay);
    if (targets.includes(selected)) {
      setSelected(today());
      setMonth(today().slice(0, 7));
    }
    try {
      await deleteDocuments(removedImages);
    } catch {
      flash("기록은 삭제됐지만 일부 사진은 기기에 남아 있을 수 있어요.");
      return;
    }
    flash(
      targets.length === 1
        ? "배송 기록을 삭제했어요."
        : "지난 배송 기록을 모두 삭제했어요.",
    );
  }
  function save() {
    if (!draft.name.trim() || !draft.addr.trim()) {
      flash("고객 이름과 주소를 적어 주세요.");
      return;
    }
    const c = {
      ...draft,
      name: draft.name.trim(),
      addr: draft.addr.trim(),
      phone: normalizePhone(draft.phone),
      safePhone: normalizePhone(draft.safePhone),
      phone2: normalizePhone(draft.phone2),
      verified: true,
    };
    const next = editing
      ? { ...day, list: day.list.map((x) => (x.id === editing ? c : x)) }
      : recommendOrder({ ...day, list: [...day.list, c] });
    setDay(next);
    setDraft(blank());
    setEditing(null);
    switchTab("order");
    flash("고객 정보를 저장했어요.");
  }
  function edit(c) {
    setDraft({ ...c });
    setEditing(c.id);
    switchTab("add");
    setTimeout(
      () =>
        document
          .getElementById("add-panel")
          ?.scrollIntoView({ behavior: "smooth" }),
      30,
    );
  }
  function commit(items) {
    const ready = items.filter(
        (c) => c.name.trim() && (c.source === "list" || c.addr.trim()),
      ),
      missing = items.filter(
        (c) => !c.name.trim() || (c.source !== "list" && !c.addr.trim()),
      );
    ready.sort((a, b) => (a.source === "list") - (b.source === "list"));
    let next = structuredClone(day);
    for (const c of ready) next = mergeCustomer(next, c);
    next = recommendOrder(next);
    setDay(next);
    setPending(missing);
    if (next.list.length) switchTab("order");
    flash(ready.length + "건을 읽었어요. 주소와 번호를 확인해 주세요.");
    return { next, missing };
  }
  async function importImages(files) {
    if (!files.length) return;
    setBusy(true);
    setStatus("글자 읽기 도구 준비 중…");
    let worker;
    try {
      const OCR = await loadOCR();
      worker = await OCR.createWorker(["kor", "eng"], 1, {
        logger: (m) => {
          if (m.status === "recognizing text")
            setStatus(
              "사진 글자 읽는 중… " + Math.round((m.progress || 0) * 100) + "%",
            );
        },
      });
      const results = [];
      let imageSaveFailed = false;
      for (let i = 0; i < files.length; i++) {
        setStatus("사진 " + (i + 1) + "/" + files.length + " 읽는 중…");
        const canvas = await imageCanvas(files[i]),
          { data } = await worker.recognize(canvas);
        if (canvas.isForm) {
          let c = parseFormOCR(
            data,
            canvas.width,
            canvas.fullHeight,
            files[i].name,
          );
          c = await readFormFields(worker, canvas, c);
          try {
            c.imageId = await saveDocument(files[i]);
          } catch {
            imageSaveFailed = true;
          }
          results.push(c);
        } else
          results.push(
            ...parseTableOCR(
              data,
              canvas.width,
              canvas.fullHeight,
              files[i].name,
            ),
          );
      }
      const { next, missing } = commit([...pending, ...results]);
      setStatus(
        files.length +
          "장 읽음 · " +
          next.list.length +
          "곳 코스 · 확인 필요 " +
          missing.length +
          "건" +
          (imageSaveFailed ? " · 출고표 사진 저장 실패" : ""),
      );
    } catch (e) {
      setStatus(
        "읽기 실패: " +
          (e.message || e) +
          " 사진을 다시 찍거나 직접 입력해 주세요.",
      );
    } finally {
      if (worker) await worker.terminate();
      setBusy(false);
    }
  }
  function move(from, to) {
    if (from === to || to < 0 || to >= day.list.length) return;
    setDay((d) => {
      const list = d.list.slice(),
        [c] = list.splice(from, 1);
      list.splice(to, 0, c);
      return { ...d, list };
    });
  }
  const chosen = selected === day.date ? day : history[selected],
    pastDates = Object.keys({ ...history, [day.date]: day }).filter(
      (date) =>
        date < today() && { ...history, [day.date]: day }[date]?.list?.length,
    ),
    md = new Date(month + "-01T00:00:00"),
    year = md.getFullYear(),
    mon = md.getMonth(),
    offset = md.getDay(),
    days = new Date(year, mon + 1, 0).getDate();
  const changeMonth = (n) => {
    const d = new Date(year, mon + n, 1);
    setMonth(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  };
  return (
    <>
      <div className="wrap">
        <header>
          <label className="header-date-picker">
            <h1>{labelDate(day.date)}</h1>
            <span aria-hidden="true">날짜 변경 ▾</span>
            <input
              type="date"
              aria-label="배송 날짜 바꾸기"
              value={day.date}
              onChange={(e) => openDay(e.target.value, tab)}
            />
          </label>
          <p className="lead">
            {day.list.length
              ? day.list.length + "곳 배송 · " + day.depart + " 출발"
              : "소파 배송"}
          </p>
        </header>
        {storageError && (
          <p className="example" role="alert">
            {storageError}
          </p>
        )}
        {tab === "add" && (
          <section className="view">
            <div className="wrap">
              <div className="panel">
                <Field
                  label="출발 시간"
                  type="time"
                  value={day.depart}
                  onChange={(v) => setDay((d) => ({ ...d, depart: v }))}
                />
              </div>
              <div className="panel">
                <h2>출고표 넣기</h2>
                <p className="hint">
                  담당자에게 받은 출고표와 고객 목록 사진을 넣으세요. 확인 후
                  코스 화면에서 추천을 만듭니다.
                </p>
                <label className="upload-label">
                  {busy ? "읽는 중…" : "사진 선택"}
                  <input
                    id="import-images"
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={busy}
                    onChange={(e) => {
                      importImages([...e.target.files]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {status && (
                  <p className="import-status" role="status">
                    {status}
                  </p>
                )}
                {pending.length > 0 && (
                  <div className="review">
                    {pending.map((c, i) => (
                      <div className="review-item" key={c.id || i}>
                        <strong>
                          {c.file || "사진"} · {i + 1}번
                        </strong>
                        {[
                          ["name", "고객명"],
                          ["addr", "설치주소"],
                          ["phone", "실제 010 번호"],
                          ["safePhone", "안심 0508 번호"],
                          ["prod", "제품명"],
                          ["weight", "총 무게 (kg)"],
                        ].map(([k, l]) => (
                          <Field
                            key={k}
                            label={l}
                            value={c[k]}
                            onChange={(v) =>
                              setPending((p) =>
                                p.map((x, j) =>
                                  j === i ? { ...x, [k]: v } : x,
                                ),
                              )
                            }
                          />
                        ))}
                        <label className="field">
                          <span>방문 시간</span>
                          <select
                            value={c.slot}
                            onChange={(e) =>
                              setPending((p) =>
                                p.map((x, j) =>
                                  j === i ? { ...x, slot: e.target.value } : x,
                                ),
                              )
                            }
                          >
                            <option value="any">지정불가</option>
                            <option value="am">오전</option>
                            <option value="pm">오후</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>메모</span>
                          <textarea
                            value={c.memo || ""}
                            onChange={(e) =>
                              setPending((p) =>
                                p.map((x, j) =>
                                  j === i ? { ...x, memo: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </label>
                        <button
                          onClick={() =>
                            setPending((p) => p.filter((_, j) => j !== i))
                          }
                        >
                          이 항목 빼기
                        </button>
                      </div>
                    ))}
                    <button
                      className="primary big"
                      onClick={() => commit(pending)}
                    >
                      고친 고객 코스에 추가
                    </button>
                  </div>
                )}
              </div>
              <details className="panel" id="trip-settings">
                <summary>출발·귀가 장소</summary>
                <p className="hint">3.5톤 · 높이 3.40m</p>
                <Field
                  label="출발하는 곳"
                  value={day.start}
                  onChange={(v) => setDay((d) => ({ ...d, start: v }))}
                />
                <Field
                  label="마지막 귀가"
                  value={day.end}
                  onChange={(v) => setDay((d) => ({ ...d, end: v }))}
                />
              </details>
              <details
                className="panel"
                id="add-panel"
                open={!!editing || undefined}
              >
                <summary>
                  {editing ? "고객 정보 수정" : "직접 고객 추가"}
                </summary>
                <div className="form-fields">
                  <Field
                    label="고객 이름"
                    value={draft.name}
                    onChange={(v) => change("name", v)}
                    placeholder="예: 홍길동"
                  />
                  <Field
                    label="실제 연락처 (010 · 고객 목록)"
                    type="tel"
                    value={draft.phone}
                    onChange={(v) => change("phone", v)}
                  />
                  <Field
                    label="주소"
                    value={draft.addr}
                    onChange={(v) => change("addr", v)}
                    placeholder="경기 수원시 영통구 ..."
                  />
                  <div className="field">
                    <span>고객이 원하는 시간</span>
                    <div className="seg">
                      {[
                        ["am", "오전", "9~13시"],
                        ["pm", "오후", "13~17시"],
                        ["any", "지정불가", "9~17시"],
                      ].map(([v, l, s]) => (
                        <label key={v}>
                          <input
                            type="radio"
                            checked={draft.slot === v}
                            onChange={() => change("slot", v)}
                          />
                          {l}
                          <small>{s}</small>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span>해당되는 것 누르기</span>
                    <div className="chips">
                      {[
                        ["noelev", "엘리베이터 없음"],
                        ["bs", "기존 소파 수거"],
                        ["single", "단품 (암체어 등)"],
                        ["call", "전날 전화 요청"],
                      ].map(([k, l]) => (
                        <label className="chip" key={k}>
                          <input
                            type="checkbox"
                            checked={!!draft[k]}
                            onChange={(e) => change(k, e.target.checked)}
                          />
                          {l}
                        </label>
                      ))}
                    </div>
                  </div>
                  <details>
                    <summary>더 적을 것 (제품, 특이사항, 2차 번호)</summary>
                    <div className="form-fields">
                      {[
                        ["prod", "제품"],
                        [
                          "weight",
                          "총 무게 (kg) · 50kg 미만은 30분, 이상은 1시간",
                        ],
                        ["safePhone", "안심번호 (0508)"],
                        ["phone2", "2차 연락처"],
                        ["elevSize", "엘리베이터 인승"],
                      ].map(([k, l]) => (
                        <Field
                          key={k}
                          label={l}
                          value={draft[k]}
                          onChange={(v) => change(k, v)}
                        />
                      ))}
                      <label className="field">
                        <span>특이사항</span>
                        <textarea
                          value={draft.memo || ""}
                          onChange={(e) => change("memo", e.target.value)}
                        />
                      </label>
                      <Field
                        label="정확한 방문 약속 시각"
                        type="time"
                        value={draft.promiseTime}
                        onChange={(v) => change("promiseTime", v)}
                      />
                      <Field
                        label="설치 시간 (분) · 비우면 자동"
                        type="number"
                        value={draft.work}
                        onChange={(v) => change("work", v)}
                      />
                      <label className="chip">
                        <input
                          type="checkbox"
                          checked={!!draft.sorry}
                          onChange={(e) => change("sorry", e.target.checked)}
                        />
                        시간 조율·양해 전화 필요
                      </label>
                    </div>
                  </details>
                  <button className="primary big" onClick={save}>
                    {editing ? "수정 저장" : "＋ 이 고객 추가"}
                  </button>
                  {editing && (
                    <button
                      onClick={() => {
                        setEditing(null);
                        setDraft(blank());
                      }}
                    >
                      수정 그만두기
                    </button>
                  )}
                </div>
              </details>
            </div>
          </section>
        )}
        {tab === "order" && (
          <RouteView
            day={day}
            history={history}
            calc={calc}
            calls={calls}
            legBusy={legBusy}
            aiBusy={aiBusy}
            tmapReady={tmapReady}
            legsReady={legsReady}
            actions={{
              openDay: (date) => openDay(date, "order"),
              switchTab,
              fetchLegs: () => fetchLegs(),
              makePlans: () => makePlans(),
              usePlan: (kind) =>
                setDay((d) => d.plans?.[kind]
                  ? ({ ...planDay(d, d.plans[kind]), phase: "calling" })
                  : d),
              ready: () => setDay((d) => ({ ...d, phase: "ready" })),
              sortByFixed: () => setDay((d) => sortByFixed(d)),
              copy: copyText,
              courseText: (d) => courseText(d || day),
              movePlan: (kind, from, to) =>
                setDay((d) => movePlan(d, kind, from, to)),
              fetchPlanLegs: (kind) => fetchPlanLegs(kind),
              update,
              move,
              edit,
              remove: (id) =>
                setDay((d) => ({
                  ...d,
                  list: d.list.filter((x) => x.id !== id),
                })),
              openDocument,
              aiKey,
              aiSettings: () => {
                setKeyDraft(aiKey);
                setRememberKey(!!localStorage.getItem(AI_KEY));
                setAiSetup(true);
              },
              forgetAI,
              clearDay: () => {
                setDay((d) => ({
                  ...d,
                  list: [],
                  contacts: [],
                  plans: null,
                  phase: "draft",
                }));
                switchTab("add");
              },
            }}
          />
        )}
        {tab === "drive" && (
          <DriveView
            day={day}
            calc={calc}
            onStart={() =>
              setDay((d) => ({
                ...d,
                phase: "driving",
                depart: new Date().toTimeString().slice(0, 5),
              }))
            }
            onBack={() => switchTab("order")}
            onUpdate={update}
          />
        )}
        {tab === "map" && <RouteMap day={day} />}
        {tab === "calendar" && (
          <section className="view">
            <div className="wrap">
              <div className="panel">
                <div className="calendar-head">
                  <button aria-label="이전 달" onClick={() => changeMonth(-1)}>
                    ‹
                  </button>
                  <h2>
                    {year}년 {mon + 1}월
                  </h2>
                  <button aria-label="다음 달" onClick={() => changeMonth(1)}>
                    ›
                  </button>
                </div>
                <div className="calendar-grid">
                  {"일월화수목금토".split("").map((w, i) => (
                    <span key={i} className="calendar-weekday">
                      {w}
                    </span>
                  ))}
                  {Array.from({ length: offset }, (_, i) => (
                    <span key={"e" + i} />
                  ))}
                  {Array.from({ length: days }, (_, i) => {
                    const date =
                        year +
                        "-" +
                        String(mon + 1).padStart(2, "0") +
                        "-" +
                        String(i + 1).padStart(2, "0"),
                      record = date === day.date ? day : history[date],
                      count = record?.list?.length || 0;
                    return (
                      <button
                        key={date}
                        className={
                          "calendar-day " +
                          (count ? "has-route " : "") +
                          (selected === date ? "selected " : "") +
                          (today() === date ? "today" : "")
                        }
                        onClick={() => setSelected(date)}
                      >
                        {i + 1}
                        {count > 0 && <small>{count}곳</small>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="panel">
                <h2>{labelDate(selected)}</h2>
                {chosen?.list?.length ? (
                  <div className="calendar-detail">
                    <p>
                      {chosen.list.length}곳 · 완료{" "}
                      {chosen.list.filter((c) => c.done).length}곳
                    </p>
                    <ol>
                      {chosen.list.map((c) => (
                        <li key={c.id} className="calendar-record">
                          <strong>
                            <button
                              type="button"
                              className="customer-name"
                              onClick={() => openDocument(c)}
                              aria-label={c.name + " 출고표 보기"}
                            >
                              {c.name}
                              <small>출고표</small>
                            </button>
                            {c.done && c.doneAt ? " · 완료 " + c.doneAt : ""}
                          </strong>
                          <div className="info-line">
                            <span>{c.addr}</span>
                            <button
                              type="button"
                              className="copy-action"
                              aria-label={c.name + " 주소 복사"}
                              onClick={() => copyText(c.addr, "주소")}
                            >
                              복사
                            </button>
                          </div>
                          {(c.phone || c.safePhone) && (
                            <div className="info-line">
                              <span>
                                {normalizePhone(c.phone || c.safePhone)}
                              </span>
                              <button
                                type="button"
                                className="copy-action"
                                aria-label={c.name + " 전화번호 복사"}
                                onClick={() =>
                                  copyText(
                                    normalizePhone(c.phone || c.safePhone),
                                    "전화번호",
                                  )
                                }
                              >
                                복사
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <p className="hint">저장된 배송 기록이 없습니다.</p>
                )}
                <button
                  className="primary big"
                  onClick={() => openDay(selected)}
                >
                  이 날짜 코스 열기
                </button>
                <button className="big" onClick={() => openDay(today())}>
                  오늘 코스 보기
                </button>
                {selected < today() && chosen?.list?.length > 0 && (
                  <button
                    className="danger big"
                    onClick={() => deletePastDates([selected])}
                  >
                    이 날짜 기록 삭제
                  </button>
                )}
                {pastDates.length > 0 && (
                  <button
                    className="danger big"
                    onClick={() => deletePastDates(pastDates)}
                  >
                    지난 기록 전체 삭제
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
      <nav className="tabs" aria-label="화면 바꾸기">
        <div className="in" role="tablist">
          {[
            ["add", "출고표"],
            ["order", "코스 짜기"],
            ["drive", "배송 시작"],
            ["map", "지도"],
            ["calendar", "기록"],
          ].map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => switchTab(k)}
            >
              <TabIcon name={k} />
              {l}
            </button>
          ))}
        </div>
      </nav>
      <AiSetup
        open={aiSetup}
        keyValue={keyDraft}
        onKeyChange={setKeyDraft}
        remember={rememberKey}
        onRemember={setRememberKey}
        onClose={() => setAiSetup(false)}
        onStart={connectAI}
      />
      <DocumentViewer
        viewer={viewer}
        url={documentUrl}
        status={documentStatus}
        zoom={zoom}
        onZoom={setZoom}
        onClose={() => setViewer(null)}
        onUpload={() => {
          setViewer(null);
          switchTab("add");
        }}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
