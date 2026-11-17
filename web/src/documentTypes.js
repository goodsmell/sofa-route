export const DOCUMENT_TYPES = {
  dispatch: '출고의뢰서',
  return: '반품의뢰서',
  incident: '1회 사고조치',
  measurement: '실측',
  move_install: '이동(설치)',
  move_dismantle: '이동(해체)',
};

export const documentTypeLabel = (type) => DOCUMENT_TYPES[type] || '배송';
export const documentDateLabel = (type) => type === 'return' ? '배송요청일' : !type || type === 'dispatch' ? '시공일' : '요청일';
export const documentAddressLabel = (type) => ({
  return: '회수 주소',
  incident: '방문 주소',
  measurement: '실측 주소',
  move_install: '설치 주소',
  move_dismantle: '해체 주소',
}[type] || '설치 주소');

export function documentSpecificFields(customer) {
  const type = customer.documentType;
  const fields = [];
  if (type === 'move_install' || type === 'move_dismantle') {
    fields.push(['해체 주소', customer.fromAddr], ['설치 주소', customer.toAddr]);
  }
  if (type === 'return') fields.push(['반품 사유', customer.requestReason]);
  if (type === 'incident') fields.push(['요청 사유', customer.requestReason]);
  if (['incident', 'measurement', 'move_install', 'move_dismantle'].includes(type)) {
    fields.push(['요청사항', customer.requestDetails]);
  }
  if (customer.orderNo) fields.push(['주문·요청번호', customer.orderNo]);
  if (customer.siteNo) fields.push(['현장번호', customer.siteNo]);
  return fields.filter(([, value]) => value);
}

// 확인 화면 입력칸. 날짜 다음은 코스 복사 텍스트와 같은 순서다.
// slot·phone·products·elevator·ladder·bs·memo는 화면에서 따로 그리는 칸이다.
export function documentReviewFields(type) {
  type = type || 'dispatch';
  const fields = [
    ['installDate', documentDateLabel(type)],
    ['name', '고객명'],
    ['slot', '고객지정시간'],
  ];
  if (type === 'move_install' || type === 'move_dismantle') {
    fields.push(['fromAddr', '해체 주소'], ['toAddr', '설치 주소']);
  } else fields.push(['addr', documentAddressLabel(type)]);
  fields.push(['phone', '고객 번호'], ['safePhone', '안심번호 (0508)']);
  if (type === 'dispatch' || type === 'return') fields.push(['phone2', '연락처 2']);
  fields.push(['orderNo', '주문·요청번호']);
  if (showsProductTable(type)) fields.push(['products', '제품']);
  if (type === 'dispatch')
    fields.push(['elevator', '엘리베이터'], ['weight', '무게 (kg)'], ['ladder', '사다리차'], ['bs', '기존 소파 수거']);
  fields.push(['memo', '특이사항']);
  if (type === 'return' || type === 'incident') fields.push(['requestReason', type === 'return' ? '반품 사유' : '요청 사유']);
  if (['incident','measurement','move_install','move_dismantle'].includes(type)) fields.push(['requestDetails', '요청사항']);
  if (type !== 'dispatch') fields.push(['siteNo', '현장번호']);
  return fields;
}

export const showsProductTable = (type) => !type || type === 'dispatch' || type === 'return';

export function needsDocumentReread(customer) {
  switch (customer.documentType) {
    case 'return': return !customer.requestReason;
    case 'incident':
    case 'measurement': return !customer.requestDetails;
    case 'move_install':
    case 'move_dismantle': return !customer.fromAddr || !customer.toAddr;
    default: return !customer.prod || !customer.weight || (!customer.noelev && !customer.elevSize && !customer.elevatorKnown);
  }
}
