import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreDay, deleteCustomer, deleteDayCustomers, shiftDate, today, emptyDay, baseCustomer, applyPhotoImports} from './logic.js';

test('엑셀 번호는 이름이 유일한 의뢰서에만 연결하고 별도 고객으로 저장하지 않는다',()=>{
  const day=emptyDay('2026-11-17');
  const onlyExcel=applyPhotoImports(day,[baseCustomer({source:'list',name:'김민수',phone:'010-1111-2222'})]);
  assert.equal(onlyExcel.day.list.length,0);
  assert.equal(onlyExcel.day.imports.length,0);
  assert.equal(onlyExcel.unmatched.length,1);
  const result=applyPhotoImports(day,[
    baseCustomer({source:'list',name:'김민수',phone:'010-1111-2222'}),
    baseCustomer({source:'form',name:'김민수',addr:'서울 강남구 123',imageId:'photo-1'}),
    baseCustomer({source:'list',name:'이영희',phone:'010-3333-4444'}),
  ]);
  assert.equal(result.day.list.length,1);
  assert.equal(result.day.list[0].phone,'010-1111-2222');
  assert.equal(result.day.imports.length,1);
  assert.equal(result.day.imports[0].phone,'010-1111-2222');
  assert.deepEqual(result.day.contacts,[]);
  assert.equal(result.matched,1);
  assert.deepEqual(result.unmatched.map(c=>c.name),['이영희']);
});

test('같은 이름의 의뢰서나 서로 다른 엑셀 번호가 중복되면 자동 연결하지 않는다',()=>{
  const day=emptyDay('2026-11-17');
  const duplicateForms=applyPhotoImports(day,[
    baseCustomer({source:'form',name:'김민수',addr:'서울 강남구 1'}),
    baseCustomer({source:'form',name:'김민수',addr:'서울 강남구 2'}),
    baseCustomer({source:'list',name:'김민수',phone:'010-1111-2222'}),
  ]);
  assert.equal(duplicateForms.matched,0);
  assert.equal(duplicateForms.unmatched.length,1);
  const conflictingPhones=applyPhotoImports(day,[
    baseCustomer({source:'form',name:'박정수',addr:'서울 강남구 3'}),
    baseCustomer({source:'list',name:'박정수',phone:'010-1111-2222'}),
    baseCustomer({source:'list',name:'박정수',phone:'010-3333-4444'}),
  ]);
  assert.equal(conflictingPhones.matched,0);
  assert.equal(conflictingPhones.unmatched.length,2);
});

test('같은 고객과 주소라도 다른 종류의 작업은 별도 방문 건으로 남긴다',()=>{
  const day=emptyDay('2026-11-17');
  const {day:result}=applyPhotoImports(day,[
    baseCustomer({source:'form',documentType:'dispatch',name:'홍길동',addr:'서울 강남구 1'}),
    baseCustomer({source:'form',documentType:'return',name:'홍길동',addr:'서울 강남구 1'}),
  ]);
  assert.deepEqual(result.list.map(item=>item.documentType),['dispatch','return']);
});

test('저장된 배송이 없으면 내일을 초기 배송 날짜로 선택한다',()=>{
  const {d}=restoreDay(null);
  assert.equal(d.date,shiftDate(today(),1));
});

test('지난 빈 날짜는 내일로 넘기고 준비한 배송 날짜는 유지한다',()=>{
  const yesterday=shiftDate(today(),-1);
  const tomorrow=shiftDate(today(),1);
  assert.equal(restoreDay({date:yesterday,list:[]}).d.date,tomorrow);
  assert.equal(restoreDay({date:yesterday,list:[{id:'customer'}]}).d.date,yesterday);
  assert.equal(restoreDay({date:yesterday,list:[],imports:[{id:'form'}]}).d.date,yesterday);
});

test('고객 한 명 삭제 시 해당 출고표 이력과 기존 경로 계산을 정리한다',()=>{
  const day={date:'2026-11-16',list:[
    {id:'a',name:'가',imageId:'photo-a',travelKm:12},
    {id:'b',name:'나',imageId:'photo-b',travelKm:9},
  ],imports:[
    {id:'import-a',name:'가',imageId:'photo-a'},
    {id:'import-b',name:'나',imageId:'photo-b'},
  ],plans:{customer:{ids:['a','b']}},endTravelKm:30};
  const result=deleteCustomer(day,'a');
  assert.deepEqual(result.list.map((c)=>c.id),['b']);
  assert.deepEqual(result.imports.map((c)=>c.id),['import-b']);
  assert.equal(result.list[0].travelKm,undefined);
  assert.equal(result.plans,null);
  assert.equal(result.endTravelKm,undefined);
  assert.equal(day.list.length,2);
});

