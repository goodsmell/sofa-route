// 집 안에서 하는 작업 시간(분). 이동 시간은 여기에 포함하지 않는다.
// 기본값과 추가 시간을 바꾸려면 이 파일의 숫자만 수정한다.
export const TIME_RULES = {
  standardWork: 20,
  electricOrRecliner: 30,
  noElevatorExtra: 15,
  oldSofaPickupExtra: 15,
  stoolExtra: 5,
  modularExtra: 10,
};

export function workMin(customer) {
  // 고객별 직접 입력값은 자동 계산 전체를 대신한다.
  if (+customer.work > 0) return +customer.work;
  let minutes = /리클라이너|전동/.test(customer.prod || "")
    ? TIME_RULES.electricOrRecliner
    : TIME_RULES.standardWork;
  if (customer.noelev) minutes += TIME_RULES.noElevatorExtra;
  if (customer.bs) minutes += TIME_RULES.oldSofaPickupExtra;
  if (/스툴/.test(customer.prod || "")) minutes += TIME_RULES.stoolExtra;
  if (/멀티|모듈|유닛/.test(customer.prod || "")) minutes += TIME_RULES.modularExtra;
  return minutes;
}

export const aiWorkRule = `각 집의 workMinutes는 이동 시간을 뺀 현장 작업 시간이다. 일반 작업은 ${TIME_RULES.standardWork}분이며, 계단·기존 소파 수거·특수 제품·직접 입력한 작업 시간이 반영되어 있다. 이동 시간은 별도로 고려하되 정확한 도로 이동 시간을 추측하지 말라.`;
