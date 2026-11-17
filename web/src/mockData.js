import { baseCustomer } from "./logic.js";

// 사진 없이 흐름을 시험해 보기 위한 가짜 고객.
// 사진에서 읽은 것처럼 "추출 결과 확인" 목록에 들어간다.
// 이름이 모두 "테스트"로 시작해서 한 번에 골라 지울 수 있다.
export const MOCK_PREFIX = "테스트";
export const isMock = (c) => String(c?.name || "").startsWith(MOCK_PREFIX);

const FORMS = [
  {
    documentType: "dispatch",
    name: "테스트 최유진",
    addr: "경기도 이천시 시청중앙로 24 (중리동) 111동 301호",
    safePhone: "050800000001",
    orderNo: "0312958041",
    slot: "pm",
    prod: "테스트 소파 가죽 4인",
    elevatorKnown: true,
    elevSize: "11인승 이상",
    weight: "149.9",
    ladderKnown: true,
    memo: "오후 1시 이후 설치 가능합니다.",
  },
  {
    documentType: "dispatch",
    name: "테스트 김민수",
    addr: "경기도 성남시 분당구 판교역로 166 (백현동) 103동 1502호",
    safePhone: "050800000002",
    orderNo: "0312958042",
    slot: "am",
    prod: "테스트 패브릭 소파 3인",
    elevatorKnown: true,
    elevSize: "1~7인승",
    weight: "62",
    ladderKnown: true,
    bs: true,
    memo: "기존 소파 수거 부탁드립니다.",
  },
  {
    documentType: "dispatch",
    name: "테스트 박서연",
    addr: "서울특별시 송파구 올림픽로 300 (신천동) 201동 804호",
    safePhone: "050800000003",
    phone2: "01000000013",
    orderNo: "0312958043",
    slot: "any",
    prod: "테스트 리클라이너 2인",
    productRows: ["테스트 리클라이너 2인", "테스트 스툴"],
    elevatorKnown: true,
    elevSize: "8~10인승",
    weight: "88.5",
    ladderKnown: true,
  },
  {
    documentType: "dispatch",
    name: "테스트 이준호",
    addr: "경기도 수원시 영통구 광교중앙로 140 (하동) 4층",
    safePhone: "050800000004",
    orderNo: "0312958044",
    slot: "pm",
    prod: "테스트 모듈 소파 5인",
    noelev: true,
    elevatorKnown: true,
    weight: "210",
    ladderKnown: true,
    ladderNeeded: true,
    memo: "엘리베이터 없음. 사다리차 필요합니다.",
  },
  {
    documentType: "return",
    name: "테스트 정하은",
    addr: "경기도 용인시 수지구 포은대로 536 (죽전동) 105동 702호",
    safePhone: "050800000005",
    orderNo: "0412958045",
    slot: "am",
    prod: "테스트 소파 3인",
    requestReason: "색상 불만",
  },
  {
    documentType: "incident",
    name: "테스트 강도윤",
    addr: "경기도 안양시 동안구 시민대로 235 (관양동) 302동 1101호",
    safePhone: "050800000006",
    orderNo: "0512958046",
    requestReason: "다리 흔들림",
    requestDetails: "왼쪽 다리 나사 조임 요청",
  },
  {
    documentType: "move_install",
    name: "테스트 윤지아",
    addr: "경기도 화성시 동탄대로 446 (영천동) 1203동 1904호",
    fromAddr: "경기도 안산시 단원구 고잔로 54 (고잔동)",
    toAddr: "경기도 화성시 동탄대로 446 (영천동) 1203동 1904호",
    safePhone: "050800000007",
    siteNo: "S-2026-0007",
    requestDetails: "이사 후 재설치",
  },
];

// 고객 번호 표(엑셀) 사진에서 읽은 것처럼 들어가는 010 번호
const CONTACTS = [
  ["테스트 최유진", "01000000001"],
  ["테스트 김민수", "01000000002"],
  ["테스트 박서연", "01000000003"],
  ["테스트 이준호", "01000000004"],
];

export function mockImports(date) {
  return {
    pending: FORMS.map((f) =>
      baseCustomer({ ...f, source: "form", installDate: date, verified: false }),
    ),
    phoneCandidates: CONTACTS.map(([name, phone]) =>
      baseCustomer({ source: "list", name, phone }),
    ),
  };
}

// 테스트 고객의 가짜 의뢰서 사진. 실제 의뢰서처럼 표에 고객 정보를 적은 그림(JPEG)을 만든다.
const yesNo = (known, yes, a, b) => (known ? (yes ? a : b) : "");
function documentRows(c) {
  const t = c.documentType;
  const rows = [
    [t === "return" ? "배송요청일" : t === "dispatch" ? "시공일" : "요청일", c.installDate],
    ["고객명", c.name],
    [t === "return" ? "배송지주소" : t?.startsWith("move") ? "설치주소" : "고객 주소", c.addr],
    ["해체/철거주소", c.fromAddr],
    ["안심번호", c.safePhone.replace(/^(\d{4})(\d{4})(\d{4})$/, "$1-$2-$3")],
    ["연락처 2", c.phone2.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3")],
    ["주문번호", c.orderNo],
    ["현장번호", c.siteNo],
    ["제품", (c.productRows.length ? c.productRows : [c.prod]).filter(Boolean).join(" / ")],
    ["엘리베이터", c.noelev ? "없음" : c.elevSize ? "있음 · " + c.elevSize : yesNo(c.elevatorKnown, true, "있음", "")],
    ["총 무게", c.weight ? c.weight + " kg" : ""],
    ["사다리차", yesNo(c.ladderKnown, c.ladderNeeded, "필요", "불필요")],
    ["기존 소파 수거", t === "dispatch" ? (c.bs ? "있음" : "없음") : ""],
    [t === "return" ? "반품사유" : "요청사유", c.requestReason],
    ["요청사항", c.requestDetails],
    ["특이사항", c.memo],
  ];
  return rows.filter(([, v]) => v);
}

function wrap(ctx, text, width) {
  const lines = [];
  let line = "";
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > width && line) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  return [...lines, line];
}

export function mockDocumentImage(c, title) {
  const W = 900, H = 1270, pad = 60, labelW = 190;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const font = (size, weight = 400) =>
    (ctx.font = `${weight} ${size}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#111";
  font(22, 800);
  ctx.fillText("SOFA", pad, pad + 10);
  font(36, 800);
  ctx.textAlign = "center";
  ctx.fillText(title, W / 2, pad + 70);
  ctx.textAlign = "left";
  font(18);
  ctx.fillStyle = "#c0392b";
  ctx.fillText("테스트용 가짜 의뢰서", W - pad - 170, pad + 10);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  let y = pad + 110;
  font(22);
  for (const [label, value] of documentRows(c)) {
    const lines = wrap(ctx, value, W - pad * 2 - labelW - 30);
    const h = Math.max(56, lines.length * 32 + 24);
    ctx.fillStyle = "#eef1f2";
    ctx.fillRect(pad, y, labelW, h);
    ctx.strokeRect(pad, y, W - pad * 2, h);
    ctx.beginPath();
    ctx.moveTo(pad + labelW, y);
    ctx.lineTo(pad + labelW, y + h);
    ctx.stroke();
    ctx.fillStyle = "#333";
    font(20, 700);
    ctx.fillText(label, pad + 14, y + 35);
    ctx.fillStyle = "#111";
    font(22);
    lines.forEach((l, i) => ctx.fillText(l, pad + labelW + 16, y + 36 + i * 32));
    y += h;
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}
