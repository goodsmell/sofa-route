import React from "react";
import { digits, fmt, normalizePhone, shortArea } from "./logic.js";
import { legInfo, fmtDuration } from "./tmapRoute.js";
import {documentTypeLabel, documentSpecificFields} from './documentTypes.js';

const tmap = (address) =>
  "tmap://search?name=" + encodeURIComponent(address || "");
const nowTime = () => new Date().toTimeString().slice(0, 5);

export default function DriveView({ day, calc, onStart, onBack, onUpdate, onOpenDocument, onCopy }) {
  const index = day.list.findIndex((stop) => !stop.done);
  const current = index >= 0 ? day.list[index] : null;
  const row = index >= 0 ? calc.rows[index] : null;
  const next = index >= 0 ? day.list[index + 1] : null;
  // 전화 버튼은 안심번호(0508)가 아니라 실제 고객 번호로만 건다.
  const realPhone = (value) => value && !/^0508/.test(digits(value)) ? value : "";
  const phone = current && (realPhone(current.phone) || realPhone(current.phone2));
  const leg = index >= 0 ? legInfo(day, index) : null;
  const products = current
    ? (current.productRows?.length ? current.productRows : [current.prod]).filter(Boolean)
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
                className={stop.done ? "done" : i === index ? "current" : ""}
              />
            ))}
          </div>
          <div className="drive-main">
            <span className="drive-eyebrow">
              {index + 1}번째 방문 · {documentTypeLabel(current.documentType)} ·{" "}
              {current.arrivedAt ? "도착 기록 " + current.arrivedAt : "이동 중"}
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
            {products.length > 0 && (
              <div className="drive-products">
                <span>제품</span>
                <ul>
                  {products.map((product, i) => (
                    <li key={i}>{product}</li>
                  ))}
                </ul>
              </div>
            )}
            {documentSpecificFields(current).filter(([label]) => label !== "주문·요청번호").map(([label, value]) => <p className="drive-memo" key={label}>{label}: {value}</p>)}
            <button
              type="button"
              className="drive-doc"
              onClick={() => onOpenDocument(current)}
            >
              의뢰서 다시 보기
            </button>
            <div className="drive-eta">
              <div className="drive-eta-cols">
                <div>
                  <span>{current.arrivedAt ? "실제 도착" : "예상 도착"}</span>
                  <strong>{current.arrivedAt || fmt(row.start)}</strong>
                </div>
                {!current.arrivedAt && (
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
            {(current.memo || current.callMemo) && (
              <p className="drive-memo">
                {current.memo}
                {current.callMemo && " · 통화: " + current.callMemo}
              </p>
            )}
          </div>
          <div className="drive-actions">
            <div className="drive-links">
              <a className="btn" href={tmap(current.addr)}>
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
            {!current.arrivedAt ? (
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
            {next && (
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
