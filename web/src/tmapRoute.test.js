import test from 'node:test';
import assert from 'node:assert/strict';
import {mapAddress,parseGeocode,routeBody,routeLines,validTruck} from './tmapRoute.js';

test('출발지 이름과 상세 호수를 빼고 주소를 검색한다',()=>{
  assert.equal(mapAddress('그레이박스 (경기 안산시 단원구 해봉로 232)'),'경기 안산시 단원구 해봉로 232');
  assert.equal(mapAddress('경기도 성남시 분당구 수내로 74, 103-1402'),'경기도 성남시 분당구 수내로 74');
});

test('지오코딩 결과에서 출입구 좌표를 우선 사용한다',()=>{
  assert.deepEqual(parseGeocode({coordinateInfo:{coordinate:[{newLatEntr:'37.51',newLonEntr:'127.01',newLat:'37.52',newLon:'127.02'}]}}),{lat:37.51,lng:127.01});
});

test('화물차 제원이 모두 유효할 때만 제한 경로를 요청한다',()=>{
  const day={date:'2026-11-16',depart:'06:40'};
  const points=[{lat:37.3,lng:126.8},{lat:37.4,lng:127.1},{lat:37.2,lng:126.9}];
  const incomplete={height:'340',weight:'3500'};
  assert.equal(validTruck(incomplete),false);
  assert.equal(routeBody(day,points,incomplete).truckHeight,undefined);
  const complete={...incomplete,width:'240',length:'650',totalWeight:'7000'};
  assert.equal(validTruck(complete),true);
  const body=routeBody(day,points,complete);
  assert.equal(body.truckHeight,'340');
  assert.equal(body.startTime,'202611160640');
  assert.equal(body.viaPoints.length,1);
});

test('도로 경로 선만 지도 좌표로 변환한다',()=>{
  const lines=routeLines({features:[{geometry:{type:'LineString',coordinates:[[127.1,37.4],[127.2,37.5]]}},{geometry:{type:'Point',coordinates:[127,37]}}]});
  assert.deepEqual(lines,[[{lat:37.4,lng:127.1},{lat:37.5,lng:127.2}]]);
});
