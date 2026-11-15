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

test('이동 시간을 시간·분으로 쓰고 전체 이동 거리·시간을 합산한다',async()=>{
  const {fmtDuration,routeTotals}=await import('./tmapRoute.js');
  assert.equal(fmtDuration(52),'52분');
  assert.equal(fmtDuration(72),'1시간 12분');
  assert.equal(fmtDuration(120),'2시간');
  const day={list:[{id:'a',travel:35,travelKm:28.4,travelFrom:'start'},{id:'b',travel:20,travelKm:15,travelFrom:'a'}],endTravel:25,endTravelKm:21,endFrom:'b'};
  assert.deepEqual(routeTotals(day),{km:64.4,min:80,exact:true});
  assert.deepEqual(routeTotals({list:[{id:'a',travel:30}],endTravel:30}),{km:null,min:60,exact:false});
});

test('카드 주소는 그대로 두고 T맵이 읽기 쉬운 검색어 후보를 만든다',async()=>{
  const {roadAddress,searchCandidates}=await import('./tmapRoute.js');
  assert.equal(roadAddress('경기도 성남시 분당구 방아로29번길 7, 103동 301호 (이매동, 동양파크빌)'),'경기도 성남시 분당구 방아로29번길 7');
  assert.equal(roadAddress('경기도 이천시 신중리로 29 (중리동, 이천중리 우미린 어반퍼스트) 110동 804호'),'경기도 이천시 신중리로 29');
  const list=searchCandidates({addr:'경기도 성남시 분당구 방아로29번길 7, 103동 301호 (이매동, 동양파크빌)'});
  assert.deepEqual(list.map(c=>c.kind+':'+c.q),['addr:경기도 성남시 분당구 방아로29번길 7','poi:이매동 동양파크빌','poi:성남시 동양파크빌','addr:성남시 이매동']);
  assert.equal(searchCandidates({addr:'아무 주소',mapAddr:'경기 수원시 영통구 태장로82번길 32'})[0].q,'경기 수원시 영통구 태장로82번길 32');
});

test('첫 검색어가 실패하면 다음 후보(건물 이름)로 찾는다',async()=>{
  const {locate}=await import('./tmapRoute.js');
  const asked=[];
  const fetcher=async url=>{url=decodeURIComponent(String(url));asked.push(url.includes('/pois')?'poi':'addr');
    if(url.includes('/pois'))return {ok:true,status:200,json:async()=>({searchPoiInfo:{pois:{poi:[{frontLat:'37.36',frontLon:'127.13'}]}}})};
    return {ok:true,status:200,json:async()=>({coordinateInfo:{coordinate:[]}})}};
  const point=await locate({addr:'경기도 성남시 분당구 방아로29번길 7 (이매동, 동양파크빌)'},'k',fetcher);
  assert.deepEqual([point.lat,point.lng,point.approx],[37.36,127.13,false]);
  assert.deepEqual(asked,['addr','poi']);
});

test('T맵 응답의 출발·경유지·도착 점 사이 선을 한 구간으로 묶는다',async()=>{
  const {routeLegs}=await import('./tmapRoute.js');
  const P=(type,extra={})=>({geometry:{type:'Point',coordinates:[127,37]},properties:{pointType:type,...extra}});
  const L=(d,t)=>({geometry:{type:'LineString',coordinates:[[127,37],[127.1,37.1]]},properties:{distance:d,time:t}});
  const data={features:[P('S'),L(10000,600),L(5000,300),P('B1'),L(3000,240),P('N'),L(2000,120),P('E')]};
  const pts=[{lat:37,lng:127},{lat:37.2,lng:127.2},{lat:37.4,lng:127.4}];
  assert.deepEqual(routeLegs(data,pts),[{km:15,min:15},{km:5,min:6}]);
});

test('못 찾은 고객의 앞뒤 구간은 비워 두고 나머지 구간만 채운다',async()=>{
  const {spreadLegs,applyLegs,legInfo}=await import('./tmapRoute.js');
  // 고객 0,1,2 중 1번(가운데)을 못 찾음 → 경로: 출발(-1) → 0 → 2 → 귀가(3)
  const full=spreadLegs([{km:10,min:20},{km:8,min:15},{km:30,min:40}],[-1,0,2,3],3);
  assert.deepEqual(full,[{km:10,min:20},null,null,{km:30,min:40}]);
  const day=applyLegs({list:[{id:'a',travel:30},{id:'b',travel:30},{id:'c',travel:30}]},full);
  assert.deepEqual([0,1,2,3].map(i=>legInfo(day,i).state),['tmap','default','default','tmap']);
});

test('T맵 서버가 잠시 실패하면 다시 시도하고, 사용량 초과는 바로 알려 준다',async()=>{
  const {request}=await import('./tmapRoute.js');
  let n=0;
  const flaky=async()=>{n++;if(n<3)throw new Error('offline');return {ok:true,status:200}};
  assert.equal((await request('u',{},flaky,[1,1])).ok,true);
  assert.equal(n,3);
  await assert.rejects(request('u',{},async()=>({ok:false,status:429}),[1,1]),/사용량/);
});
