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
