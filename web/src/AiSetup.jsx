import React from "react";

export default function AiSetup({
  open,
  mode = "route",
  keyValue,
  onKeyChange,
  remember,
  onRemember,
  onClose,
  onStart,
}) {
  if (!open) return null;
  return (
    <div
      className="ai-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="ai-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "photo" ? "AI 사진 분석 연결" : "AI 코스 연결"}
      >
        <div className="ai-dialog-head">
          <h2>{mode === "photo" ? "AI 사진 분석 연결" : "AI 코스 연결"}</h2>
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="hint">Gemini API 키가 필요합니다.</p>
        <a
          className="ai-key-link"
          href="https://aistudio.google.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
        >
          무료 키 만들기 ↗
        </a>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onStart();
          }}
        >
          <label className="field">
            <span>API 키</span>
            <input
              type="password"
              value={keyValue}
              onChange={(event) => onKeyChange(event.target.value)}
              placeholder="AI Studio에서 복사한 키"
              autoComplete="off"
              autoFocus
            />
          </label>
          <label className="chip">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => onRemember(event.target.checked)}
            />
            이 기기에 키 기억하기
          </label>
          <button
            className="primary big"
            type="submit"
            disabled={!keyValue.trim()}
          >
            {mode === "photo" ? "사진 분석에 연결" : "AI 코스 짜기"}
          </button>
        </form>
        <p className="ai-privacy">
          {mode === "photo" ? "사진 분석 시 사진 속 고객 이름·전화번호·주소가 Google Gemini에 전송됩니다." : "코스 추천 시 지역과 시간 조건만 Google에 전송됩니다. 고객 이름·전화번호·사진은 보내지 않습니다."}
        </p>
      </section>
    </div>
  );
}