test('날짜 전체 삭제 시 고객·출고표·연락처를 함께 비운다',()=>{
  const day={date:'2026-11-16',list:[{id:'a'}],imports:[{id:'i'}],contacts:[{id:'c'}],plans:{driver:{}},phase:'calling'};
  const result=deleteDayCustomers(day);
  assert.deepEqual(result.list,[]);
  assert.deepEqual(result.imports,[]);
  assert.deepEqual(result.contacts,[]);
  assert.equal(result.plans,null);
  assert.equal(result.phase,'draft');
});

test('주간 날짜를 하루씩 넘기면 주와 달 경계도 이동한다',async()=>{
  const {shiftDate}=await import('./logic.js');
  assert.equal(shiftDate('2026-11-15',1),'2026-11-16');
  assert.equal(shiftDate('2026-11-16',-1),'2026-11-15');
  assert.equal(shiftDate('2026-11-30',1),'2026-12-01');
});

test('출고표를 다시 읽으면 빈 정보만 채우고 직접 수정한 값은 지킨다',async()=>{
  const {fillMissingFormFields,stopFacts}=await import('./logic.js');
  const read={prod:'보네르 3000',weight:'90.2',elevatorKnown:true,noelev:false};
  const filled=fillMissingFormFields({prod:'',weight:'',noelev:false,elevatorKnown:false},read);
  assert.deepEqual(stopFacts(filled).filter(([label])=>['제품','엘리베이터','무게'].includes(label)),[['제품','보네르 3000'],['엘리베이터','있음'],['무게','90.2kg']]);
  const manual=fillMissingFormFields({prod:'직접 적은 제품',weight:'75',noelev:true,elevatorKnown:true},read);
  assert.equal(manual.prod,'직접 적은 제품');
  assert.equal(manual.weight,'75');
  assert.equal(manual.noelev,true);
});

test('다음 날 배송을 준비한 뒤 다시 열어도 그 날짜와 코스를 유지한다',()=>{
  const stored={date:'2026-11-16',depart:'06:40',start:'출발',end:'귀가',list:[{id:'1',name:'고객',addr:'주소',phone:'0508-1234-5678'}]};
  const {d,h}=restoreDay(stored,{},'2026-11-15');
  assert.equal(d.date,'2026-11-16');
  assert.equal(d.list.length,1);
  assert.equal(d.list[0].safePhone,'0508-1234-5678');
  assert.equal(h['2026-11-16'].list.length,1);
});

test('기존 기본 귀가 주소를 상록구가 포함된 주소로 바로잡는다',()=>{
  const old = {date:'2026-11-17',end:'팔곡화물차고지 (경기 안산시 팔곡산단1길 13)',list:[],plans:{driver:{ids:[]}},endTravelKm:4};
  const {d} = restoreDay(old, {}, '2026-11-17');
  assert.equal(d.end, '팔곡화물차고지 (경기 안산시 상록구 팔곡산단1길 13)');
  assert.equal(d.plans, null);
  assert.equal(d.endTravelKm, undefined);
});

test('코스 목록이 비어도 확정한 출고표 추출 이력을 날짜별로 복원한다',()=>{
  const stored={date:'2026-11-16',list:[],imports:[{id:'form-1',source:'form',name:'고객',installDate:'2026-11-16',productRows:['소파'],weight:'90.2',imageId:'image-1'}]};
  const {d,h}=restoreDay(stored,{},'2026-11-16');
  assert.equal(d.imports.length,1);
  assert.equal(d.imports[0].imageId,'image-1');
  assert.equal(h['2026-11-16'].imports[0].productRows[0],'소파');
});

