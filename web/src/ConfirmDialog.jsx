import React, { useEffect, useRef, useState } from "react";

// 삭제처럼 되돌릴 수 없는 동작 앞에 한 번 더 묻는 모달.
// 어디서든 `await askConfirm("…")`로 부르고, 앱에 <ConfirmHost />를 하나 둔다.
let open = null;

export function askConfirm(message, { confirmLabel = "삭제", detail = "" } = {}) {
  if (!open) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => open({ message, detail, confirmLabel, resolve }));
}

export function ConfirmHost() {
  const [request, setRequest] = useState(null);
  const cancelRef = useRef(null);
  useEffect(() => {
    open = (next) => setRequest(next);
    return () => {
      open = null;
    };
  }, []);
  useEffect(() => {
    if (!request) return;
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [request]);
  if (!request) return null;
  function close(ok) {
    request.resolve(ok);
    setRequest(null);
  }
  return (
    <div className="confirm-overlay" onClick={() => close(false)}>
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={request.message}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{request.message}</h2>
        <p>{request.detail || "삭제하면 되돌릴 수 없어요."}</p>
        <div className="confirm-actions">
          <button type="button" ref={cancelRef} onClick={() => close(false)}>
            취소
          </button>
          <button type="button" className="confirm-danger" onClick={() => close(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
