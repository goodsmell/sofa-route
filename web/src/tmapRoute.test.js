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

test('T맵 구간 거리·시간을 고객별 이동 시간으로 저장하고 순서가 바뀌면 다시 받아야 함을 표시한다',async()=>{
  const {routeLegs,applyLegs,legInfo}=await import('./tmapRoute.js');
  const points=[{lat:37.30,lng:126.80},{lat:37.40,lng:127.10},{lat:37.20,lng:127.00},{lat:37.33,lng:126.85}];
  const line=(from,to,distance,time)=>({geometry:{type:'LineString',coordinates:[[from.lng,from.lat],[to.lng,to.lat]]},properties:{distance,time}});
  const legs=routeLegs({features:[line(points[0],points[1],28400,2100),line(points[1],points[2],15000,1200),line(points[2],points[3],21000,1500)]},points);
  assert.deepEqual(legs,[{km:28.4,min:35},{km:15,min:20},{km:21,min:25}]);
  const split=routeLegs({features:[line(points[0],{lat:37.35,lng:127.0},10000,600),line({lat:37.35,lng:127.0},points[1],18400,1500),line(points[1],points[2],15000,1200),line(points[2],points[3],21000,1500)]},points);
  assert.deepEqual(split,[{km:28.4,min:35},{km:15,min:20},{km:21,min:25}]);
  const day={list:[{id:'a',travel:30},{id:'b',travel:30}]};
  const next=applyLegs(day,legs);
  assert.deepEqual([next.list[0].travel,next.list[1].travel,next.endTravel],[35,20,25]);
  assert.deepEqual(legInfo(next,1),{min:20,km:15,state:'tmap'});
  assert.deepEqual(legInfo(next,2),{min:25,km:21,state:'tmap'});
  const swapped={...next,list:[next.list[1],next.list[0]]};
  assert.equal(legInfo(swapped,0).state,'stale');
  assert.deepEqual(legInfo(day,0),{min:30,km:null,state:'default'});
});
