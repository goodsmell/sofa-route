import React, { useState } from "react";

// Gemini 키나 T맵 키가 없으면 앱을 쓰기 전에 반드시 입력하게 하는 모달.
// 닫기 버튼·바깥 클릭·Esc로 닫을 수 없고, 빠진 키를 모두 넣어야 사라진다.
const FIELDS = {
  gemini: {
    label: "Gemini API 키",
    help: "https://aistudio.google.com/api-keys",
    placeholder: "AI 사진 분석 · 코스 추천",
    type: "password",
  },
  tmap: {
    label: "T맵 앱키",
    help: "https://openapi.sk.com/products/calc?svcSeq=4&menuSeq=5",
    placeholder: "지도 · 경로 안내",
    type: "text",
  },
};

export default function KeyGate({ needGemini, needTmap, onSubmit }) {
  const [values, setValues] = useState({ gemini: "", tmap: "" });
  const needed = [needGemini && "gemini", needTmap && "tmap"].filter(Boolean);
  if (!needed.length) return null;
  const ready = needed.every((name) => values[name].trim());
  return (
    <div className="ai-overlay key-gate">
      <section
        className="key-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-gate-title"
      >
        <div className="key-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="8" cy="15" r="4" />
            <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
          </svg>
        </div>
        <h2 id="key-gate-title">키 연결</h2>
        <p className="key-sub">처음 한 번만 넣으면 이 기기에 저장돼요.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            onSubmit({
              gemini: needGemini ? values.gemini.trim() : "",
              tmap: needTmap ? values.tmap.trim() : "",
              remember: true,
            });
          }}
        >
          {needed.map((name, i) => {
            const f = FIELDS[name];
            return (
              <div className="key-field" key={name}>
                <div className="key-label">
                  <label htmlFor={`key-${name}`}>{f.label}</label>
                  <a href={f.help} target="_blank" rel="noopener noreferrer">
                    발급 ↗
                  </a>
                </div>
                <input
                  id={`key-${name}`}
                  type={f.type}
                  value={values[name]}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, [name]: event.target.value }))
                  }
                  placeholder={f.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus={i === 0}
                />
              </div>
            );
          })}
          <button className="key-submit" type="submit" disabled={!ready}>
            시작하기
          </button>
        </form>
      </section>
    </div>
  );
}
