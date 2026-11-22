import React, { useState } from "react";
import { customerPhone, digits, fmt, normalizePhone, productList, shortArea } from "./logic.js";
import { legInfo, fmtDuration, tmapNaviUrl } from "./tmapRoute.js";
import {documentTypeLabel, documentSpecificFields} from './documentTypes.js';

const tmap = (address) =>
  "tmap://search?name=" + encodeURIComponent(address || "");
const nowTime = () => new Date().toTimeString().slice(0, 5);

export default function DriveView({ day, calc, onStart, onBack, onUpdate, onOpenDocument, onCopy }) {
  const live = day.list.findIndex((stop) => !stop.done);
  // 지난 집 다시 보기: 완료한 집만 고를 수 있고, 아니면 지금 집을 보여 준다.
  const [viewIdx, setViewIdx] = useState(null);
  const reviewing =
    viewIdx != null &&
    !!day.list[viewIdx]?.done &&
    (live < 0 || viewIdx < live);
  const index = reviewing ? viewIdx : live;
  const lastDone = live < 0 ? day.list.length - 1 : live - 1;
  const goPrev = () => setViewIdx(index - 1);
  const goNext = () => setViewIdx(index + 1 > lastDone ? null : index + 1);
  const backToLive = () => setViewIdx(null);
  const undoDone = () => {
    onUpdate(current.id, { done: false, doneAt: "" });
    setViewIdx(null);
  };
  const current = index >= 0 ? day.list[index] : null;
  const row = index >= 0 ? calc.rows[index] : null;
  const next = index >= 0 ? day.list[index + 1] : null;
  // 전화 버튼은 안심번호(0508)가 아니라 실제 고객 번호로만 건다.
  const phone = customerPhone(current);
  const leg = index >= 0 ? legInfo(day, index) : null;
  const products = current ? productList(current) : [];
  // 제품·요청 내용·메모를 한 카드에 이름표와 값으로 모은다.
  const facts = current
    ? [
        products.length ? ["제품", products] : null,
        ...documentSpecificFields(current)
          .filter(([label]) => label !== "현장번호")
          .map(([label, value]) => [label === "주문·요청번호" ? "주문번호" : label, value]),
        current.memo ? ["특이사항", current.memo] : null,
        current.callMemo ? ["통화 메모", current.callMemo] : null,
      ].filter(Boolean)
    : [];
  return (
    <section className="drive-view" aria-label="배송 운행 화면">
      {!day.list.length ? (
        <div className="drive-empty">
          <h2>의뢰서를 먼저 넣어 주세요</h2>
          <button className="primary big" onClick={onBack}>
            코스 짜기로 가기
          </button>
        </div>
      ) : day.phase !== "driving" && day.phase !== "ready" ? (
        <div className="drive-empty">
          <h2>고객 통화와 코스 확정을 마쳐 주세요</h2>
          <button className="primary big" onClick={onBack}>
            코스 확정하러 가기
          </button>
        </div>
      ) : day.phase !== "driving" ? (
        <div className="drive-empty drive-ready">
          <h2>확정한 코스로 출발할 준비가 됐나요?</h2>
          <button className="primary drive-big" onClick={onStart}>
            출발 !!!
          </button>
          <button className="drive-ready-back" onClick={onBack}>
            코스 다시 확인
          </button>
        </div>
      ) : !current ? (
        <div className="drive-empty">
          <span className="drive-eyebrow">배송 완료</span>
          <h2>오늘 {day.list.length}곳을 모두 마쳤어요</h2>
          <p>마지막 배송 완료 {day.list.at(-1)?.doneAt || ""}</p>
          <a className="btn primary" href={tmap(day.end)}>
            귀가 길안내
          </a>
          <button className="big" onClick={() => setViewIdx(day.list.length - 1)}>
            ‹ 이전 집 다시 보기
          </button>
          <button className="big" onClick={onBack}>
            전체 기록 보기
          </button>
        </div>
      ) : (
        <>
          <div className="drive-progress">
            {day.list.map((stop, i) => (
              <span
                key={stop.id}
                className={
                  (stop.done ? "done" : i === live ? "current" : "") +
                  (reviewing && i === index ? " viewing" : "")
                }
              />
            ))}
          </div>
          {(index > 0 || reviewing) && (
            <div className="drive-nav">
              <button type="button" onClick={goPrev} disabled={index <= 0}>
                ‹ 이전 집
              </button>
              {reviewing && (
                <button type="button" onClick={goNext}>
                  {index + 1 > lastDone ? (live < 0 ? "완료 화면 ›" : "지금 집 ›") : "다음 집 ›"}
                </button>
              )}
            </div>
          )}
          <div className={"drive-main" + (reviewing ? " reviewing" : "")}>
            <span className="drive-eyebrow">
              {index + 1}번째 방문 · {documentTypeLabel(current.documentType)} ·{" "}
              {reviewing
                ? "지난 집 · 완료 " + (current.doneAt || "")
                : current.arrivedAt
                  ? "도착 기록 " + current.arrivedAt
                  : "이동 중"}
            </span>
            <h1>{current.name || "고객"}</h1>
            <p className="drive-address">
              {current.addr}{" "}
              {current.addr && (
                <button
                  type="button"
                  className="text-btn drive-copy"
                  onClick={() => onCopy(current.addr, "주소")}
                >
                  복사
                </button>
              )}
            </p>
            <div className="drive-facts">
              {facts.length > 0 && (
                <dl>
                  {facts.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {Array.isArray(value)
                          ? value.map((v, i) => <span key={i}>{v}</span>)
                          : value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <button
                type="button"
                className="drive-doc"
                onClick={() => onOpenDocument(current)}
              >
                의뢰서 다시 보기 ›
              </button>
            </div>
            <div className="drive-eta">
              <div className="drive-eta-cols">
                <div>
                  <span>{current.arrivedAt ? "실제 도착" : "예상 도착"}</span>
                  <strong>{current.arrivedAt || fmt(row.start)}</strong>
                </div>
                {reviewing && current.doneAt && (
                  <div>
                    <span>완료</span>
                    <strong>{current.doneAt}</strong>
                  </div>
                )}
                {!current.arrivedAt && !reviewing && (
                  <div>
                    <span>예상 이동 시간</span>
                    <strong>
                      {leg?.state === "tmap"
                        ? fmtDuration(leg.min)
                        : "약 " + fmtDuration(leg?.min || 30)}
                    </strong>
                  </div>
                )}
              </div>
              {(current.promiseTime || current.slot === "am" || current.slot === "pm") && (
                <small>
                  {current.promiseTime
                    ? current.promiseTime + " 고객 약속"
                    : current.slot === "am"
                      ? "오전 희망"
                      : "오후 희망"}
                </small>
              )}
            </div>
          </div>
          <div className="drive-actions">
            <div className="drive-links">
              <a className="btn" href={tmapNaviUrl(current)}>
                길안내
              </a>
              {phone ? (
                <a className="btn" href={"tel:" + digits(phone)}>
                  전화 {normalizePhone(phone)}
                </a>
              ) : (
                <span className="btn drive-no-phone">고객 번호 없음</span>
              )}
            </div>
            {reviewing ? (
              <>
                <button className="primary drive-big" onClick={backToLive}>
                  {live < 0 ? "완료 화면으로" : "지금 집으로 돌아가기"}
                </button>
                <button type="button" className="drive-undo" onClick={undoDone}>
                  이 집 완료 취소
                </button>
              </>
            ) : !current.arrivedAt ? (
              <button
                className="primary drive-big"
                onClick={() => onUpdate(current.id, { arrivedAt: nowTime() })}
              >
                도착
              </button>
            ) : (
              <button
                className="primary drive-big"
                onClick={() =>
                  onUpdate(current.id, { done: true, doneAt: nowTime() })
                }
              >
                {next ? "다음 집 출발" : "작업 마치기"}
              </button>
            )}
            {next && !reviewing && (
              <p>
                다음: {next.name} · {shortArea(next.addr)} · 예상{" "}
                {fmt(calc.rows[index + 1].start)}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
