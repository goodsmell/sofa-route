import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  fmt,
  normalizePhone,
  digits,
  serviceMin,
  weightKg,
  stopFacts,
  shortArea,
  toMin,
  compute,
  precallList,
} from "./logic.js";
import { legInfo, fmtDuration, routeTotals } from "./tmapRoute.js";
import { isFixed, planDay } from "./plan.js";
import {documentTypeLabel, needsDocumentReread} from './documentTypes.js';

const tmap = (s) => "tmap://search?name=" + encodeURIComponent(s);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M6.6 3.5h2.6l1.4 4-2 1.6a12 12 0 0 0 6.3 6.3l1.6-2 4 1.4v2.6c0 1-.8 1.8-1.8 1.8C10.4 19.2 4.8 13.6 4.8 5.3c0-1 .8-1.8 1.8-1.8z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);
const GripIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 8h14M5 12h14M5 16h14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
const NaviIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <circle cx="12" cy="10" r="2.3" fill="currentColor" />
  </svg>
);

// 추천 코스에서 약속 시간을 넘기는 고객 목록 (아래에서 올라오는 창)
function LateSheet({ title, calc, onClose }) {
  const rows = calc.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.flags.some(([level]) => level === "bad"));
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="late-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="late-sheet" role="dialog" aria-modal="true" aria-label={title + " 시간 지연 고객"}>
        <div className="late-head">
          <div>
            <h3>시간 지연 {rows.length}곳</h3>
            <p>{title} 코스로 가면 약속 시간을 넘겨요.</p>
          </div>
          <button type="button" onClick={onClose}>닫기</button>
        </div>
        <ol className="late-list">
          {rows.map(({ row, index }) => {
            const over = row.start - row.sl.e;
            return (
              <li key={row.c.id}>
                <span className="late-order">{index + 1}</span>
                <div>
                  <strong>{row.c.name || "고객"}</strong>
                  <small>{shortArea(row.c.addr)}</small>
                  <p>
                    {row.sl.label} 약속 ~{fmt(row.sl.e)} · 예상 도착 {fmt(row.start)}
                    <em> · {fmtDuration(over)} 늦음</em>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function Leg({ day, i, busy }) {
  const info = legInfo(day, i);
  if (info.state === "tmap")
    return (
      <div className="leg">
        <span>{fmtDuration(info.min)}</span>
        <small>{info.km}km</small>
      </div>
    );
  return (
    <div className="leg muted">
      <small>{busy ? "이동 시간 계산 중" : "..."}</small>
    </div>
  );
}

function StopCard({
  row,
  index,
  count,
  open,
  onToggle,
  reminder,
  actions,
  grip,
  dragging,
  target,
  callMode,
  deliveryMode,
}) {
  const c = row.c;
  const phone = c.phone || c.safePhone;
  const late = row.flags.some(([k]) => k === "bad");
  const badges = [
    c.promiseTime
      ? c.promiseTime + " 확정"
      : c.slot === "am"
        ? "오전 약속"
        : c.slot === "pm"
          ? "오후 약속"
          : null,
    c.noelev ? "엘리베이터 없음" : null,
    c.bs ? "기존 소파 수거" : null,
    (!c.documentType || c.documentType === 'dispatch') && weightKg(c) == null ? "무게 확인" : null,
    c.geoMissing ? "T맵 주소 확인" : c.geoApprox ? "위치 대략" : null,
  ].filter(Boolean);
  return (
    <article
      className={
        "stop" +
        (c.done ? " done" : "") +
        (open ? " open" : "") +
        (dragging ? " dragging" : "") +
        (target ? " drop-target" : "")
      }
    >
      <div className="stop-head">
        <button
          type="button"
          className="stop-main"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="stop-no">{index + 1}</span>
          <span className="stop-text">
            <strong>{c.name || "이름 확인"}</strong>
            {/* 문서 종류는 이름 옆 색 뱃지로 (의뢰서 목록과 같은 모양) */}
            {c.documentType && (
              <span className={"doc-badge doc-" + c.documentType}>
                {documentTypeLabel(c.documentType)}
              </span>
            )}
          </span>
        </button>
        {callMode && phone && !c.done && (
          <a
            className="round"
            href={"tel:" + digits(phone)}
            aria-label={(c.name || "고객") + " 전화"}
          >
            <PhoneIcon />
          </a>
        )}
        {/* 이 고객만 삭제 (확인 창이 뜬다) */}
        <button
          type="button"
          className="stop-delete"
          aria-label={(c.name || "고객") + " 삭제"}
          onClick={() => actions.remove(c.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {count > 1 && (
          <button
            type="button"
            className="grip"
            aria-label={
              (c.name || "고객") + " 순서 옮기기. 꾹 누른 뒤 위아래로 끄세요"
            }
            {...grip}
          >
            <GripIcon />
          </button>
        )}
      </div>
      <button
        type="button"
        className="stop-area"
        onClick={onToggle}
        tabIndex={-1}
      >
        {c.addr || "주소 확인 필요"}
      </button>
      {(badges.length > 0 || late || reminder || c.done || !isFixed(c)) && (
        <div className="badges">
          {c.done && <span className="badge ok">완료 {c.doneAt}</span>}
          {late && !c.done && <span className="badge bad">약속 시간 넘김</span>}
          {reminder && !c.done && <span className="badge warn">먼저 전화</span>}
          {/* 통화 체크: 눌러서 통화 전 ↔ 통화 완료를 바꾼다 */}
          {callMode && !c.done && !c.promiseTime && (
            <button
              type="button"
              role="checkbox"
              aria-checked={!!c.callConfirmed}
              className={"call-check" + (c.callConfirmed ? " on" : "")}
              onClick={() =>
                actions.update(c.id, { callConfirmed: !c.callConfirmed })
              }
            >
              <span className="call-box" aria-hidden="true" />
              {c.callConfirmed ? "통화 완료" : "통화 전"}
            </button>
          )}
          {badges.map((b) => (
            <span
              key={b}
              className={
                "badge" +
                (b === "엘리베이터 없음" || b === "T맵 주소 확인"
                  ? " warn"
                  : "") +
                (b.endsWith(" 확정") ? " ok" : "") +
                (b === "무게 확인" ? " dashed" : "")
              }
            >
              {b}
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="stop-body">
          <p className="addr-full">
            {c.addr || "주소 확인 필요"}{" "}
            {c.addr && (
              <button
                type="button"
                className="text-btn"
                onClick={() => actions.copy(c.addr, "주소")}
              >
                복사
              </button>
            )}
          </p>
          {c.geoMissing && (
            <div className="fix-time warn-box">
              <p className="note warn">
                주소가 정확히 일치하지 않아 이 고객 앞뒤의 이동 시간을 계산하지 않았어요. 사진의 도로명과 번호를 확인해 고객 주소를 고치거나, 아래에 정확한 검색용 주소를 넣어 주세요.
              </p>
              <label className="field">
                <span>T맵 검색용 주소 (카드 주소는 그대로)</span>
                <input
                  type="text"
                  value={c.mapAddr || ""}
                  placeholder="도로명 주소나 아파트 이름"
                  onChange={(e) =>
                    actions.update(c.id, {
                      mapAddr: e.target.value,
                      geoAddr: "",
                    })
                  }
                />
              </label>
            </div>
          )}
          {reminder && (
            <p className="note warn">먼저 전화: {reminder.why.join(", ")}</p>
          )}
          {callMode && !c.done && (
            <div className="fix-time">
              <label>
                <span>통화로 정한 시간</span>
                <input
                  type="time"
                  value={c.promiseTime || ""}
                  onChange={(e) =>
                    actions.update(c.id, {
                      promiseTime: e.target.value,
                      callConfirmed: !!e.target.value || c.callConfirmed,
                    })
                  }
                />
              </label>
              {isFixed(c) ? (
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => actions.update(c.id, { promiseTime: "" })}
                >
                  확정 취소
                </button>
              ) : (
                <small>
                  고객 희망:{" "}
                  {c.slot === "am"
                    ? "오전 9~13시"
                    : c.slot === "pm"
                      ? "오후 13~17시"
                      : "상관없음"}
                </small>
              )}
              <div className="call-slot-actions">
                <span>통화 후 시간대</span>
                {[
                  ["am", "오전"],
                  ["pm", "오후"],
                  ["any", "시간 상관없음"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={c.slot === value ? "selected" : ""}
                    onClick={() =>
                      actions.update(c.id, { slot: value, callConfirmed: true })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  actions.update(c.id, { callConfirmed: !c.callConfirmed })
                }
              >
                {c.callConfirmed ? "통화 완료 취소" : "시간 확정"}
              </button>
            </div>
          )}
          <dl className="facts">
            {stopFacts(c).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div>
              <dt>한 집 시간</dt>
              <dd>
                {fmtDuration(serviceMin(c))} (작업만 · 이동 제외)
              </dd>
            </div>
          </dl>
          {c.callMemo && <p className="note">통화 메모: {c.callMemo}</p>}
          <div className="big-actions">
            <a className="btn primary" href={tmap(c.addr)}>
              <NaviIcon />
              T맵 길안내
            </a>
            {deliveryMode && (
              <button
                type="button"
                className={"btn" + (c.done ? "" : " ok")}
                onClick={() =>
                  actions.update(c.id, {
                    done: !c.done,
                    doneAt: !c.done
                      ? new Date().toTimeString().slice(0, 5)
                      : "",
                  })
                }
              >
                {c.done ? "완료 취소" : c.documentType && c.documentType !== 'dispatch' ? "작업 완료" : "배송 완료"}
              </button>
            )}
          </div>
          {callMode && (
            <div className="phones">
              {c.phone && (
                <a className="btn" href={"tel:" + digits(c.phone)}>
                  <PhoneIcon />
                  {normalizePhone(c.phone)}
                </a>
              )}
              {c.safePhone && (
                <a className="btn" href={"tel:" + digits(c.safePhone)}>
                  <PhoneIcon />
                  안심 {normalizePhone(c.safePhone)}
                </a>
              )}
              {c.phone2 && (
                <a className="btn" href={"tel:" + digits(c.phone2)}>
                  <PhoneIcon />
                  2차 {normalizePhone(c.phone2)}
                </a>
              )}
            </div>
          )}
          <div className="row-actions">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => actions.move(index, index - 1)}
            >
              ▲ 앞으로
            </button>
            <button
              type="button"
              disabled={index === count - 1}
              onClick={() => actions.move(index, index + 1)}
            >
              ▼ 뒤로
            </button>
            <label className="pick">
              <span>순서</span>
              <select
                value={index}
                onChange={(e) => actions.move(index, +e.target.value)}
                aria-label="몇 번째로 옮길지 고르기"
              >
                {Array.from({ length: count }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}번째
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => actions.openDocument(c)}>
              {documentTypeLabel(c.documentType)} 원본
            </button>
            {c.imageId &&
              needsDocumentReread(c) && (
                <button
                  type="button"
                  disabled={!!actions.rereadId}
                  onClick={() => actions.rereadDocument(c)}
                >
                  {actions.rereadId === c.id
                    ? "의뢰서 다시 읽는 중…"
                    : "빈 정보 다시 읽기"}
                </button>
              )}
          </div>
          <details className="sub">
            <summary>희망 시간대 · {c.documentType === 'dispatch' || !c.documentType ? '무게 · ' : ''}T맵 주소 · 고객 수정</summary>
            <div className="sub-body">
              <label className="field">
                <span>약속 시간대</span>
                <select
                  value={c.slot}
                  onChange={(e) =>
                    actions.update(c.id, {
                      slot: e.target.value,
                      promiseTime: "",
                    })
                  }
                >
                  <option value="am">오전 9~13시</option>
                  <option value="pm">오후 13~17시</option>
                  <option value="any">시간 상관없음</option>
                </select>
              </label>
              <label className="field">
                <span>T맵 검색용 주소 (카드 주소는 그대로)</span>
                <input
                  type="text"
                  value={c.mapAddr || ""}
                  placeholder="도로명 주소나 아파트 이름"
                  onChange={(e) =>
                    actions.update(c.id, {
                      mapAddr: e.target.value,
                      geoAddr: "",
                    })
                  }
                />
              </label>
              {(!c.documentType || c.documentType === 'dispatch') && <><label className="field">
                <span>엘리베이터</span>
                <select
                  value={
                    c.noelev
                      ? "no"
                      : c.elevSize || c.elevatorKnown
                        ? "yes"
                        : "unknown"
                  }
                  onChange={(e) =>
                    actions.update(
                      c.id,
                      e.target.value === "unknown"
                        ? { noelev: false, elevatorKnown: false, elevSize: "" }
                        : e.target.value === "no"
                          ? { noelev: true, elevatorKnown: true, elevSize: "" }
                          : { noelev: false, elevatorKnown: true },
                    )
                  }
                >
                  <option value="unknown">확인 전</option>
                  <option value="yes">있음</option>
                  <option value="no">없음 · 계단 작업</option>
                </select>
              </label>
              <label className="field">
                <span>총 무게 (kg)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={c.weight || ""}
                  placeholder="출고표 노란 줄의 총 무게"
                  onChange={(e) =>
                    actions.update(c.id, { weight: e.target.value })
                  }
                />
              </label>
              </>}
              {callMode && (
                <label className="field">
                  <span>통화 메모</span>
                  <textarea
                    value={c.callMemo || ""}
                    onChange={(e) =>
                      actions.update(c.id, { callMemo: e.target.value })
                    }
                  />
                </label>
              )}
              <div className="row-actions">
                <button type="button" onClick={() => actions.edit(c)}>
                  고객 정보 수정
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => actions.remove(c.id)}
                >
                  이 고객 삭제
                </button>
              </div>
            </div>
          </details>
        </div>
      )}
    </article>
  );
}

const legsReadyOf = (day) =>
  day.list.length > 0 &&
  Array.from(
    { length: day.list.length + 1 },
    (_, i) => legInfo(day, i).state,
  ).every((s) => s === "tmap");

// 고객 카드 타임라인. 확정 코스와 추천 코스가 같은 화면을 쓴다.
function Timeline({
  day,
  calc,
  calls,
  legBusy,
  actions,
  callMode,
  deliveryMode,
}) {
  const [openId, setOpenId] = useState(null);
  const [drag, setDragState] = useState(null); // {from, to}
  const dragRef = useRef(null);
  const setDrag = (next) => {
    dragRef.current = typeof next === "function" ? next(dragRef.current) : next;
    setDragState(dragRef.current);
  };
  const pointer = useRef(null);
  const listRef = useRef(null);
  const flip = useRef(null); // 놓기 직전 카드 위치(id → top). 새 순서로 그린 뒤 그 자리에서 미끄러지게 한다.
  const stopsEl = () => [...(listRef.current?.querySelectorAll("li[data-idx]") || [])];
  const legEl = (i) => listRef.current?.querySelector(`li[data-leg="${i}"]`);
  const reduceMotion = () =>
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 끄는 카드는 손가락을 따라가고, 사이에 있는 카드는 비켜 준다(transform만 바꿔서 부드럽게).
  const paint = (d) => {
    const pitchDown = d.from + 1 < d.tops.length ? d.tops[d.from + 1] - d.tops[d.from] : 0;
    const pitchUp = d.from > 0 ? d.tops[d.from] - d.tops[d.from - 1] : 0;
    stopsEl().forEach((li) => {
      const k = +li.dataset.idx,
        leg = legEl(k);
      if (k === d.from) {
        li.style.transform = `translateY(${d.dy}px) scale(1.02)`;
        li.classList.add("lifted");
        if (leg) leg.style.opacity = "0.25";
        return;
      }
      const shift =
        d.from < d.to && k > d.from && k <= d.to
          ? -pitchDown
          : d.to < d.from && k >= d.to && k < d.from
            ? pitchUp
            : 0;
      li.style.transform = shift ? `translateY(${shift}px)` : "";
      if (leg) leg.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  };
  const clearPaint = () => {
    stopsEl().forEach((li) => {
      li.style.transform = "";
      li.classList.remove("lifted");
      const leg = legEl(+li.dataset.idx);
      if (leg) {
        leg.style.transform = "";
        leg.style.opacity = "";
      }
    });
  };
  // 손가락 위치로 끄는 카드의 이동량과 놓일 자리를 정한다(원래 카드 위치 기준이라 비켜 준 카드에 흔들리지 않는다).
  const follow = () => {
    const d = dragRef.current,
      p = pointer.current;
    if (!d || !p) return;
    const dy = p.y + window.scrollY - d.startY;
    const center = d.tops[d.from] + d.heights[d.from] / 2 + dy;
    let to = d.from,
      best = Infinity;
    d.tops.forEach((top, k) => {
      const gap = Math.abs(top + d.heights[k] / 2 - center);
      if (gap < best) {
        best = gap;
        to = k;
      }
    });
    const next = { ...d, dy, to };
    dragRef.current = next;
    paint(next);
    if (to !== d.to) {
      setDragState(next);
      navigator.vibrate?.(8);
    }
  };
  useEffect(() => {
    if (!drag) return;
    let frame;
    const tick = () => {
      const p = pointer.current;
      if (p) {
        if (p.y < 110) window.scrollBy(0, -Math.ceil((110 - p.y) / 6));
        else if (p.y > window.innerHeight - 150)
          window.scrollBy(0, Math.ceil((p.y - window.innerHeight + 150) / 6));
        follow();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    document.body.classList.add("dragging-route");
    return () => {
      cancelAnimationFrame(frame);
      document.body.classList.remove("dragging-route");
    };
  }, [!!drag]);
  // 순서가 바뀐 뒤: 놓기 직전 위치에서 새 위치로 미끄러지게 한다.
  useLayoutEffect(() => {
    const before = flip.current;
    flip.current = null;
    if (!before || reduceMotion()) return;
    stopsEl().forEach((li) => {
      const old = before[li.dataset.id];
      if (old == null) return;
      const delta = old - li.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) return;
      li.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
        { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    });
    listRef.current
      ?.querySelectorAll("li[data-leg]")
      .forEach((leg) =>
        leg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" }),
      );
  }, [calc.rows.map((row) => row.c.id).join()]);
  const finish = (commit) => {
    const d = dragRef.current;
    pointer.current = null;
    if (commit && d && d.to !== d.from) {
      flip.current = Object.fromEntries(
        stopsEl().map((li) => [li.dataset.id, li.getBoundingClientRect().top]),
      );
      clearPaint();
      setDrag(null);
      actions.move(d.from, d.to);
      return;
    }
    // 제자리에 놓거나 취소하면 원래 자리로 부드럽게 돌아간다.
    stopsEl().forEach((li) => {
      if (li.style.transform && !reduceMotion())
        li.animate(
          [{ transform: li.style.transform }, { transform: "none" }],
          { duration: 200, easing: "ease-out" },
        );
    });
    clearPaint();
    setDrag(null);
  };
  // 손가락으로는 잠깐 꾹 눌러야 옮기기가 켜진다(스크롤하다 핸들을 스쳐도 순서가 바뀌지 않게).
  const HOLD_MS = 400;
  const pending = useRef(null); // {i, x, y, el, timer}
  const cancelPending = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    p.el.classList.remove("pressing");
    pending.current = null;
  };
  useEffect(() => cancelPending, []);
  const startDrag = (i, el, pointerId, x, y) => {
    try {
      el.setPointerCapture(pointerId);
    } catch {}
    const items = stopsEl();
    const tops = items.map((li) => li.getBoundingClientRect().top + window.scrollY);
    const heights = items.map((li) => li.getBoundingClientRect().height);
    pointer.current = { x, y };
    const d = { from: i, to: i, dy: 0, startY: y + window.scrollY, tops, heights };
    setDrag(d);
    paint(d);
    navigator.vibrate?.(10);
  };
  // 옮기는 동안에는 화면이 같이 스크롤되지 않게 막는다(자동 스크롤은 tick이 맡는다).
  useEffect(() => {
    if (!drag) return;
    const block = (e) => e.cancelable && e.preventDefault();
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, [!!drag]);
  const grip = (i) => ({
    onPointerDown: (e) => {
      if (e.pointerType === "mouse") {
        e.preventDefault();
        startDrag(i, e.currentTarget, e.pointerId, e.clientX, e.clientY);
        return;
      }
      cancelPending();
      const el = e.currentTarget,
        id = e.pointerId;
      el.classList.add("pressing");
      pending.current = {
        i,
        el,
        x: e.clientX,
        y: e.clientY,
        timer: setTimeout(() => {
          const p = pending.current;
          if (!p) return;
          el.classList.remove("pressing");
          pending.current = null;
          startDrag(i, el, id, p.x, p.y);
        }, HOLD_MS),
      };
    },
    onPointerMove: (e) => {
      const p = pending.current;
      if (p) {
        // 누르는 중에 손가락이 움직이면 스크롤로 보고 옮기기를 취소한다.
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPending();
        return;
      }
      if (!dragRef.current) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      follow();
    },
    onPointerUp: () => {
      if (pending.current) return cancelPending();
      finish(true);
    },
    onPointerCancel: () => {
      if (pending.current) return cancelPending();
      finish(false);
    },
    onContextMenu: (e) => e.preventDefault(),
    onKeyDown: (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        actions.move(i, i + (e.key === "ArrowUp" ? -1 : 1));
      }
    },
  });

  return (
    <>
      {drag && (
        <p className="drag-hint" role="status">
          {drag.from + 1}번 {day.list[drag.from]?.name} → {drag.to + 1}번째
          자리로
        </p>
      )}
      <ol className="timeline" ref={listRef}>
        <li className="tl-end">
          <time>{day.depart}</time>
          <div>
            <strong>출발</strong>
            <span>{day.start}</span>
          </div>
        </li>
        {calc.rows.map((row, i) => (
          <React.Fragment key={row.c.id}>
            <li className="tl-leg" data-leg={i}>
              <Leg day={day} i={i} busy={legBusy} />
            </li>
            <li className="tl-stop" data-idx={i} data-id={row.c.id}>
              <time
                className={
                  row.flags.some(([k]) => k === "bad") && !row.c.done
                    ? "late"
                    : ""
                }
              >
                {row.c.done && row.c.doneAt ? row.c.doneAt : fmt(row.start)}
              </time>
              <StopCard
                row={row}
                index={i}
                count={day.list.length}
                open={openId === row.c.id}
                onToggle={() =>
                  setOpenId(openId === row.c.id ? null : row.c.id)
                }
                reminder={
                  callMode ? calls.find((x) => x.c.id === row.c.id) : null
                }
                actions={actions}
                grip={grip(i)}
                dragging={false}
                target={false}
                callMode={callMode}
                deliveryMode={deliveryMode}
              />
            </li>
          </React.Fragment>
        ))}
        <li className="tl-leg">
          <Leg day={day} i={day.list.length} busy={legBusy} />
        </li>
        <li className="tl-end">
          <time>{fmt(calc.home)}</time>
          <div>
            <strong>귀가</strong>
            <span>{day.end}</span>
          </div>
        </li>
      </ol>
    </>
  );
}

const PLAN = {
  customer: `오전/오후 약속, 가능하면 늦게/이르게 요청, 아침 외곽·10시 이후 분당 방문을 고려해요.`,
  driver:
    "지도 좌표로 이동 거리를 줄인 순서예요. 실시간 교통은 반영하지 않습니다.",
  balanced:
    "고객 약속을 지키면서 이동 거리와 퇴근 시간대 긴 이동도 함께 고려해요.",
};
const BY = {
  ai: "AI 추천",
  map: "지도 위치로 계산",
  area: "지역 기준 대략 추천",
  rule: "시간대·지역으로 정렬",
};

const RECOMMENDATIONS = [
  ["customer", "고객 시간 우선", "약속 시간을 먼저 맞춰요"],
  ["driver", "빠른 이동", "동선을 짧게 잡아요"],
  ["balanced", "균형 추천", "약속과 이동 시간을 함께 봐요"],
];

function routeArea(address) {
  const area = shortArea(address);
  const district = area.match(/\s([가-힣]+구)(?=\s|$)/)?.[1];
  const city = area.match(/([가-힣]+)시/)?.[1];
  return (district || city || area.split(" ")[0] || "배송지").replace(/구$/, "");
}

function recommendationPath(day) {
  const start = day.start.match(/([가-힣]+)시/)?.[1] || routeArea(day.start);
  const end = day.end.match(/([가-힣]+)시/)?.[1] || routeArea(day.end);
  const places = day.list.map((customer) => routeArea(customer.addr));
  return [`${start} 출발`, ...places.filter((place, index) => place !== places[index - 1]), `${end} 귀가`].join(" → ");
}

export default function RouteView(props) {
  const { day, history, calc, calls, legBusy, aiBusy, tmapReady, actions, stage } =
    props;
  // 추천 카드의 "시간 지연"을 눌렀을 때 보여 줄 늦는 고객 목록
  const [lateView, setLateView] = useState(null);
  const [selectedMode, setModeState] = useState(() => {
    try {
      return sessionStorage.getItem("sofa-route-mode") || "customer";
    } catch {
      return "customer";
    }
  });
  const canCall = ["calling", "ready", "driving"].includes(day.phase);
  const mode = stage === 3 ? "fixed" : selectedMode === "fixed" ? "customer" : selectedMode;
  const setMode = (m) => {
    setModeState(m);
    window.scrollTo(0, 0);
    try {
      sessionStorage.setItem("sofa-route-mode", m);
    } catch {}
  };
  const rest = day.list.filter((c) => !c.done);
  const fixedList = rest.filter((c) => c.callConfirmed || isFixed(c));
  const exactList = rest.filter(isFixed);
  const fixedOutOfOrder = exactList.some(
    (c, i) =>
      i > 0 && toMin(exactList[i - 1].promiseTime) > toMin(c.promiseTime),
  );
  const needCheck = day.list.some((c) => c.verified === false);

  // 지금 보고 있는 코스: 확정 코스이거나, 고른 추천 코스 순서로 바꾼 하루
  const plan = mode === "fixed" ? null : day.plans?.[mode];
  const viewDay = plan ? planDay(day, plan) : day;
  const viewCalc = plan ? compute(viewDay) : calc;
  const viewCalls = plan ? precallList(viewCalc.rows) : calls;
  const viewActions = plan
    ? { ...actions, move: (from, to) => actions.movePlan(mode, from, to) }
    : actions;
  const ready = legsReadyOf(viewDay);
  const done = day.list.filter((c) => c.done).length;
  if (stage === 2 && day.list.length > 0 && day.plans?.customer) {
    const selectedPlan = day.plans[mode] ? mode : "customer";
    return (
      <section className="view recommendation-view">
        <div className="wrap">
          <div className="recommendation-heading">
            <div>
              <h2>추천 코스</h2>
              <p>배송지 {day.list.length}곳</p>
            </div>
            <button type="button" className="recommendation-remake" disabled={aiBusy} onClick={actions.makePlans}>
              {aiBusy ? "만드는 중…" : "다시 만들기"}
            </button>
          </div>
          <div className="recommendation-cards" role="group" aria-label="추천 코스 선택">
            {RECOMMENDATIONS.map(([kind, title, subtitle]) => {
              const recommendation = day.plans[kind];
              const available = Boolean(recommendation);
              const optionDay = available ? planDay(day, recommendation) : null;
              const optionCalc = optionDay ? compute(optionDay) : null;
              const late = optionCalc?.rows.filter((row) => row.flags.some(([level]) => level === "bad")).length ?? 0;
              const checked = selectedPlan === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={checked}
                  disabled={!available}
                  className={"recommendation-card" + (checked ? " selected" : "")}
                  // 카드만 바꾸고 화면은 그대로 둔다(위로 튀지 않게).
                  onClick={() => {
                    setModeState(kind);
                    try {
                      sessionStorage.setItem("sofa-route-mode", kind);
                    } catch {}
                  }}
                >
                  <span className="recommendation-card-heading">
                    {/* 선택 동그라미는 왼쪽에 두어 오른쪽의 "시간 지연"과 떨어뜨린다 */}
                    <span className="recommendation-radio" aria-hidden="true" />
                    <span><strong>{title}</strong><small>{available ? (recommendation.by === "area" ? "지역 기준 대략 순서" : subtitle) : "다시 만들기를 눌러 주세요"}</small></span>
                  </span>
                  {available && <>
                    <span className="recommendation-stats">
                      <span><strong>{fmt(optionCalc.home)}</strong><small>귀가 예상</small></span>
                      {late > 0 ? (
                        // 카드 선택과 따로, 누르면 늦는 고객 목록을 연다.
                        <span
                          role="button"
                          tabIndex={0}
                          className="recommendation-late"
                          aria-label={`${title} 시간 지연 ${late}곳 고객 보기`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLateView({ title, calc: optionCalc });
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            e.stopPropagation();
                            setLateView({ title, calc: optionCalc });
                          }}
                        >
                          시간 지연 {late}곳 ›
                        </span>
                      ) : (
                        <span className="recommendation-ontime">시간 지연 0곳</span>
                      )}
                    </span>
                    <span className="recommendation-path">{recommendationPath(optionDay)}</span>
                  </>}
                </button>
              );
            })}
          </div>
          {lateView && <LateSheet {...lateView} onClose={() => setLateView(null)} />}
          {tmapReady && RECOMMENDATIONS.some(([kind]) => day.plans[kind] && !legsReadyOf(planDay(day, day.plans[kind]))) && (
            <button type="button" className="btn" disabled={legBusy || aiBusy} onClick={actions.fetchAllPlanLegs}>
              {legBusy ? "이동 시간 계산 중…" : "이동 시간 계산하기 (T맵)"}
            </button>
          )}
          <button type="button" className="btn primary recommendation-continue" onClick={() => {
            actions.usePlan(selectedPlan);
            setMode("fixed");
          }}>
            이 코스로 진행하기
          </button>
          {day.plans.driver?.by === "area" && <p className="recommendation-help">T맵 위치를 받지 못해 지역 기준으로 대략 정렬했어요. 정확한 이동 순서와 구간 시간을 보려면 <button type="button" className="text-btn" onClick={() => actions.switchTab("map")}>T맵 확인하기</button></p>}
          {!actions.aiKey && <p className="recommendation-help">고객 시간 AI 추천을 쓰려면 <button type="button" className="text-btn" onClick={actions.aiSettings}>AI 키 연결</button></p>}
          {day.plans[selectedPlan]?.timeError && <p className="note warn">{day.plans[selectedPlan].timeError}</p>}
        </div>
      </section>
    );
  }
  return (
    <section className="view">
      <div className="wrap">
        {day.list.length === 0 ? (
          <div className="empty">
            <p>이 날짜에는 배송이 없어요.</p>
            <button
              type="button"
              className="btn primary"
              onClick={() => actions.switchTab("add")}
            >
              의뢰서 사진 넣기
            </button>
          </div>
        ) : (
          <>
            <div className="overview">
              <div>
                <span>배송</span>
                <strong>
                  {day.list.length}곳
                  {done > 0 && <small> · {done}곳 완료</small>}
                </strong>
              </div>
              <div>
                <span>귀가 예상</span>
                <strong>
                  {mode !== "fixed" && !plan ? "-" : fmt(viewCalc.home)}
                </strong>
              </div>
              <div>
                <span>총 운전</span>
                <strong>
                  {ready ? fmtDuration(routeTotals(viewDay).min) : "-"}
                </strong>
              </div>
            </div>

            {mode !== "fixed" && !plan ? (
              <div className="plan">
                <p className="note">{PLAN[mode]}</p>
                {!actions.aiKey && (
                  <p className="note">
                    고객 시간 AI 추천을 받으려면{" "}
                    <button
                      type="button"
                      className="text-btn"
                      onClick={actions.aiSettings}
                    >
                      AI 키 연결
                    </button>
                    을 해 주세요. 연결 전에는 시간대·지역 기준으로 정렬합니다.
                  </p>
                )}
                {!tmapReady && <p className="note warn">T맵을 연결하지 않으면 빠른 이동과 균형 추천은 지역 기준의 대략 순서로 만듭니다.</p>}
                <button
                  type="button"
                  className="btn primary"
                  disabled={aiBusy}
                  onClick={actions.makePlans}
                >
                  {aiBusy ? "추천 만드는 중…" : "추천 코스 만들기"}
                </button>
              </div>
            ) : (
              <>
                {plan ? (
                  <div className="plan-head">
                    <p className="note">{PLAN[mode]} </p>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        actions.usePlan(mode);
                        setMode("fixed");
                      }}
                    >
                      이 순서로 진행하기
                    </button>
                  </div>
                ) : (
                  <div className="fix-bar">
                    <div className="fix-meter" aria-hidden="true">
                      <span
                        style={{
                          width:
                            (rest.length
                              ? (fixedList.length / rest.length) * 100
                              : 0) + "%",
                        }}
                      />
                    </div>
                    <p>
                      {rest.length && fixedList.length === rest.length
                        ? "모든 고객 통화 완료"
                        : `통화 완료 ${fixedList.length}/${rest.length}곳`}
                    </p>
                    {fixedOutOfOrder && (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={actions.sortByFixed}
                      >
                        확정 시간 순서로 정렬
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn primary"
                      disabled={fixedList.length !== rest.length}
                      onClick={actions.ready}
                    >
                      배송 준비 완료!
                    </button>
                  </div>
                )}
                {plan?.timeError && (
                  <p className="note warn">
                    {plan.timeError} ‘이동 시간 계산하기’를 눌러 다시 받을 수 있어요.
                  </p>
                )}

                {!tmapReady && (
                  <p className="note">
                    이동 시간을 보려면 지도 탭에서 T맵을 연결하세요.{" "}
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => actions.switchTab("map")}
                    >
                      연결하기
                    </button>
                  </p>
                )}
                {tmapReady && !ready && (
                  <button
                    type="button"
                    className="btn leg-calc"
                    disabled={legBusy}
                    onClick={() => (plan ? actions.fetchPlanLegs(mode) : actions.fetchLegs())}
                  >
                    {legBusy ? "이동 시간 계산 중…" : "이동 시간 계산하기 (T맵)"}
                  </button>
                )}
                <Timeline
                  key={mode}
                  day={viewDay}
                  calc={viewCalc}
                  calls={viewCalls}
                  legBusy={legBusy}
                  actions={viewActions}
                  callMode={mode === "fixed" && canCall}
                  deliveryMode={
                    mode === "fixed" && ["ready", "driving"].includes(day.phase)
                  }
                />

                <div className="bottom-actions single">
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      actions.copy(actions.courseText(viewDay), "코스 전체")
                    }
                  >
                    코스 복사
                  </button>
                </div>
              </>
            )}
          </>
        )}

      </div>
    </section>
  );
}
