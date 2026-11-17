import React, { useState } from "react";
import "./settings.css";

// 키 변경 같은 앱 설정을 모아 두는 화면.
const KEYS = [
  {
    name: "gemini",
    label: "Gemini API 키",
    use: "AI 사진 분석 · 코스 추천",
    help: "https://aistudio.google.com/api-keys",
    type: "password",
  },
  {
    name: "tmap",
    label: "T맵 앱키",
    use: "지도 · 이동 시간 · 경로 안내",
    help: "https://openapi.sk.com/products/calc?svcSeq=4&menuSeq=5",
    type: "text",
  },
];

const masked = (key) => (key ? "••••" + key.slice(-4) : "");

function KeyRow({ field, current, onSave }) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState("");
  const close = () => {
    setEditing(false);
    setValue("");
  };
  return (
    <div className="settings-row">
      <div className="settings-row-head">
        <div>
          <strong>{field.label}</strong>
          <span className="settings-use">{field.use}</span>
        </div>
        <span className={"settings-state" + (current ? " on" : "")}>
          {current ? "연결됨 " + masked(current) : "연결 안 됨"}
        </span>
      </div>
      {editing ? (
        <form
          className="settings-edit"
          onSubmit={(event) => {
            event.preventDefault();
            const key = value.trim();
            if (!key) return;
            onSave(key);
            close();
          }}
        >
          <input
            type={field.type}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="새 키 붙여넣기"
            aria-label={"새 " + field.label}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <div className="settings-actions">
            <button type="submit" className="btn primary" disabled={!value.trim()}>
              저장
            </button>
            <button type="button" className="btn" onClick={close}>
              취소
            </button>
            <a href={field.help} target="_blank" rel="noopener noreferrer">
              키 발급 ↗
            </a>
          </div>
        </form>
      ) : (
        <button type="button" className="btn" onClick={() => setEditing(true)}>
          {current ? "키 변경" : "키 연결"}
        </button>
      )}
    </div>
  );
}

export default function Settings({ keys, onSaveKey, date, mockCount, onAddMock, onClearMock }) {
  return (
    <section className="view">
      <div className="panel">
        <h2>연결된 키</h2>
        <p className="hint">키는 이 기기에만 저장돼요.</p>
        {KEYS.map((field) => (
          <KeyRow
            key={field.name}
            field={field}
            current={keys[field.name]}
            onSave={(key) => onSaveKey(field.name, key)}
          />
        ))}
      </div>
      <div className="panel">
        <h2>테스트 데이터</h2>
        <p className="hint">
          사진 없이 흐름을 시험해 볼 수 있게 가짜 고객 7명과 고객 번호 4건을{" "}
          {date} 추출 결과 확인 목록에 넣어요. 이름이 모두 "테스트"로 시작해요.
        </p>
        <div className="settings-actions settings-mock">
          <button type="button" className="btn" onClick={onAddMock}>
            테스트 고객 넣기
          </button>
          {mockCount > 0 && (
            <button type="button" className="btn danger" onClick={onClearMock}>
              테스트 고객 {mockCount}건 지우기
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
