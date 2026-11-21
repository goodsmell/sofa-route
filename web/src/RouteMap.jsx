import { askConfirm } from "./ConfirmDialog.jsx";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchTmapRoute, validTruck, GEO_VERSION, tmapNaviUrl } from "./tmapRoute.js";
import { documentTypeLabel, documentSpecificFields } from "./documentTypes.js";
import { loadTmapSdk } from "./tmapSdk.js";
import { groupPins, nearbyStops } from "./mapPins.js";
import { compute, fmt, shortArea, digits, normalizePhone, customerPhone, productList } from "./logic.js";

const KEY = "sofa-route-tmap-key-v1";
const PROFILE = "sofa-route-truck-v1";
const DEFAULT_PROFILE = {
  height: "340",
  weight: "3500",
  width: "",
  totalWeight: "",
  length: "",
};
const HOME = [37.32, 126.95]; // 좌표가 하나도 없을 때 보여 줄 곳

const pin = (label, state, multi, spot = "") => {
  const text = String(label).replace(/[&<>"']/g, "");
  const data = spot === "" ? "" : ` data-spot="${spot}"`;
  return multi
    ? `<div class="pin-multi ${state}"${data}><span>${text}</span></div>`
    : `<div class="pin ${state}"${data}><span>${text}</span></div>`;
};

const Icon = ({ d }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {d}
  </svg>
);
const ICONS = {
  fit: <Icon d={<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />} />,
  me: (
    <Icon
      d={
        <>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </>
      }
    />
  ),
  gear: (
    <Icon
      d={
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </>
      }
    />
  ),
  phone: (
    <Icon
      d={
        <path d="M6.6 3.5h2.6l1.4 4-2 1.6a12 12 0 0 0 6.3 6.3l1.6-2 4 1.4v2.6c0 1-.8 1.8-1.8 1.8C10.4 19.2 4.8 13.6 4.8 5.3c0-1 .8-1.8 1.8-1.8z" />
      }
    />
  ),
  navi: (
    <Icon
      d={
        <>
          <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
          <circle cx="12" cy="10" r="2.3" />
        </>
      }
    />
  ),
  prev: <Icon d={<path d="m15 6-6 6 6 6" />} />,
  next: <Icon d={<path d="m9 6 6 6-6 6" />} />,
  route: (
    <Icon
      d={
        <>
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="6" r="2" />
          <path d="M8 18h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6" />
        </>
      }
    />
  ),
  search: <Icon d={<><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>} />,
  close: <Icon d={<path d="M5 5 19 19M19 5 5 19" />} />,
};

export default function RouteMap({ day, onOpenCourse, onLocated }) {
  const node = useRef(null),
    mapRef = useRef(null),
    sdkRef = useRef(null),
    overlaysRef = useRef([]),
    meRef = useRef(null),
    markersRef = useRef({}),
    chooseRef = useRef(null);
  const [key, setKey] = useState(() => localStorage.getItem(KEY) || "");
  const [draft, setDraft] = useState(key);
  const [profile, setProfile] = useState(() => {
    try {
      return {
        ...DEFAULT_PROFILE,
        ...JSON.parse(localStorage.getItem(PROFILE) || "{}"),
      };
    } catch {
      return DEFAULT_PROFILE;
    }
  });
  const [status, setStatus] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null); // 고객 index
  const [choices, setChoices] = useState([]); // 핀 하나에 겹친 배송지들
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheet, setSheet] = useState("peek"); // peek | list
  const [settings, setSettings] = useState(false);
  const { rows, home } = useMemo(() => compute(day), [day]);

  // 지도에 찍을 점: 경로를 받았으면 그 점, 아니면 고객에 저장된 좌표
  const points = useMemo(() => {
    if (route) return route.points;
    return day.list
      .map((c, i) =>
        c.geoVersion === GEO_VERSION && c.geoAddr === (c.mapAddr || c.addr) && Number.isFinite(c.lat) && Number.isFinite(c.lng)
          ? { lat: c.lat, lng: c.lng, index: i, label: String(i + 1) }
          : null,
      )
      .filter(Boolean);
  }, [route, day]);
  const spots = useMemo(() => groupPins(points, day.list.length), [points, day.list.length]);
  const located = new Set(
    points
      .filter((p) => p.index >= 0 && p.index < day.list.length)
      .map((p) => p.index),
  );
  const unplaced = day.list.map((c, i) => i).filter((i) => !located.has(i));
  const searchResults = query.trim()
    ? day.list.map((c, i) => ({ c, i })).filter(({ c, i }) =>
        `${i + 1} ${c.name || ""} ${c.addr || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      )
    : [];

  // 앱키가 준비되면 T맵 SDK 지도를 만든다.
  useEffect(() => {
    if (!key || !node.current) return;
    let cancelled = false;
    let observer, unlisten;
    setMapError("");
    setMapReady(false);
    loadTmapSdk().then((Tmapv2) => {
      if (cancelled || !node.current) return;
      sdkRef.current = Tmapv2;
      const map = new Tmapv2.Map("delivery-tmap", {
        center: new Tmapv2.LatLng(...HOME),
        zoom: 10,
        width: `${node.current.clientWidth}px`,
        height: `${node.current.clientHeight}px`,
      });
      mapRef.current = map;
      observer = new ResizeObserver(() => map.resize());
      observer.observe(node.current);
      // T맵 마커의 click은 누르는 사이 지도가 다른 판을 덮어 자주 빠진다.
      // 그래서 핀을 누른 곳과 뗀 곳을 지도 위에서 직접 보고 고른다.
      const el = node.current;
      let down = null;
      const onDown = (e) => {
        const spot = e.target.closest?.("[data-spot]")?.dataset.spot;
        down = spot == null ? null : { spot: Number(spot), x: e.clientX, y: e.clientY, at: Date.now() };
      };
      const onUp = (e) => {
        const tap = down;
        down = null;
        if (!tap || Date.now() - tap.at > 800) return;
        if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) return; // 지도를 끈 경우
        chooseRef.current?.(tap.spot);
      };
      el.addEventListener("pointerdown", onDown, true);
      el.addEventListener("pointerup", onUp, true);
      const onCancel = () => { down = null; };
      el.addEventListener("pointercancel", onCancel, true);
      unlisten = () => {
        el.removeEventListener("pointerdown", onDown, true);
        el.removeEventListener("pointerup", onUp, true);
        el.removeEventListener("pointercancel", onCancel, true);
      };
      setMapReady(true);
    }).catch((error) => {
      if (!cancelled) setMapError(error.message);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      unlisten?.();
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
      meRef.current?.setMap(null);
      meRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
      sdkRef.current = null;
    };
  }, [key]);

  const fitAll = () => {
    const map = mapRef.current, Tmapv2 = sdkRef.current;
    if (!map || !Tmapv2 || !points.length) return;
    const bounds = new Tmapv2.LatLngBounds();
    points.forEach((p) => bounds.extend(new Tmapv2.LatLng(p.lat, p.lng)));
    map.fitBounds(bounds);
    if (points.length === 1) map.setZoom(15);
  };

  // 핀과 경로 다시 그리기
  useEffect(() => {
    const map = mapRef.current, Tmapv2 = sdkRef.current;
    if (!map || !Tmapv2) return;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    markersRef.current = {};
    for (const line of route?.lines || []) {
      const path = line.map((p) => new Tmapv2.LatLng(p.lat, p.lng));
      overlaysRef.current.push(new Tmapv2.Polyline({ path, strokeColor: "#ffffff", strokeWeight: 9, map }));
      overlaysRef.current.push(new Tmapv2.Polyline({ path, strokeColor: "#285b6b", strokeWeight: 5, map }));
    }
    // 출발·귀가 → 배송지 → 고른 핀 순으로 그려 고른 핀이 맨 위에 오게 한다.
    const rank = (spot) => (!spot.stops.length ? 0 : spot.stops.includes(selected) ? 2 : 1);
    for (const spot of [...spots].sort((a, b) => rank(a) - rank(b))) {
      const stops = spot.stops.map((i) => day.list[i]);
      const state = !stops.length
        ? "end"
        : spot.stops.includes(selected)
          ? "on"
          : stops.every((stop) => stop?.done)
            ? "done"
            : "";
      const marker = new Tmapv2.Marker({
        position: new Tmapv2.LatLng(spot.lat, spot.lng),
        iconHTML: pin(spot.label, state, spot.stops.length > 1, stops.length ? spots.indexOf(spot) : ""),
        title: stops.length
          ? spot.stops.map((i) => `${i + 1}번 ${day.list[i]?.name || ""}`.trim()).join(", ")
          : spot.label,
        map,
      });
      overlaysRef.current.push(marker);
      if (stops.length) {
        for (const i of spot.stops) markersRef.current[i] = marker;
      }
    }
    // 핀을 누르면: 같은 자리이거나 화면에서 겹쳐 보이는 배송지를 모두 골라 볼 수 있게 한다.
    chooseRef.current = (spotIndex) => {
      const spot = spots[spotIndex];
      if (!spot?.stops.length) return;
      const near = nearbyStops(spots, spot, map.getZoom());
      const group = near.length ? near : spot.stops;
      setChoices(group.length > 1 ? group : []);
      setSelected((current) =>
        group.includes(current)
          ? group[(group.indexOf(current) + 1) % group.length]
          : group.find((i) => !day.list[i]?.done) ?? group[0],
      );
      setSheet("peek");
    };
  }, [spots, selected, day, route, mapReady]);

  // 처음 그릴 때 모든 핀이 보이게
  const fitted = useRef("");
  useEffect(() => {
    if (!mapReady) return;
    const sig = points.map((p) => `${p.label}:${p.lat}:${p.lng}`).join();
    if (sig && fitted.current !== sig) {
      fitted.current = sig;
      fitAll();
    }
  }, [points, mapReady]);

  const focus = (i, keepChoices = false) => {
    setSelected(i);
    if (!keepChoices) setChoices([]);
    setSheet("peek");
    setSearchOpen(false);
    setQuery("");
    const marker = markersRef.current[i];
    if (marker && mapRef.current)
      mapRef.current.setCenter(marker.getPosition());
    if (marker && mapRef.current)
      mapRef.current.setZoom(Math.max(mapRef.current.getZoom(), 13));
  };

  const loadRoute = () => {
    if (!key || !day.list.length) return;
    setBusy(true);
    setStatus("도로 경로를 불러오는 중…");
    fetchTmapRoute(day, key, profile, fetch, { useCache: false })
      .then((result) => {
        setRoute(result);
        setStatus("");
        if (onLocated) onLocated(result);
      })
      .catch((error) => setStatus(error.message || "경로를 불러오지 못했어요."))
      .finally(() => setBusy(false));
  };

  const showMe = () => {
    if (!navigator.geolocation) {
      setStatus("이 기기에서는 현재 위치를 쓸 수 없어요.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapRef.current;
        if (!map) return;
        const Tmapv2 = sdkRef.current;
        const here = new Tmapv2.LatLng(pos.coords.latitude, pos.coords.longitude);
        if (meRef.current) meRef.current.setPosition(here);
        else
          meRef.current = new Tmapv2.Marker({
            position: here,
            iconHTML: '<div class="me"></div>',
            title: "내 위치",
            map,
          });
        map.setCenter(here);
        map.setZoom(14);
      },
      () => setStatus("위치 권한을 허용해야 내 위치를 볼 수 있어요."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const saveKey = () => {
    const value = draft.trim();
    if (!value) return;
    localStorage.setItem(KEY, value);
    window.location.reload();
  };
  const changeProfile = (field, value) =>
    setProfile((previous) => {
      const next = { ...previous, [field]: value };
      localStorage.setItem(PROFILE, JSON.stringify(next));
      return next;
    });

  const row = selected != null ? rows[selected] : null;
  const c = row?.c;
  const phone = customerPhone(c);
  const products = c ? productList(c) : [];
  const facts = c
    ? [
        products.length ? ["제품", products.join(" / ")] : null,
        ...documentSpecificFields(c).filter(([label]) => label !== "주문·요청번호"),
        c.memo ? ["특이사항", c.memo] : null,
      ].filter(Boolean)
    : [];
  const done = day.list.filter((x) => x.done).length;

  return (
    <section className="map-full">
      <div
        id="delivery-tmap"
        ref={node}
        className="map-canvas"
        role="application"
        aria-label="배송 지도"
      />
      {(!key || mapError) && <div className="map-load-message" role="status">
        <strong>{mapError ? "T맵 지도를 표시할 수 없어요" : "T맵 지도 연결하기"}</strong>
        <span>{mapError || "지도 설정에서 T맵 앱키를 입력해 주세요."}</span>
        <button type="button" onClick={() => setSettings(true)}>지도 설정 열기</button>
      </div>}

      <div className="map-top">
        <form className="map-search" role="search" onSubmit={(e) => {
          e.preventDefault();
          if (searchResults.length) focus(searchResults[0].i);
        }}>
          {ICONS.search}
          <input
            type="search"
            aria-label="배송지 검색"
            placeholder="고객명 또는 배송지 검색"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
          />
          {query && <button type="button" className="map-search-clear" aria-label="검색어 지우기" onClick={() => { setQuery(""); setSearchOpen(false); }}>{ICONS.close}</button>}
        </form>
        {searchOpen && query.trim() && <div className="map-search-results">
          {searchResults.length ? searchResults.map(({ c, i }) => <button type="button" key={c.id || i} onClick={() => focus(i)}>
            <span className="stop-no">{i + 1}</span><span><strong>{c.name || "고객"}</strong><small>{c.addr || "주소 없음"}</small></span>
          </button>) : <p>일치하는 배송지가 없어요.</p>}
        </div>}
        <div className="map-top-actions">
          <button type="button" className="map-chip map-course-chip" onClick={onOpenCourse}>
            <strong>오늘 배송 {day.list.length}곳</strong>
            <span>귀가 {fmt(home)}{done ? ` · ${done}곳 완료` : ""}</span>
          </button>
          <div className="map-top-right">
          {key && day.list.length > 0 && (
            <button
              type="button"
              className={"map-chip route-chip" + (route ? " on" : "")}
              disabled={busy}
              onClick={loadRoute}
            >
              {ICONS.route}
              <span>
                {busy ? "불러오는 중" : route ? "경로 새로" : "도로 경로"}
              </span>
            </button>
          )}
          <button
            type="button"
            className="map-fab small"
            aria-label="지도 설정"
            onClick={() => setSettings(true)}
          >
            {ICONS.gear}
          </button>
          </div>
        </div>
      </div>

      {status && (
        <p className="map-toast" role="status">
          {status}
        </p>
      )}

      <div className={"map-side" + (sheet === "list" ? " up" : "")}>
        <button
          type="button"
          className="map-fab"
          aria-label="내 위치"
          onClick={showMe}
          disabled={!mapReady}
        >
          {ICONS.me}
        </button>
        <button
          type="button"
          className="map-fab"
          aria-label="모든 배송지 보기"
          onClick={fitAll}
          disabled={!mapReady || !points.length}
        >
          {ICONS.fit}
        </button>
      </div>

      <div className={"map-sheet " + sheet}>
        <button
          type="button"
          className="sheet-handle"
          aria-label={sheet === "list" ? "목록 접기" : "목록 펼치기"}
          onClick={() => setSheet(sheet === "list" ? "peek" : "list")}
        >
          <span />
        </button>

        {sheet === "peek" &&
          (c ? (
            <div className="sheet-stop">
              <div className="sheet-stop-head">
                <button
                  type="button"
                  className="map-fab small"
                  aria-label="이전 배송지"
                  disabled={selected === 0}
                  onClick={() => focus(selected - 1)}
                >
                  {ICONS.prev}
                </button>
                <div className="sheet-stop-title">
                  <span className={"stop-no" + (c.done ? " done" : "")}>
                    {selected + 1}
                  </span>
                  <div>
                    <strong>
                      {c.name || "고객"}
                      <span className={"doc-badge doc-" + (c.documentType || "dispatch")}>
                        {documentTypeLabel(c.documentType)}
                      </span>
                    </strong>
                    <span>{shortArea(c.addr)}</span>
                  </div>
                </div>
                <div className="sheet-eta">
                  <strong>
                    {c.done && c.doneAt ? c.doneAt : fmt(row.start)}
                  </strong>
                  <small>{c.done ? "완료" : "도착 예정"}</small>
                </div>
                <button
                  type="button"
                  className="map-fab small"
                  aria-label="다음 배송지"
                  disabled={selected === day.list.length - 1}
                  onClick={() => focus(selected + 1)}
                >
                  {ICONS.next}
                </button>
              </div>
              {choices.length > 1 && choices.includes(selected) && (
                <div className="sheet-choices" role="group" aria-label="이 핀의 배송지">
                  <small>이 핀에 배송지 {choices.length}곳</small>
                  <div>
                    {choices.map((i) => (
                      <button
                        type="button"
                        key={day.list[i]?.id || i}
                        className={selected === i ? "on" : ""}
                        aria-pressed={selected === i}
                        onClick={() => focus(i, true)}
                      >
                        <span className={"stop-no" + (day.list[i]?.done ? " done" : "")}>{i + 1}</span>
                        {day.list[i]?.name || "고객"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="sheet-addr">{c.addr || "주소 없음"}</p>
              {facts.length > 0 && (
                <dl className="sheet-facts">
                  {facts.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {!located.has(selected) && (
                <p className="note warn">
                  이 고객은 지도에 위치가 없어요. 오늘 코스 카드에서 "T맵 검색용
                  주소"를 넣어 주세요.
                </p>
              )}
              <div className="sheet-actions">
                {phone && (
                  <a className="btn" href={"tel:" + digits(phone)}>
                    {ICONS.phone}
                    {normalizePhone(phone)}
                  </a>
                )}
                <a className="btn primary" href={tmapNaviUrl(c)}>
                  {ICONS.navi}T맵 길안내
                </a>
              </div>
            </div>
          ) : (
            <div className="sheet-summary">
              {points.length ? (
                <p>핀을 누르면 고객 정보가 나와요.</p>
              ) : (
                <p>
                  {key
                    ? "도로 경로를 누르면 고객 위치가 지도에 나와요."
                    : "오른쪽 위 설정에서 T맵 키를 넣으면 고객 위치가 지도에 나와요."}
                </p>
              )}
              {unplaced.length > 0 && points.length > 0 && (
                <p className="note warn">
                  지도에 없는 곳 {unplaced.length}곳:{" "}
                  {unplaced
                    .slice(0, 3)
                    .map((i) => `${i + 1}번 ${day.list[i].name || ""}`)
                    .join(", ")}
                  {unplaced.length > 3 ? " …" : ""}
                </p>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => setSheet("list")}
              >
                배송지 목록 보기
              </button>
            </div>
          ))}

        {sheet === "list" && (
          <ol className="sheet-list">
            <li className="sheet-end">
              <span>출발</span>
              <strong>{day.depart}</strong>
              <em>{day.start.split("(")[0].trim()}</em>
            </li>
            {rows.map((r, i) => (
              <li key={r.c.id}>
                <button
                  type="button"
                  onClick={() => focus(i)}
                  className={selected === i ? "on" : ""}
                >
                  <span className={"stop-no" + (r.c.done ? " done" : "")}>
                    {i + 1}
                  </span>
                  <span className="sheet-list-text">
                    <strong>{r.c.name || "고객"}</strong>
                    <span>
                      {shortArea(r.c.addr)}
                      {!located.has(i) ? " · 지도에 없음" : ""}
                    </span>
                  </span>
                  <time>
                    {r.c.done && r.c.doneAt ? r.c.doneAt : fmt(r.start)}
                  </time>
                </button>
              </li>
            ))}
            <li className="sheet-end">
              <span>귀가</span>
              <strong>{fmt(home)}</strong>
              <em>{day.end.split("(")[0].trim()}</em>
            </li>
          </ol>
        )}
      </div>

      {settings && createPortal(
        <div
          className="map-settings"
          role="dialog"
          aria-modal="true"
          aria-label="지도 설정"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettings(false);
          }}
        >
          <div className="map-settings-card">
            <div className="map-settings-head">
              <h2>지도 설정</h2>
              <button type="button" onClick={() => setSettings(false)}>
                닫기
              </button>
            </div>
            <label className="field">
              <span>T맵 앱키</span>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoComplete="off"
                placeholder="SK open API에서 받은 App Key"
              />
            </label>
            <p className="note">T맵 지도보기 상품을 사용할 수 있는 앱키가 필요해요.</p>
            <button
              type="button"
              className="btn primary"
              disabled={!draft.trim()}
              onClick={saveKey}
            >
              앱키 저장
            </button>
            {!key && (
              <a
                className="map-help"
                href="https://openapi.sk.com/products/calc?svcSeq=4&menuSeq=5"
                target="_blank"
                rel="noreferrer"
              >
                T맵 무료 앱키 만들기 ↗
              </a>
            )}
            {key && (
              <>
                <p className="note">
                  화물차 제원을 5칸 모두 넣으면 높이·무게 제한을 지키는 화물차
                  경로로 받아요.
                </p>
                <div className="two">
                  {[
                    ["height", "높이 (cm)"],
                    ["width", "폭 (cm)"],
                    ["length", "길이 (cm)"],
                    ["weight", "적재중량 (kg)"],
                    ["totalWeight", "총중량 (kg)"],
                  ].map(([field, label]) => (
                    <label className="field" key={field}>
                      <span>{label}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={profile[field]}
                        onChange={(e) => changeProfile(field, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <p className="note">
                  {validTruck(profile)
                    ? "화물차 제원 저장됨 · 다음 경로부터 반영돼요."
                    : "아직 일반 차량 경로로 받아요."}
                </p>
                <button
                  type="button"
                  className="btn danger"
                  onClick={async () => {
                    if (!(await askConfirm("T맵 앱키를 지울까요?", { confirmLabel: "지우기", detail: "지우면 앱키를 다시 넣어야 경로와 이동 시간을 받을 수 있어요." }))) return;
                    localStorage.removeItem(KEY);
                    window.location.reload();
                  }}
                >
                  앱키 지우기
                </button>
              </>
            )}
          </div>
        </div>, document.body
      )}
    </section>
  );
}
