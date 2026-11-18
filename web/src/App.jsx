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
  customerPhone,
  digits,
  compute,
  toMin,
  precallList,
  recommendOrder,
  applyPhotoImports,
  fillMissingFormFields,
  stopFacts,
  courseText,
  deleteCustomer,
  deleteDayCustomers,
} from "./logic.js";
import { imageCanvas } from "./ocr.js";
import { saveDocument, loadDocument, deleteDocuments } from "./imageStore.js";
import {
  loadImports,
  saveImports,
  sessionOf,
  updateSession as updateImportSession,
  nextQueued,
  queuedCount,
} from "./importQueue.js";
import DocumentViewer from "./DocumentViewer.jsx";
import { ConfirmHost, askConfirm } from "./ConfirmDialog.jsx";
import AnimatedDetails from "./AnimatedDetails.jsx";
import Settings from "./Settings.jsx";
import KeyGate from "./KeyGate.jsx";
import RouteMap from "./RouteMap.jsx";
import { planWithGemini } from "./routeAI.js";
import { analyzePhoto } from "./photoAI.js";
import { mockImports, isMock, mockDocumentImage } from "./mockData.js";
import {
  DOCUMENT_TYPES,
  documentTypeLabel,
  documentReviewFields,
  showsProductTable,
} from "./documentTypes.js";
import RouteView from "./RouteView.jsx";
import DriveView from "./DriveView.jsx";
import {
  fetchTmapRoute,
  applyLegs,
  legInfo,
  geocodeDay,
  invalidateAddress,
  GEO_VERSION,
} from "./tmapRoute.js";
import {
  driverOrder,
  areaDriverOrder,
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
// 구간마다 실제 출발 예정 시각(분): 0번은 출발 시각, 그다음은 앞 집 작업이 끝나는 시각
const legSchedule = (d) => {
  const { rows } = compute(d);
  return [toMin(d.depart), ...rows.map((row) => row.end)];
};
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
    ) : name === "settings" ? (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
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

// 의뢰서 종류를 이름 옆에 색 뱃지로 보여 준다.
const DocBadge = ({ type }) => (
  <span className={"doc-badge doc-" + (type || "dispatch")}>
    {documentTypeLabel(type)}
  </span>
);

function ConfirmedDocuments({ imports, onOpen }) {
  // 한 번에 한 의뢰서만 펼친다.
  const [openId, setOpenId] = useState(null);
  if (!imports.length) return null;
  return (
    <div className="panel review-panel">
      <div className="review-heading">
        <h3>확정한 의뢰서 · {imports.length}건</h3>
        <p className="hint">
          코스로 넘어간 뒤에도 이 날짜의 추출 내용을 확인할 수 있어요.
        </p>
      </div>
      {imports.map((c, i) => (
        <AnimatedDetails
          className="review-item"
          key={c.id || i}
          open={c.id === openId}
          onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
        >
          <summary className="review-summary">
            <span className="review-number">{i + 1}</span>
            <span className="review-summary-text">
              <span className="review-title">
                <strong>{c.name || "고객명 없음"}</strong>
                <DocBadge type={c.documentType} />
              </span>
              <small>{c.addr || "주소 없음"}</small>
            </span>
          </summary>
          <div className="review-fields">
            {c.file && <p className="review-source">{c.file}</p>}
            {c.imageId && (
              <button type="button" onClick={() => onOpen(c)}>
                원본 의뢰서 보기
              </button>
            )}
            <dl className="confirmed-facts">
              {[
                ["고객명", c.name],
                ["실제 연락처", c.phone],
                ["안심번호", c.safePhone],
                ...stopFacts(c),
              ].map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt>{label}</dt>
                  <dd>{value || "—"}</dd>
                </React.Fragment>
              ))}
            </dl>
            {showsProductTable(c.documentType) && (
              <table className="review-product-table">
                <thead>
                  <tr>
                    <th>제품명</th>
                  </tr>
                </thead>
                <tbody>
                  {(c.productRows?.length
                    ? c.productRows
                    : [c.prod || "—"]
                  ).map((name, j) => (
                    <tr key={j}>
                      <td>{name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                {(!c.documentType || c.documentType === "dispatch") && (
                  <tfoot>
                    <tr>
                      <th>
                        오더별 수량 합계 · 총 무게{" "}
                        {c.weight ? `${c.weight} kg` : "확인 필요"}
                      </th>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </AnimatedDetails>
      ))}
    </div>
  );
}

function FlowSteps({ stage, availableStage, onSelect }) {
  const labels = ["의뢰서", "추천 선택", "코스 확정", "배송 시작"];
  return (
    <div className="flow-steps" data-stage={stage} aria-label="업무 순서">
      {labels.map((label, index) => {
        const number = index + 1;
        const complete = number < stage;
        const active = number === stage;
        return (
          <button
            type="button"
            className={
              "flow-step" +
              (active ? " active" : "") +
              (complete ? " complete" : "")
            }
            aria-current={active ? "step" : undefined}
            disabled={number > availableStage}
            onClick={() => onSelect(number)}
            key={label}
          >
            <span className="flow-marker">{complete ? "✓" : number}</span>
            <span className="flow-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const initial = useRef(null);
  if (!initial.current) initial.current = init();
  const [day, setDay] = useState(initial.current.d),
    [history, setHistory] = useState(initial.current.h);
  const [tab, setTab] = useState(() => {
    const t = localStorage.getItem(TABKEY);
    if (t === "order" && ["ready", "driving"].includes(initial.current.d.phase))
      return "drive";
    return ["add", "order", "drive", "map", "calendar", "settings"].includes(t)
      ? t
      : initial.current.d.list.length
        ? "order"
        : "add";
  });
  const [viewStage, setViewStage] = useState(null);
  const [draft, setDraft] = useState(blank),
    [editing, setEditing] = useState(null),
    [addMode, setAddMode] = useState("document"),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [rereadId, setRereadId] = useState(null),
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
  const [aiBusy, setAiBusy] = useState(false),
    [legBusy, setLegBusy] = useState(false);
  const dayRef = useRef(day);
  // 사진 분석 진행 상황(대기·실패 사진, 확인 목록)은 날짜별로 기기에 저장한다.
  const [imports, setImports] = useState(loadImports),
    importsRef = useRef(imports),
    queueRunning = useRef(false);
  function updateSession(date, fn) {
    const next = updateImportSession(importsRef.current, date, fn);
    importsRef.current = next;
    setImports(next);
    if (!saveImports(next))
      setStorageError("사진 분석 진행 상황을 이 기기에 저장하지 못했습니다.");
  }
  const session = sessionOf(imports, day.date),
    pending = session.pending,
    phoneCandidates = session.phoneCandidates;
  const sessionSetter = (field) => (value) =>
    updateSession(day.date, (s) => ({
      ...s,
      [field]: typeof value === "function" ? value(s[field]) : value,
    }));
  // 추출 결과 확인 목록은 한 번에 한 고객만 펼친다. 처음엔 첫 고객이 열려 있다.
  const [openReviewChoice, setOpenReviewId] = useState(undefined),
    openReviewId =
      openReviewChoice === undefined ? pending[0]?.id : openReviewChoice;
  const setPending = sessionSetter("pending"),
    setPhoneCandidates = sessionSetter("phoneCandidates");
  // 추출 결과 확인에서 i번째 고객의 제품 행을 고친다. 첫 제품은 prod에도 둔다.
  const editProducts = (i, fn) =>
    setPending((p) =>
      p.map((x, j) => {
        if (j !== i) return x;
        const productRows = fn(
          x.productRows?.length ? [...x.productRows] : [x.prod || ""],
        );
        return { ...x, productRows, prod: productRows[0] || "" };
      }),
    );
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
        : "저장된 의뢰서가 없습니다. 사진을 다시 넣어 주세요.",
    );
    setZoom(100);
    if (viewer.imageId)
      loadDocument(viewer.imageId)
        .then((record) => {
          if (!active) return;
          if (!record?.image) {
            setDocumentStatus(
              "저장된 의뢰서가 없습니다. 사진을 다시 넣어 주세요.",
            );
            return;
          }
          url = URL.createObjectURL(record.image);
          setDocumentUrl(url);
          setDocumentStatus("");
        })
        .catch(() => {
          if (active) setDocumentStatus("의뢰서를 열지 못했습니다.");
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
  const change = (k, v) =>
    setDraft((c) => ({
      ...c,
      [k]: v,
      ...(k === "prod" && c.productRows?.length
        ? { productRows: [v, ...c.productRows.slice(1)] }
        : {}),
      ...((k === "fromAddr" && c.documentType === "move_dismantle") ||
      (k === "toAddr" && c.documentType === "move_install")
        ? { addr: v }
        : {}),
    }));
  const update = (id, patch) => setDay((d) => invalidateAddress(d, id, patch));
  const switchTab = (t) => {
    setTab(t);
    if (["map", "calendar", "settings"].includes(t)) setViewStage(null);
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
          ? {
              ...c,
              lat: undefined,
              lng: undefined,
              geoAddr: "",
              geoVersion: undefined,
              geoMissing: true,
            }
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
        ' 주소와 위치가 정확히 일치하지 않아요. 카드에서 주소를 확인하거나 "T맵 검색용 주소"를 넣어 주세요.'
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
  // 의뢰서 확정 뒤 추천 선택 화면이 열리면, 그때의 최신 코스로 추천을 한 번 만든다.
  const [autoPlan, setAutoPlan] = useState(null);
  useEffect(() => {
    if (!autoPlan || aiBusy || tab !== "order") return;
    setAutoPlan(null);
    if (autoPlan === day.date) makePlans(day);
  }, [autoPlan, tab, day, aiBusy]);
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
      if (geo && !rest.some((c) => geo.pos[c.id])) geo = null;
      const lastDone = baseDay.list.filter((c) => c.done).at(-1),
        from = geo && ((lastDone && geo.pos[lastDone.id]) || geo.start);
      const driver = geo
        ? {
            ids: driverOrder(rest, from, geo.end, geo.pos).map((c) => c.id),
            by: "map",
          }
        : {
            ids: areaDriverOrder(rest, baseDay.start, baseDay.end).map(
              (c) => c.id,
            ),
            by: "area",
          };
      const balanced = geo
        ? {
            ids: balancedOrder(baseDay, rest, from, geo.end, geo.pos).map(
              (c) => c.id,
            ),
            by: "map",
          }
        : {
            ids: recommendOrder(baseDay)
              .list.filter((c) => !c.done)
              .map((c) => c.id),
            by: "area",
          };
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
      const missingIds = new Set((geo?.missing || []).map((item) => item.id));
      const plans = {
        customer,
        driver,
        balanced,
        at: new Date().toTimeString().slice(0, 5),
        geo: geo ? { start: from, end: geo.end } : null,
        geoVersion: GEO_VERSION,
      };
      const next = {
        ...baseDay,
        list: baseDay.list.map((c) =>
          cache[c.id]
            ? { ...c, ...cache[c.id], geoMissing: false }
            : missingIds.has(c.id)
              ? {
                  ...c,
                  lat: undefined,
                  lng: undefined,
                  geoAddr: "",
                  geoVersion: undefined,
                  geoMissing: true,
                }
              : c,
        ),
        plans,
      };
      let located = {};
      let failed = 0;
      if (key) {
        let profile = { height: "340", weight: "3500" };
        try {
          profile = {
            ...profile,
            ...JSON.parse(localStorage.getItem(TRUCK_KEY) || "{}"),
          };
        } catch {}
        setLegBusy(true);
        try {
          const result = await calculateRecommendedLegs(next, (ordered) =>
            fetchTmapRoute(ordered, key, profile, fetch, {
              useCache: false,
              schedule: legSchedule,
            }),
          );
          Object.assign(plans, result.plans);
          located = result.located;
          failed = result.errors.length;
        } finally {
          setLegBusy(false);
        }
      }
      setDay((d) =>
        routeSig(d) === routeSig(baseDay)
          ? {
              ...d,
              list: d.list.map((c) => ({
                ...c,
                ...(cache[c.id] ||
                  (missingIds.has(c.id)
                    ? {
                        lat: undefined,
                        lng: undefined,
                        geoAddr: "",
                        geoVersion: undefined,
                        geoMissing: true,
                      }
                    : {})),
                ...(located[c.id] || {}),
              })),
              plans,
            }
          : d,
      );
      if (!quiet)
        flash(
          !geo
            ? "세 코스를 만들었어요. 빠른 이동과 균형 추천은 지역 기준의 대략 순서예요."
            : failed
              ? `추천은 만들었지만 ${failed}개 코스의 구간 시간을 받지 못했어요.`
              : "세 코스의 추천과 구간 시간을 만들었어요.",
        );
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
        schedule: legSchedule,
      });
      if (!route.legs)
        throw new Error(
          'T맵 구간 시간을 읽지 못했어요. "다시 받기"를 눌러 주세요.',
        );
      setDay((d) => {
        if (routeSig(d) !== routeSig(baseDay)) return d;
        const p = d.plans?.[kind];
        const next = { ...d, list: markLocated(d.list, route) };
        if (
          !p ||
          planKey(applyPlan(d, p.ids)) !== wanted ||
          routeSig(applyPlan(d, p.ids)) !== routeSig(ordered)
        )
          return next;
        return {
          ...next,
          plans: {
            ...d.plans,
            [kind]: { ...p, legs: route.legs, legsKey: wanted, timeError: "" },
          },
        };
      });
    } catch (error) {
      setDay((d) =>
        routeSig(d) === routeSig(baseDay) && d.plans?.[kind]
          ? {
              ...d,
              plans: {
                ...d.plans,
                [kind]: {
                  ...d.plans[kind],
                  timeError: error.message || "T맵 이동 시간을 받지 못했어요.",
                },
              },
            }
          : d,
      );
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
        schedule: legSchedule,
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
  // 코스 화면에서 이동 시간이 비면(순서를 옮겼거나 주소를 고쳤을 때) 잠깐 기다렸다가 T맵에 자동으로 다시 묻는다.
  // 연달아 여러 번 바꾸면 마지막에 한 번만, 같은 코스는 한 번만 시도한다(실패해도 무한 반복하지 않게).
  const autoLegSig = useRef(""),
    daySig = routeSig(day);
  useEffect(() => {
    if (tab !== "order" || legsReady || legBusy || !tmapReady || !day.list.length) return;
    if (autoLegSig.current === daySig) return;
    const id = setTimeout(() => {
      autoLegSig.current = daySig;
      fetchLegs(dayRef.current, true);
    }, 1200);
    return () => clearTimeout(id);
  }, [tab, legsReady, legBusy, tmapReady, daySig]);
  const [tmapKey, setTmapKey] = useState(
    () => localStorage.getItem(TMAP_KEY) || "",
  );
  function saveKey(name, key) {
    if (name === "gemini") {
      sessionStorage.setItem(AI_KEY, key);
      localStorage.setItem(AI_KEY, key);
      setAiKey(key);
      flash("Gemini 키를 바꿨어요.");
    }
    if (name === "tmap") {
      localStorage.setItem(TMAP_KEY, key);
      setTmapKey(key);
      // 지도 SDK는 앱키로 처음 한 번만 불러오므로 새로 고침해서 적용한다.
      window.location.reload();
    }
  }
  function submitGate({ gemini, tmap }) {
    if (gemini) saveKey("gemini", gemini);
    if (tmap) saveKey("tmap", tmap);
  }
  function openDay(date, nextTab = "order") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setHistory((h) => ({ ...h, [day.date]: day }));
    setDay(
      restoreDay(
        structuredClone(
          date === day.date ? day : history[date] || emptyDay(date),
        ),
        {},
        date,
      ).d,
    );
    setSelected(date);
    setMonth(date.slice(0, 7));
    setEditing(null);
    setDraft(blank());
    setViewStage(null);
    switchTab(nextTab);
  }
  async function deletePastDates(dates) {
    const records = { ...history, [day.date]: day };
    const targets = dates.filter(
      (date) => date < today() && records[date]?.list?.length,
    );
    if (!targets.length) return;
    if (
      !(await askConfirm(
        targets.length === 1
          ? `${labelDate(targets[0])} 배송 기록을 삭제할까요?`
          : `지난 배송 기록 ${targets.length}일을 모두 삭제할까요?`,
      ))
    )
      return;
    const nextHistory = { ...records };
    for (const date of targets) delete nextHistory[date];
    const nextDay = targets.includes(day.date)
      ? structuredClone(nextHistory[today()] || emptyDay(today()))
      : day;
    const remainingImages = new Set(
      [nextDay, ...Object.values(nextHistory)].flatMap((record) =>
        [...record.list, ...(record.imports || [])]
          .map((stop) => stop.imageId)
          .filter(Boolean),
      ),
    );
    const removedImages = targets.flatMap((date) =>
      [...records[date].list, ...(records[date].imports || [])]
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
  async function deleteForDate(date, id = null) {
    const records = { ...history, [day.date]: day };
    const record = records[date];
    const customer = id ? record?.list.find((item) => item.id === id) : null;
    if (
      !record ||
      (id && !customer) ||
      (!id && !record.list.length && !record.imports?.length)
    )
      return;
    const message = customer
      ? `${labelDate(date)} ${customer.name || "이 고객"}의 기록을 삭제할까요?`
      : `${labelDate(date)} 고객 기록 전체를 삭제할까요?`;
    if (!(await askConfirm(message))) return;
    const updated = id
      ? deleteCustomer(record, id)
      : deleteDayCustomers(record);
    const nextRecords = { ...records, [date]: updated };
    const imageIds = (item) =>
      [...item.list, ...(item.imports || [])]
        .map((stop) => stop.imageId)
        .filter(Boolean);
    const remainingImages = new Set(
      Object.values(nextRecords).flatMap(imageIds),
    );
    const removedImages = imageIds(record).filter(
      (imageId) => !remainingImages.has(imageId),
    );
    setHistory(nextRecords);
    if (date === day.date) {
      setDay(updated);
      if (!id) {
        setEditing(null);
        setDraft(blank());
        switchTab("add");
      }
    }
    try {
      await deleteDocuments(removedImages);
      flash(
        id ? "고객 기록을 삭제했어요." : "이 날짜 고객 기록을 모두 삭제했어요.",
      );
    } catch {
      flash("기록은 삭제됐지만 일부 사진은 기기에 남아 있을 수 있어요.");
    }
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
      ? invalidateAddress(day, editing, c)
      : recommendOrder({ ...day, list: [...day.list, c] });
    setDay(next);
    setDraft(blank());
    setEditing(null);
    setViewStage(null);
    switchTab("order");
    flash("고객 정보를 저장했어요.");
  }
  function edit(c) {
    setDraft({ ...c });
    setEditing(c.id);
    setAddMode("manual");
    switchTab("add");
  }
  function previewExcelPhone(name) {
    const clean = (value) => String(value || "").replace(/\s/g, "");
    const forms = [
      ...day.list.filter((item) => item.source === "form"),
      ...pending,
    ];
    if (forms.filter((item) => clean(item.name) === clean(name)).length !== 1)
      return "";
    const phones = new Set(
      phoneCandidates
        .filter((item) => clean(item.name) === clean(name))
        .map((item) => normalizePhone(item.phone)),
    );
    return phones.size === 1 ? [...phones][0] : "";
  }
  // 추출 결과 확인에서 i번째 고객의 값을 바꾼다.
  const patchPending = (i, patch) =>
    setPending((p) =>
      p.map((x, j) =>
        j === i
          ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) }
          : x,
      ),
    );
  // 추출 결과 확인의 입력칸 하나. 순서는 documentReviewFields(코스 복사 순서)를 따른다.
  function reviewField(c, i, k, label) {
    const select = (value, onChange, options) => (
      <label className="field" key={k}>
        <span>{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </label>
    );
    const triple = (known, yes) => (known ? (yes ? "yes" : "no") : "unknown");
    switch (k) {
      case "slot":
        return select(c.slot, (v) => patchPending(i, { slot: v }), [
          ["any", "지정불가"],
          ["am", "오전"],
          ["pm", "오후"],
        ]);
      case "phone":
        return (
          <Field
            key={k}
            label={label}
            type="tel"
            placeholder="010-0000-0000"
            value={reviewPhone(c)}
            onChange={(v) => patchPending(i, { phone: v, phoneTouched: true })}
          />
        );
      case "elevator":
        return select(
          triple(c.elevatorKnown, !c.noelev),
          (v) =>
            patchPending(i, { elevatorKnown: v !== "unknown", noelev: v === "no" }),
          [
            ["unknown", "확인 필요"],
            ["yes", "있음"],
            ["no", "없음"],
          ],
        );
      case "ladder":
        return select(
          triple(c.ladderKnown, c.ladderNeeded),
          (v) =>
            patchPending(i, { ladderKnown: v !== "unknown", ladderNeeded: v === "yes" }),
          [
            ["unknown", "확인 필요"],
            ["yes", "필요"],
            ["no", "불필요"],
          ],
        );
      case "bs":
        return select(c.bs ? "yes" : "no", (v) => patchPending(i, { bs: v === "yes" }), [
          ["no", "없음"],
          ["yes", "있음"],
        ]);
      case "memo":
        return (
          <label className="field" key={k}>
            <span>{label}</span>
            <textarea
              value={c.memo || ""}
              onChange={(e) => patchPending(i, { memo: e.target.value })}
            />
          </label>
        );
      case "products": {
        const rows = c.productRows?.length ? c.productRows : [c.prod || ""];
        return (
          <table className="review-product-table" key={k}>
            <thead>
              <tr>
                <th>{label}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product, rowIndex) => (
                <tr key={rowIndex}>
                  <td>
                    <div className="product-row">
                      <input
                        aria-label={`제품명 ${rowIndex + 1}`}
                        value={product}
                        onChange={(e) =>
                          editProducts(i, (list) => {
                            list[rowIndex] = e.target.value;
                            return list;
                          })
                        }
                      />
                      {rows.length > 1 && (
                        <button
                          type="button"
                          className="product-remove"
                          aria-label={`제품 ${rowIndex + 1} 삭제`}
                          onClick={() =>
                            editProducts(i, (list) =>
                              list.filter((_, n) => n !== rowIndex),
                            )
                          }
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <button
                    type="button"
                    className="product-add"
                    onClick={() => editProducts(i, (list) => [...list, ""])}
                  >
                    + 제품 추가
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        );
      }
      default:
        return (
          <Field
            key={k}
            label={label}
            type={k === "installDate" ? "date" : "text"}
            value={c[k]}
            onChange={(v) =>
              patchPending(i, (x) => ({
                [k]: v,
                // 이동 의뢰서는 방문지(addr)를 설치·해체 주소에 맞춘다.
                ...((k === "toAddr" && x.documentType === "move_install") ||
                (k === "fromAddr" && x.documentType === "move_dismantle")
                  ? { addr: v }
                  : {}),
              }))
            }
          />
        );
    }
  }
  // 추출 결과 확인의 고객 번호: 직접 고친 값이 있으면 그것, 없으면 고객 번호 표에서 이름이 맞는 번호
  const reviewPhone = (c) =>
    c.phoneTouched ? c.phone : c.phone || previewExcelPhone(c.name);
  function commit(items) {
    const clean = (value) => String(value || "").replace(/\s/g, "");
    // 화면에 보이던 고객 번호를 그대로 저장한다. 번호가 정해진 고객에게는 표의 번호를 다시 붙이지 않는다.
    items = items.map(({ phoneTouched, ...c }) => ({
      ...c,
      phone: normalizePhone(reviewPhone({ ...c, phoneTouched })),
    }));
    const decided = new Set(items.filter((c) => c.phone).map((c) => clean(c.name)));
    const contacts = phoneCandidates.filter((x) => !decided.has(clean(x.name)));
    const ready = items.filter((c) => c.name.trim() && c.addr.trim()),
      missing = items.filter((c) => !c.name.trim() || !c.addr.trim());
    if (missing.length) {
      setPending(items);
      flash("고객명과 설치주소를 확인해 주세요.");
      return;
    }
    const imported = applyPhotoImports(day, [...ready, ...contacts]);
    const next = recommendOrder(imported.day);
    setDay(next);
    setPending([]);
    setPhoneCandidates(imported.unmatched);
    setStatus(
      imported.unmatched.length
        ? `선택한 날짜 의뢰서 ${imported.formsAdded}건 저장 · 고객 번호 ${imported.matched}건 연결. 나머지 번호는 의뢰서와 일치하지 않아 저장하지 않았어요.`
        : "",
    );
    setViewStage(null);
    if (next.list.length) switchTab("order");
    // 추천 선택 화면으로 넘어가면 바로 추천 코스를 만든다(아래 effect).
    if (next.list.filter((c) => !c.done).length >= 2) setAutoPlan(next.date);
    flash(
      `의뢰서 ${imported.formsAdded}건 저장 · 고객 번호 ${imported.matched}건 연결`,
    );
  }
  // 설정의 테스트 데이터: 가짜 고객을 추출 결과 확인 목록에 넣거나 한 번에 지운다.
  const mockCount =
    Object.values(imports).reduce(
      (n, s) => n + s.pending.filter(isMock).length,
      0,
    ) +
    Object.values({ ...history, [day.date]: day }).reduce(
      (n, d) =>
        n +
        Math.max(
          (d.list || []).filter(isMock).length,
          (d.imports || []).filter(isMock).length,
        ),
      0,
    );
  async function addMock() {
    const date = day.date,
      mock = mockImports(date);
    // 고객마다 가짜 의뢰서 사진을 만들어 실제 의뢰서처럼 기기에 저장해 둔다.
    for (const c of mock.pending) {
      try {
        const blob = await mockDocumentImage(c, documentTypeLabel(c.documentType));
        const file = new File([blob], c.name.replace(/\s/g, "_") + "_의뢰서.jpg", {
          type: "image/jpeg",
        });
        c.imageId = await saveDocument(file);
        c.file = file.name;
      } catch {
        // 사진을 못 만들어도 고객은 넣는다.
      }
    }
    updateSession(date, (s) => ({
      ...s,
      pending: [...s.pending.filter((c) => !isMock(c)), ...mock.pending],
      phoneCandidates: [
        ...s.phoneCandidates.filter((c) => !isMock(c)),
        ...mock.phoneCandidates,
      ],
    }));
    setAddMode("document");
    switchTab("add");
    flash("테스트 고객 " + mock.pending.length + "명을 넣었어요.");
  }
  async function clearMock() {
    if (!(await askConfirm("테스트 고객을 모두 지울까요?"))) return;
    const records = { ...history, [day.date]: day },
      imageIds = [
        ...Object.values(importsRef.current).flatMap((s) => s.pending),
        ...Object.values(records).flatMap((d) => [...(d.list || []), ...(d.imports || [])]),
      ]
        .filter((c) => isMock(c) && c.imageId)
        .map((c) => c.imageId);
    deleteDocuments(imageIds).catch(() => {});
    for (const date of Object.keys(importsRef.current))
      updateSession(date, (s) => ({
        ...s,
        pending: s.pending.filter((c) => !isMock(c)),
        phoneCandidates: s.phoneCandidates.filter((c) => !isMock(c)),
      }));
    const strip = (d) => ({
      ...d,
      list: (d.list || []).filter((c) => !isMock(c)),
      ...(d.imports ? { imports: d.imports.filter((c) => !isMock(c)) } : {}),
    });
    setHistory((h) =>
      Object.fromEntries(Object.entries(h).map(([k, d]) => [k, strip(d)])),
    );
    setDay((d) => strip(d));
    flash("테스트 고객을 모두 지웠어요.");
  }
  // 고른 사진은 먼저 기기에 저장해 대기열에 올리고, 대기열을 차례로 분석한다.
  // 앱을 나갔다 와도 대기열이 남아 있어서 다시 열면 이어서 읽는다.
  async function importImages(files) {
    if (!files.length) return;
    if (!aiKey) {
      setStatus("AI 사진 분석을 사용하려면 설정에서 Gemini API 키를 연결해 주세요.");
      return;
    }
    const date = day.date,
      queued = [];
    for (const file of files) {
      try {
        queued.push({ imageId: await saveDocument(file), name: file.name });
      } catch {
        setStatus("사진을 이 기기에 저장하지 못했어요. Chrome에서 다시 열어 주세요.");
        return;
      }
    }
    updateSession(date, (s) => ({ ...s, queue: [...s.queue, ...queued] }));
    runQueue();
  }
  function retryFailed() {
    updateSession(day.date, (s) => ({
      ...s,
      queue: [...s.queue, ...s.failed.map(({ imageId, name }) => ({ imageId, name }))],
      failed: [],
    }));
    runQueue();
  }
  async function runQueue() {
    if (queueRunning.current || !aiKey || !nextQueued(importsRef.current)) return;
    queueRunning.current = true;
    setBusy(true);
    const done = { photos: 0, forms: 0, contacts: 0, failed: 0 };
    let paused = false;
    try {
      for (let next; (next = nextQueued(importsRef.current)); ) {
        const { date, item } = next;
        setStatus("사진 읽는 중… 남은 사진 " + queuedCount(importsRef.current) + "장");
        let customers;
        try {
          const record = await loadDocument(item.imageId);
          if (!record?.image) throw new Error("저장된 사진이 없습니다. 다시 넣어 주세요.");
          const canvas = await imageCanvas(record.image);
          customers = await analyzePhoto({ name: item.name }, canvas, aiKey, fetch, date);
        } catch (error) {
          const message = error.message || String(error);
          // 앱을 나가서 연결이 끊긴 것이면 실패로 치지 않고 대기열에 둔 채 멈춘다.
          if (document.hidden && /연결하지 못|시간이 초과/.test(message)) {
            paused = true;
            break;
          }
          done.failed++;
          updateSession(date, (s) => ({
            ...s,
            queue: s.queue.filter((x) => x.imageId !== item.imageId),
            failed: [...s.failed, { ...item, error: message }],
          }));
          continue;
        }
        const forms = customers
          .filter((c) => c.source === "form")
          .map((c) => ({ ...c, imageId: item.imageId }));
        const contacts = customers.filter((c) => c.source === "list");
        if (!forms.length) deleteDocuments([item.imageId]).catch(() => {});
        done.photos++;
        done.forms += forms.length;
        done.contacts += contacts.length;
        const current = sessionOf(importsRef.current, date);
        let candidates = [...current.phoneCandidates, ...contacts];
        // 확인할 의뢰서가 없을 때 들어온 고객 번호 표는 이미 확정한 고객에게 바로 연결한다.
        if (contacts.length && !forms.length && !current.pending.length && date === dayRef.current.date) {
          const imported = applyPhotoImports(dayRef.current, candidates);
          dayRef.current = imported.day;
          setDay(imported.day);
          candidates = imported.unmatched;
          if (imported.matched)
            flash(`고객 번호 ${imported.matched}건을 의뢰서 고객에게 연결했어요.`);
        }
        updateSession(date, (s) => ({
          ...s,
          queue: s.queue.filter((x) => x.imageId !== item.imageId),
          pending: [...s.pending, ...forms],
          phoneCandidates: candidates,
        }));
      }
    } finally {
      queueRunning.current = false;
      setBusy(false);
    }
    setStatus(
      paused
        ? "앱으로 돌아오면 남은 사진을 이어서 읽어요."
        : done.forms || done.contacts
          ? `${done.photos}장 AI 분석 · 의뢰서 고객 ${done.forms}건${done.contacts ? ` · 고객 번호 ${done.contacts}건은 이름 매칭에만 사용` : ""}`
          : done.failed
            ? ""
            : "고객 정보를 찾지 못했어요. 더 선명한 사진을 넣거나 직접 입력해 주세요.",
    );
  }
  // 앱을 다시 열거나 다른 앱에서 돌아오면 남은 사진을 이어서 읽는다.
  useEffect(() => {
    runQueue();
    const resume = () => {
      if (!document.hidden) runQueue();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [aiKey]);
  async function rereadDocument(c) {
    if (!c.imageId || rereadId) return;
    if (!aiKey) {
      flash("다시 읽으려면 설정에서 Gemini 키를 연결해 주세요.");
      return;
    }
    setRereadId(c.id);
    try {
      const record = await loadDocument(c.imageId);
      if (!record?.image)
        throw new Error("저장된 의뢰서가 없습니다. 사진을 다시 넣어 주세요.");
      const canvas = await imageCanvas(record.image);
      const customers = await analyzePhoto(
        { name: record.name || "의뢰서" },
        canvas,
        aiKey,
      );
      const clean = (value) => String(value || "").replace(/\s/g, "");
      const read =
        customers.find(
          (item) =>
            item.source === "form" && clean(item.name) === clean(c.name),
        ) ||
        (customers.length === 1 && customers[0].source === "form"
          ? customers[0]
          : null);
      if (!read)
        throw new Error(
          "사진에서 해당 고객을 찾지 못했습니다. 원본을 확인해 주세요.",
        );
      const filled = fillMissingFormFields(c, read);
      const gained = [
        "prod",
        "weight",
        "elevatorKnown",
        "requestReason",
        "requestDetails",
        "fromAddr",
        "toAddr",
        "orderNo",
        "siteNo",
      ].filter((k) => !c[k] && filled[k]);
      setDay((d) => ({
        ...d,
        list: d.list.map((x) =>
          x.id === c.id && x.imageId === c.imageId
            ? fillMissingFormFields(x, read)
            : x,
        ),
      }));
      flash(
        gained.length
          ? "의뢰서에서 " + gained.length + "개 정보를 다시 읽었어요."
          : "의뢰서를 다시 읽었지만 빈 정보를 찾지 못했어요. 사진을 확인해 주세요.",
      );
    } catch (error) {
      flash(error.message || "의뢰서를 다시 읽지 못했어요.");
    } finally {
      setRereadId(null);
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
  const availableStage = !day.list.length
    ? 1
    : day.phase === "ready" || day.phase === "driving"
      ? 4
      : day.phase === "calling"
        ? 3
        : 2;
  const flowStage =
    tab === "add" ? 1 : tab === "drive" ? 4 : viewStage || availableStage;
  const selectStage = (stage) => {
    if (stage > availableStage) return;
    setViewStage(stage);
    switchTab(stage === 1 ? "add" : stage === 4 ? "drive" : "order");
  };
  const openWorkflow = () => {
    setViewStage(null);
    switchTab(
      availableStage === 1 ? "add" : availableStage === 4 ? "drive" : "order",
    );
  };
  const datePicker = (className) => (
    <label className={"header-date-picker " + className}>
      <span>{labelDate(day.date)} ▾</span>
      <input
        type="date"
        aria-label="배송 날짜 바꾸기"
        value={day.date}
        onChange={(e) => openDay(e.target.value, tab)}
      />
    </label>
  );
  return (
    <>
      <div className="wrap">
        {tab !== "map" && (
          <header
            className={
              tab === "add" || tab === "order" ? "workflow-header" : ""
            }
          >
            {tab === "add" || tab === "order" ? (
              <>
                {datePicker("header-eyebrow")}
                <h1>코스 짜기</h1>
              </>
            ) : tab === "settings" ? (
              <>
                <span className="header-eyebrow">소파 배송 동선표</span>
                <h1>설정</h1>
              </>
            ) : (
              <>
                {datePicker("header-eyebrow")}
                <h1>{tab === "drive" ? "코스 짜기" : "배송 기록"}</h1>
              </>
            )}
          </header>
        )}
        {["add", "order", "drive"].includes(tab) && (
          <FlowSteps
            stage={flowStage}
            availableStage={availableStage}
            onSelect={selectStage}
          />
        )}
        {storageError && (
          <p className="example" role="alert">
            {storageError}
          </p>
        )}
        {tab === "add" && (
          <section className="view">
            <div className="wrap">
              <div className="panel delivery-date-panel">
                <label className="field">
                  <span>배송 날짜</span>
                  <input
                    type="date"
                    value={day.date}
                    onChange={(e) => openDay(e.target.value, "add")}
                  />
                </label>
              </div>
              <details className="panel trip-fields" id="trip-settings">
                <summary>출발과 귀가</summary>
                <Field
                  label="출발 장소"
                  value={day.start}
                  onChange={(v) => setDay((d) => ({ ...d, start: v }))}
                />
                <Field
                  label="출발 시간"
                  type="time"
                  value={day.depart}
                  onChange={(v) => setDay((d) => ({ ...d, depart: v }))}
                />
                <Field
                  label="귀가 장소"
                  value={day.end}
                  onChange={(v) => setDay((d) => ({ ...d, end: v }))}
                />
              </details>
              <div
                className="add-mode-tabs"
                role="tablist"
                aria-label="고객 정보 입력 방법"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={addMode === "document"}
                  onClick={() => setAddMode("document")}
                >
                  의뢰서 사진
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={addMode === "manual"}
                  onClick={() => setAddMode("manual")}
                >
                  고객 정보 직접 입력
                </button>
              </div>
              {addMode === "document" && (
                <div className="panel">
                  <h2>의뢰서와 고객 목록 사진 넣기</h2>
                  <label className="upload-label">
                    {busy ? "읽는 중…" : "+ 사진 선택하기"}
                    <input
                      id="import-images"
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={busy || !aiKey}
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
                  {session.failed.length > 0 && (
                    <p className="import-status" role="status">
                      {session.failed.length}장 실패:
                      {session.failed.map((f) => "\n" + f.name + ": " + f.error)}
                    </p>
                  )}
                  {session.failed.length > 0 && !busy && (
                    <button type="button" className="btn" onClick={retryFailed}>
                      실패한 사진 {session.failed.length}장 다시 시도
                    </button>
                  )}
                </div>
              )}
              {addMode === "document" && pending.length > 0 && (
                <div className="panel review-panel">
                  <div className="review">
                    <div className="review-heading">
                      <h3>추출 결과 확인</h3>
                      <p className="review-count">
                        {day.date} 방문 고객 {pending.length}건
                      </p>
                      <p className="hint">
                        원본 사진과 비교해 잘못 읽힌 내용을 고쳐주세요.
                      </p>
                    </div>
                    {pending.map((c, i) => (
                      <AnimatedDetails
                        className={
                          "review-item" +
                          (!c.name.trim() ||
                          (c.source !== "list" && !c.addr.trim())
                            ? " bad"
                            : "")
                        }
                        key={c.id || i}
                        open={c.id === openReviewId}
                        onToggle={() =>
                          setOpenReviewId(openReviewId === c.id ? null : c.id)
                        }
                      >
                        <summary className="review-summary">
                          <span className="review-number">{i + 1}</span>
                          <span className="review-summary-text">
                            <span className="review-title">
                              <strong>{c.name || "고객명 확인 필요"}</strong>
                              <DocBadge type={c.documentType} />
                            </span>
                            <small>{c.addr || "주소 확인 필요"}</small>
                          </span>
                        </summary>
                        <div className="review-fields">
                          <p className="review-source">{c.file || "사진"}</p>
                          {c.imageId && (
                            <button
                              type="button"
                              onClick={() => openDocument(c)}
                            >
                              원본 사진 보기
                            </button>
                          )}
                          <label className="field">
                            <span>문서 종류</span>
                            <select
                              value={c.documentType || "dispatch"}
                              onChange={(e) =>
                                setPending((p) =>
                                  p.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          documentType: e.target.value,
                                          addr:
                                            e.target.value === "move_install"
                                              ? x.toAddr || x.addr
                                              : e.target.value ===
                                                  "move_dismantle"
                                                ? x.fromAddr || x.addr
                                                : x.addr,
                                        }
                                      : x,
                                  ),
                                )
                              }
                            >
                              {Object.entries(DOCUMENT_TYPES).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          {documentReviewFields(c.documentType).map(
                            ([k, l]) => reviewField(c, i, k, l),
                          )}
                          <button
                            onClick={() =>
                              setPending((p) => p.filter((_, j) => j !== i))
                            }
                          >
                            이 항목 빼기
                          </button>
                        </div>
                      </AnimatedDetails>
                    ))}
                    <button
                      className="primary big"
                      onClick={() => commit(pending)}
                    >
                      코스 추천 받기
                    </button>
                  </div>
                </div>
              )}
              {addMode === "document" && (
                <ConfirmedDocuments
                  imports={(
                    day.imports ||
                    day.list.filter((customer) => customer.source === "form")
                  ).filter((customer) => customer.source === "form")}
                  onOpen={openDocument}
                />
              )}
              {addMode === "manual" && (
                <div className="panel" id="add-panel">
                  <h2>{editing ? "고객 정보 수정" : "고객 정보 직접 입력"}</h2>
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
                    {(!draft.documentType ||
                      draft.documentType === "dispatch") && (
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
                    )}
                    <details>
                      <summary>
                        {draft.documentType && draft.documentType !== "dispatch"
                          ? "문서별 요청 내용과 특이사항"
                          : "더 적을 것 (제품, 특이사항, 2차 번호)"}
                      </summary>
                      <div className="form-fields">
                        {editing && draft.documentType && (
                          <>
                            <label className="field">
                              <span>문서 종류</span>
                              <select
                                value={draft.documentType}
                                onChange={(e) =>
                                  change("documentType", e.target.value)
                                }
                              >
                                {Object.entries(DOCUMENT_TYPES).map(
                                  ([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            {documentReviewFields(draft.documentType)
                              .filter(([key]) =>
                                [
                                  "fromAddr",
                                  "toAddr",
                                  "requestReason",
                                  "requestDetails",
                                  "orderNo",
                                  "siteNo",
                                ].includes(key),
                              )
                              .map(([key, label]) => (
                                <Field
                                  key={key}
                                  label={label}
                                  value={draft[key]}
                                  onChange={(value) => change(key, value)}
                                />
                              ))}
                          </>
                        )}
                        {[
                          ["prod", "제품"],
                          ["weight", "총 무게 (kg)"],
                          ["safePhone", "안심번호 (0508)"],
                          ["phone2", "2차 연락처"],
                          ["elevSize", "엘리베이터 인승"],
                        ]
                          .filter(
                            ([key]) =>
                              !draft.documentType ||
                              draft.documentType === "dispatch" ||
                              ["safePhone", "phone2"].includes(key) ||
                              (draft.documentType === "return" &&
                                key === "prod"),
                          )
                          .map(([k, l]) => (
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
                        {["calling", "ready", "driving"].includes(
                          day.phase,
                        ) && (
                          <Field
                            label="정확한 방문 약속 시각"
                            type="time"
                            value={draft.promiseTime}
                            onChange={(v) => change("promiseTime", v)}
                          />
                        )}
                        <Field
                          label="작업 시간 (분) · 비우면 자동 · 이동 제외"
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
                </div>
              )}
            </div>
          </section>
        )}
        {tab === "order" && (
          <RouteView
            stage={flowStage}
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
              usePlan: (kind) => {
                setDay((d) =>
                  d.plans?.[kind]
                    ? { ...planDay(d, d.plans[kind]), phase: "calling" }
                    : d,
                );
                setViewStage(3);
              },
              ready: () => {
                setDay((d) => ({ ...d, phase: "ready" }));
                setViewStage(4);
                switchTab("drive");
              },
              sortByFixed: () => setDay((d) => sortByFixed(d)),
              copy: copyText,
              courseText: (d) => courseText(d || day),
              movePlan: (kind, from, to) =>
                setDay((d) => movePlan(d, kind, from, to)),
              fetchPlanLegs: (kind) => fetchPlanLegs(kind),
              update,
              move,
              edit,
              remove: (id) => deleteForDate(day.date, id),
              openDocument,
              rereadDocument,
              rereadId,
              aiKey,
              aiSettings: () => switchTab("settings"),
              clearDay: () => deleteForDate(day.date),
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
            onBack={() => selectStage(availableStage >= 3 ? 3 : availableStage)}
            onUpdate={update}
            onOpenDocument={openDocument}
            onCopy={copyText}
          />
        )}
        {tab === "map" && (
          <RouteMap
            day={day}
            onOpenCourse={() => switchTab("order")}
            onLocated={(route) =>
              setDay((d) => ({
                ...d,
                list: markLocated(d.list, route),
              }))
            }
          />
        )}
        {tab === "settings" && (
          <Settings
            keys={{ gemini: aiKey, tmap: tmapKey }}
            onSaveKey={saveKey}
            date={day.date}
            mockCount={mockCount}
            onAddMock={addMock}
            onClearMock={clearMock}
          />
        )}
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
                <h2 className="calendar-date">
                  {labelDate(selected)}
                  {chosen?.list?.length > 0 && (
                    <small>
                      {chosen.list.length}곳 · 완료{" "}
                      {chosen.list.filter((c) => c.done).length}곳
                    </small>
                  )}
                </h2>
                {chosen?.list?.length ? (
                  <div className="calendar-detail">
                    <ol>
                      {chosen.list.map((c) => (
                        <li key={c.id} className="calendar-record">
                          <button
                            type="button"
                            className="calendar-delete"
                            aria-label={(c.name || "고객") + " 삭제"}
                            onClick={() => deleteForDate(selected, c.id)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                          <strong className="calendar-name">
                            <button
                              type="button"
                              className="customer-name"
                              onClick={() => openDocument(c)}
                              aria-label={c.name + " 의뢰서 보기"}
                            >
                              {c.name}
                            </button>
                            <DocBadge type={c.documentType} />
                          </strong>
                          {c.done && c.doneAt && (
                            <p className="calendar-done">완료 {c.doneAt}</p>
                          )}
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
                          {customerPhone(c) ? (
                            <div className="info-line">
                              <a
                                className="calendar-phone"
                                href={"tel:" + digits(customerPhone(c))}
                                aria-label={c.name + "에게 전화"}
                              >
                                {normalizePhone(customerPhone(c))}
                              </a>
                              <button
                                type="button"
                                className="copy-action"
                                aria-label={c.name + " 전화번호 복사"}
                                onClick={() =>
                                  copyText(
                                    normalizePhone(customerPhone(c)),
                                    "전화번호",
                                  )
                                }
                              >
                                복사
                              </button>
                            </div>
                          ) : (
                            <p className="calendar-no-phone">고객 번호 없음</p>
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
                {(chosen?.list?.length > 0 || chosen?.imports?.length > 0) && (
                  <button
                    className="danger big"
                    onClick={() => deleteForDate(selected)}
                  >
                    이 날짜 고객 전체 삭제
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
            ["order", "코스 짜기"],
            ["map", "지도"],
            ["calendar", "기록"],
            ["settings", "설정"],
          ].map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={
                k === "order"
                  ? ["add", "order", "drive"].includes(tab)
                  : tab === k
              }
              onClick={() => (k === "order" ? openWorkflow() : switchTab(k))}
            >
              <TabIcon name={k} />
              {l}
            </button>
          ))}
        </div>
      </nav>
      <KeyGate
        needGemini={!aiKey}
        needTmap={!tmapKey}
        onSubmit={submitGate}
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
      <ConfirmHost />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
