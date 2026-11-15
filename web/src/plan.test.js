import test from 'node:test';
import assert from 'node:assert/strict';
import {driverOrder, customerOrder, applyPlan, planStops, sortByFixed} from './plan.js';

const start = {lat: 37.30, lng: 126.80}, end = {lat: 37.31, lng: 126.81};
const pos = {
  far: {lat: 37.28, lng: 127.44},   // 이천 쪽
  mid: {lat: 37.38, lng: 127.12},   // 분당 쪽
  near: {lat: 37.25, lng: 127.05},  // 수원 쪽
};
const stop = (id, o = {}) => ({id, name: id, addr: id, slot: 'any', memo: '', done: false, ...o});

test('운전 편한 순서는 가까운 곳부터 이어 한 바퀴를 돈다', () => {
  const order = driverOrder([stop('far'), stop('near'), stop('mid')], start, end, pos).map(s => s.id);
  assert.deepEqual(order.length, 3);
  assert.ok(order.indexOf('far') === 1, order.join('>'));  // 이천은 가운데: 수원/분당을 지나 다녀온다
});

test('고객 시간 순서는 오전 약속을 앞에, 오후 약속을 뒤에 둔다', () => {
  const day = {depart: '06:40'};
  const stops = [stop('near', {slot: 'pm'}), stop('far'), stop('mid', {slot: 'am'})];
  const order = customerOrder(day, stops, start, end, pos).map(s => s.id);
  assert.ok(order.indexOf('mid') < order.indexOf('near'), order.join('>'));
});

test('가능하면 늦게 요청은 뒤쪽으로 보낸다', () => {
  const day = {depart: '06:40'};
  const stops = [stop('mid', {memo: '가능하시면 오후 가장 늦은 시간대로'}), stop('near'), stop('far')];
  const order = customerOrder(day, stops, start, end, pos).map(s => s.id);
  assert.equal(order.at(-1), 'mid', order.join('>'));
});

test('추천 순서를 적용해도 완료한 곳은 앞에 남고 빠진 고객은 뒤에 붙는다', () => {
  const day = {list: [stop('a', {done: true}), stop('b'), stop('c'), stop('d')]};
  assert.deepEqual(applyPlan(day, ['d', 'b']).list.map(s => s.id), ['a', 'd', 'b', 'c']);
  assert.deepEqual(planStops(day, ['c', 'b']).map(s => s.id), ['c', 'b', 'd']);
});

test('확정 시간 순 정렬은 확정한 고객끼리만 자리를 바꾼다', () => {
  const day = {list: [stop('a', {promiseTime: '14:00'}), stop('b'), stop('c', {promiseTime: '10:00'}), stop('d', {promiseTime: '12:30'})]};
  assert.deepEqual(sortByFixed(day).list.map(s => s.id), ['c', 'b', 'd', 'a']);
});

test('추천 코스 화면은 그 순서로 받은 T맵 구간만 붙이고, 순서를 바꾸면 추천 순서만 바뀐다', async () => {
  const {planDay, movePlan, planKey} = await import('./plan.js');
  const day = {list: [stop('a'), stop('b'), stop('c')], plans: {driver: {ids: ['c', 'a', 'b']}}};
  const plain = planDay(day, day.plans.driver);
  assert.deepEqual(plain.list.map(s => s.id), ['c', 'a', 'b']);
  assert.equal(plain.list[0].travelKm, undefined);
  const legs = [{km: 10, min: 20}, {km: 5, min: 10}, {km: 7, min: 15}, {km: 30, min: 40}];
  const withLegs = {...day, plans: {driver: {...day.plans.driver, legs, legsKey: planKey(plain)}}};
  const view = planDay(withLegs, withLegs.plans.driver);
  assert.deepEqual(view.list.map(s => [s.id, s.travel, s.travelKm]), [['c', 20, 10], ['a', 10, 5], ['b', 15, 7]]);
  const moved = movePlan(withLegs, 'driver', 2, 0);
  assert.deepEqual(moved.plans.driver.ids, ['b', 'c', 'a']);
  assert.deepEqual(moved.list.map(s => s.id), ['a', 'b', 'c']);
  assert.equal(planDay(moved, moved.plans.driver).list[0].travelKm, undefined);
});

test('첫 추천 생성에서 세 코스의 구간 시간을 받고 선택한 순서에 붙인다', async () => {
  const {calculateRecommendedLegs, planDay} = await import('./plan.js');
  const day = {list: [stop('a'), stop('b'), stop('c')], plans: {
    customer: {ids: ['a', 'b', 'c']},
    driver: {ids: ['c', 'b', 'a']},
    balanced: {ids: ['b', 'a', 'c']},
  }};
  const calls = [];
  const result = await calculateRecommendedLegs(day, async ordered => {
    calls.push(ordered.list.map(c => c.id).join(','));
    return {legs: [{min: 11, km: 1}, {min: 22, km: 2}, {min: 33, km: 3}, {min: 44, km: 4}]};
  });
  assert.deepEqual(calls, ['a,b,c', 'c,b,a', 'b,a,c']);
  assert.equal(result.errors.length, 0);
  for (const kind of ['customer', 'driver', 'balanced']) {
    const view = planDay({...day, plans: result.plans}, result.plans[kind]);
    assert.deepEqual(view.list.map(c => c.travel), [11, 22, 33]);
    assert.equal(view.endTravel, 44);
  }
});

test('같은 추천 순서는 한 번만 계산하고 실패한 코스도 다시 계산할 수 있게 남긴다', async () => {
  const {calculateRecommendedLegs} = await import('./plan.js');
  const day = {list: [stop('a'), stop('b')], plans: {
    customer: {ids: ['a', 'b']}, driver: {ids: ['a', 'b']}, balanced: {ids: ['b', 'a']},
  }};
  const calls = [];
  const result = await calculateRecommendedLegs(day, async ordered => {
    const order = ordered.list.map(c => c.id).join(',');
    calls.push(order);
    if (order === 'b,a') throw new Error('경로 실패');
    return {legs: [{min: 10}, {min: 20}, {min: 30}]};
  });
  assert.deepEqual(calls, ['a,b', 'b,a']);
  assert.equal(result.plans.customer.legs, result.plans.driver.legs);
  assert.equal(result.plans.balanced.timeError, '경로 실패');
  assert.equal(result.errors.length, 1);
});
