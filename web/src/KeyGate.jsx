import React, { useState } from "react";

// Gemini 키나 T맵 키가 없으면 앱을 쓰기 전에 반드시 입력하게 하는 모달.
// 닫기 버튼·바깥 클릭·Esc로 닫을 수 없고, 빠진 키를 모두 넣어야 사라진다.
export default function KeyGate({ needGemini, needTmap, onSubmit }) {
  const [gemini, setGemini] = useState(""),
    [tmap, setTmap] = useState(""),
    [remember, setRemember] = useState(true);
  if (!needGemini && !needTmap) return null;
  const ready =
    (!needGemini || gemini.trim()) && (!needTmap || tmap.trim());
  return (
    <div className="ai-overlay key-gate">
      <section
        className="ai-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-gate-title"
      >
        <div className="ai-dialog-head">
          <h2 id="key-gate-title">시작하기 전에 키를 연결해 주세요</h2>
        </div>
        <p className="hint">
          {needGemini && needTmap
            ? "AI 사진 분석·코스 추천에 Gemini 키, 지도와 경로에 T맵 앱키가 필요합니다."
            : needGemini
              ? "AI 사진 분석·코스 추천에 Gemini 키가 필요합니다."
              : "지도와 경로에 T맵 앱키가 필요합니다."}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            onSubmit({
              gemini: needGemini ? gemini.trim() : "",
              tmap: needTmap ? tmap.trim() : "",
              remember,
            });
          }}
        >
          {needGemini && (
            <>
              <label className="field">
                <span>Gemini API 키</span>
                <input
                  type="password"
                  value={gemini}
                  onChange={(event) => setGemini(event.target.value)}
                  placeholder="AI Studio에서 복사한 키"
                  autoComplete="off"
                  autoFocus
                />
              </label>
              <a
                className="ai-key-link"
                href="https://aistudio.google.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                Gemini 무료 키 만들기 ↗
              </a>
            </>
          )}
          {needTmap && (
            <>
              <label className="field">
                <span>T맵 앱키</span>
                <input
                  type="text"
                  value={tmap}
                  onChange={(event) => setTmap(event.target.value)}
                  placeholder="SK open API에서 받은 App Key"
                  autoComplete="off"
                  autoFocus={!needGemini}
                />
              </label>
              <a
                className="ai-key-link"
                href="https://openapi.sk.com/products/calc?svcSeq=4&menuSeq=5"
                target="_blank"
                rel="noopener noreferrer"
              >
                T맵 무료 앱키 만들기 ↗
              </a>
            </>
          )}
          {needGemini && (
            <label className="chip">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              이 기기에 Gemini 키 기억하기
            </label>
          )}
          <button className="primary big" type="submit" disabled={!ready}>
            연결하고 시작하기
          </button>
        </form>
        <p className="ai-privacy">
          키는 이 기기 브라우저에만 저장되고, 설정에서 언제든 바꾸거나 지울 수 있어요.
        </p>
      </section>
    </div>
  );
}