test('기존에 저장한 출고표 고객도 추출 이력에 표시한다',()=>{
  const stored={date:'2026-11-16',list:[{id:'old-form',source:'form',name:'고객',addr:'경기 용인시',imageId:'old-image'}]};
  const {d}=restoreDay(stored,{},'2026-11-16');
  assert.equal(d.imports.length,1);
  assert.equal(d.imports[0].imageId,'old-image');
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

test('복사한 코스 텍스트에 전체 시간은 들어가고 고객 칸에는 정해진 항목만 들어간다',async()=>{
  const {courseText,emptyDay}=await import('./logic.js');
  const day={...emptyDay('2026-11-16'),endTravel:25,endTravelKm:21,endFrom:'a',endTravelVersion:2,list:[{id:'a',name:'최유진',addr:'경기도 이천시 시청중앙로 24',phone:'01088472689',safePhone:'050827723446',slot:'pm',orderNo:'0312958041',prod:'MVME 테이즈 소파',elevSize:'11인승 이상',weight:149.9,ladderKnown:true,ladderNeeded:false,memo:'오후 1시 이후 설치 가능',callMemo:'통화함',installDate:'2026-11-16',travel:72,travelKm:41.3,travelFrom:'start',travelVersion:2}]};
  const text=courseText(day);
  assert.match(text,/총 이동 62\.3km · 1시간 37분 · 출발~귀가/);
  const block=text.split('━━━━━━━━━━━━━━━━━━━━')[1].trim().split('\n');
  assert.match(block[0],/^1\. 최유진 · .+ · 예상 \d\d:\d\d$/);
  assert.deepEqual(block.slice(1).map(l=>l.split(':')[0]),['주소','전화','주문·요청번호','제품','엘리베이터','무게','사다리차','기존 소파 수거','특이사항']);
  assert.doesNotMatch(text,/이동: 41|문서:|통화 메모/);
});

test('사진에서 충부대로로 읽힌 주소는 중부대로로 고치고 기존 시간을 폐기한다',async()=>{
  const {restoreDay}=await import('./logic.js');
  const stored={date:'2026-11-16',depart:'06:40',list:[{id:'a',source:'form',name:'가',addr:'경기 수원시 팔달구 충부대로 123',travel:95,travelKm:70,travelFrom:'start',travelVersion:2,lat:37.1,lng:127.1,geoAddr:'경기 수원시 팔달구 충부대로 123',geoVersion:2}]};
  const {d}=restoreDay(stored,{},'2026-11-16');
  assert.equal(d.list[0].addr,'경기 수원시 팔달구 중부대로 123');
  assert.equal(d.list[0].lat,undefined);
  assert.equal(d.list[0].travel,30);
  assert.equal(d.list[0].travelKm,undefined);
});

test('T맵으로 받기 전에는 가짜 30분 대신 확인 전으로 적는다',async()=>{
  const {courseText,emptyDay}=await import('./logic.js');
  const text=courseText({...emptyDay('2026-11-16'),list:[{id:'a',name:'가',addr:'경기 성남시',slot:'any',travel:30}]});
  assert.doesNotMatch(text,/30분/);
  assert.match(text,/총 이동 확인 전/);
});

test('주소를 시·구·동만 남긴 짧은 지역으로 줄인다',async()=>{
  const {shortArea}=await import('./logic.js');
  assert.equal(shortArea('경기도 성남시 분당구 방아로29번길 7, 103동 301호 (이매동, 동양파크빌)'),'성남시 분당구 이매동');
  assert.equal(shortArea('경기도 이천시 신중리로 29 (중리동, 이천중리 우미린 어반퍼스트) 110동 804호'),'이천시 중리동');
  assert.equal(shortArea('경기도 용인시 처인구 중부대로 1168 (삼가동) 힐스테이트용인포레, 110동 1305호'),'용인시 처인구 삼가동');
  assert.equal(shortArea('서울특별시 강남구 테헤란로 1 (역삼동)'),'강남구 역삼동');
});

test('한 집 작업은 무게나 이동 거리와 관계없이 20분이고 이동은 구간별로 더한다',async()=>{
  const {compute,emptyDay}=await import('./logic.js');
  const s=(id,o)=>({id,name:id,addr:'경기',slot:'any',done:false,...o});
  const day={...emptyDay('2026-11-16'),depart:'09:00',endTravel:10,list:[
    s('light',{weight:21,travel:10}),
    s('heavy',{weight:145,travel:15}),
    s('far',{weight:90,travel:50}),
    s('unknown',{travel:20}),
  ]};
  const {rows,home}=compute(day);
  assert.deepEqual(rows.map(r=>[r.start,r.end].map(m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'))),
    [['09:10','09:30'],['09:45','10:05'],['10:55','11:15'],['11:35','11:55']]);
  assert.equal(home,12*60+5);
});

test('특수 작업은 기본 20분에 추가하고 직접 입력한 작업 시간은 그대로 쓴다',async()=>{
  const {serviceMin,emptyDay,precallList,compute}=await import('./logic.js');
  assert.equal(serviceMin({weight:30}),20);
  assert.equal(serviceMin({weight:30,noelev:true,bs:true}),50);
  assert.equal(serviceMin({weight:70,noelev:true}),35);
  assert.equal(serviceMin({prod:'전동 리클라이너'}),30);
  assert.equal(serviceMin({work:25,noelev:true,bs:true}),25);
  assert.equal(serviceMin({weight:30},35),20);
  const day={...emptyDay('2026-11-16'),depart:'16:45',list:[{id:'a',slot:'any',weight:30,travel:20,call:true,phone2:'01012345678'}]};
  const calls=precallList(compute(day).rows);
  assert.deepEqual(calls[0].why,['전날 연락 요청','늦은 도착 안내']);
});

test('배송 중 실제 도착과 다음 집 출발 시각을 이후 예상 시간에 반영한다',async()=>{
  const {compute,emptyDay}=await import('./logic.js');
  const base={...emptyDay('2026-11-16'),depart:'09:00',list:[
    {id:'a',slot:'any',weight:30,travel:10},
    {id:'b',slot:'any',weight:30,travel:20},
  ]};
  assert.equal(compute(base).rows[1].start,9*60+50);
  const arrived={...base,list:[{...base.list[0],arrivedAt:'09:25'},base.list[1]]};
  assert.equal(compute(arrived).rows[1].start,10*60+5);
  const departed={...base,list:[{...base.list[0],done:true,arrivedAt:'09:25',doneAt:'10:20'},base.list[1]]};
  assert.equal(compute(departed).rows[1].start,10*60+40);
});
