import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreDay} from './logic.js';

test('다음 날 배송을 준비한 뒤 다시 열어도 그 날짜와 코스를 유지한다',()=>{
  const stored={date:'2026-11-16',depart:'06:40',start:'출발',end:'귀가',list:[{id:'1',name:'고객',addr:'주소',phone:'0508-1234-5678'}]};
  const {d,h}=restoreDay(stored,{},'2026-11-15');
  assert.equal(d.date,'2026-11-16');
  assert.equal(d.list.length,1);
  assert.equal(d.list[0].safePhone,'0508-1234-5678');
  assert.equal(h['2026-11-16'].list.length,1);
});

test('코스 텍스트에 전화·주소·제품·엘리베이터·BS·특이사항이 순서대로 들어간다',async()=>{
  const {courseText,emptyDay}=await import('./logic.js');
  const day={...emptyDay('2026-11-16'),list:[
    {id:'a',name:'최종옥',addr:'경기 성남시 분당구 방아로29번길 7',phone:'01093744205',safePhone:'050827725843',slot:'am',prod:'보네르 3000 3인용',elevSize:'1~7인승',bs:true,memo:'직접 수령하겠습니다',travel:30},
    {id:'b',name:'주영걸',addr:'경기 용인시 기흥구 동백8로 27',phone:'01023468242',slot:'any',noelev:true,memo:'배송 전 연락주세요',travel:30},
  ]};
  const text=courseText(day);
  assert.match(text,/출발 06:40 그레이박스/);
  assert.match(text,/귀가 팔곡화물차고지/);
  assert.match(text,/1\. 최종옥[\s\S]*전화: 010-9374-4205 \/ 안심 0508-2772-5843[\s\S]*제품: 보네르 3000 3인용[\s\S]*엘리베이터: 있음 · 1~7인승[\s\S]*기존 소파 수거: 있음[\s\S]*특이사항: 직접 수령하겠습니다/);
  assert.match(text,/2\. 주영걸[\s\S]*엘리베이터: 없음/);
  assert.match(text,/2번 주영걸: 전날 연락 요청/);
});

test('복사한 코스 텍스트에 구간 이동과 전체 시간이 들어간다',async()=>{
  const {courseText,emptyDay}=await import('./logic.js');
  const day={...emptyDay('2026-11-16'),endTravel:25,endTravelKm:21,endFrom:'a',list:[{id:'a',name:'가',addr:'경기 성남시',slot:'any',travel:72,travelKm:41.3,travelFrom:'start'}]};
  const text=courseText(day);
  assert.match(text,/총 이동 62\.3km · 1시간 37분 · 출발~귀가/);
  assert.match(text,/1\. 가[^\n]*\n이동: 41\.3km · 1시간 12분\n/);
  assert.match(text,/이동: 21km · 25분\n→ 귀가/);
});

test('T맵으로 받기 전에는 가짜 30분 대신 확인 전으로 적는다',async()=>{
  const {courseText,emptyDay}=await import('./logic.js');
  const text=courseText({...emptyDay('2026-11-16'),list:[{id:'a',name:'가',addr:'경기 성남시',slot:'any',travel:30}]});
  assert.doesNotMatch(text,/30분/);
  assert.match(text,/이동: 확인 전/);
  assert.match(text,/총 이동 확인 전/);
});

test('주소를 시·구·동만 남긴 짧은 지역으로 줄인다',async()=>{
  const {shortArea}=await import('./logic.js');
  assert.equal(shortArea('경기도 성남시 분당구 방아로29번길 7, 103동 301호 (이매동, 동양파크빌)'),'성남시 분당구 이매동');
  assert.equal(shortArea('경기도 이천시 신중리로 29 (중리동, 이천중리 우미린 어반퍼스트) 110동 804호'),'이천시 중리동');
  assert.equal(shortArea('경기도 용인시 처인구 중부대로 1168 (삼가동) 힐스테이트용인포레, 110동 1305호'),'용인시 처인구 삼가동');
  assert.equal(shortArea('서울특별시 강남구 테헤란로 1 (역삼동)'),'강남구 역삼동');
});
