import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePhoto,normalizePhotoResult,normalizePhotoDate} from './photoAI.js';

test('선택한 배송 날짜의 의뢰서 고객만 추출하고 의뢰서의 010은 고객 번호로 쓰지 않는다',()=>{
  assert.equal(normalizePhotoDate('2026년 11월 17일','2026-11-17'),'2026-11-17');
  const rows=normalizePhotoResult({kind:'dispatch',customers:[
    {name:'내일 고객',addr:'서울 강남구 1',installDate:'2026.11.17',phone:'010-1111-2222'},
    {name:'다른 날 고객',addr:'서울 강남구 2',installDate:'2026-11-18'},
    {name:'날짜 없음',addr:'서울 강남구 3',installDate:''},
  ]},'출고.jpg','2026-11-17');
  assert.deepEqual(rows.map(row=>row.name),['내일 고객']);
  assert.equal(rows[0].phone,'');
});

test('AI가 읽은 고객 목록은 행별 010 번호만 연결하고 잘린 주소는 버린다',()=>{
  const rows=normalizePhotoResult({kind:'contacts',customers:[
    {name:'김민수',phone:'010 1234 5678',addr:'서울 강남구 ...'},
    {name:'이영희',phone:'010-2222-3333',addr:'경기 수원시 ...'},
  ]},'엑셀.jpg');
  assert.deepEqual(rows.map(row=>[row.name,row.phone,row.addr,row.source]),[
    ['김민수','010-1234-5678','','list'],['이영희','010-2222-3333','','list'],
  ]);
});

test('AI 반품의뢰서는 회수 방문지와 반품 사유를 보관한다',()=>{
  const [row]=normalizePhotoResult({kind:'return',customers:[{name:'박정수',addr:'서울 강서구 공항대로 20',safePhone:'0508-1234-5678',productRows:['3인 소파'],requestReason:'오주문',installDate:'20261117',elevatorKnown:false}]},'반품.jpg','2026-11-17');
  assert.equal(row.documentType,'return');
  assert.equal(row.bs,false);
  assert.equal(row.requestReason,'오주문');
  assert.equal(row.installDate,'2026-11-17');
  assert.equal(row.source,'form');
  assert.equal(row.prod,'3인 소파');
  assert.equal(row.safePhone,'0508-1234-5678');
  assert.equal(row.elevatorKnown,false);
});

test('여섯 의뢰서의 제목과 방문 주소를 구분하고 날짜가 다른 건은 제외한다',()=>{
  const target='2026-11-17';
  const examples=[
    ['dispatch',{addr:'경기 수원시 설치로 1',installDate:'2026-11-17'},'경기 수원시 설치로 1'],
    ['return',{addr:'서울 송파구 회수로 2',installDate:'20261117',requestReason:'오주문'},'서울 송파구 회수로 2'],
    ['incident',{addr:'경기 고양시 방문로 3',installDate:'2026.11.17',requestReason:'포장 불량',requestDetails:'부품 교체'},'경기 고양시 방문로 3'],
    ['measurement',{addr:'서울 강동구 실측로 4',installDate:'2026년 11월 17일',requestDetails:'출입문 크기 확인'},'서울 강동구 실측로 4'],
    ['move_install',{fromAddr:'경기 성남시 해체로 5',toAddr:'경기 성남시 설치로 6',installDate:'20261117'},'경기 성남시 설치로 6'],
    ['move_dismantle',{fromAddr:'경기 성남시 해체로 5',toAddr:'경기 성남시 설치로 6',installDate:'20261117'},'경기 성남시 해체로 5'],
  ];
  for(const [kind,values,visit] of examples){
    const [row]=normalizePhotoResult({kind,customers:[{name:'홍길동',...values}]},`${kind}.jpg`,target);
    assert.equal(row.documentType,kind);
    assert.equal(row.addr,visit);
    assert.equal(row.installDate,target);
    assert.equal(normalizePhotoResult({kind,customers:[{name:'홍길동',addr:visit,installDate:'20261118'}]},'다른날.jpg',target).length,0);
  }
});

test('사진 요청에는 이미지와 JSON 형식이 들어가고 결과를 검증한다',async()=>{
  let request;
  const fetcher=async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({kind:'dispatch',customers:[{name:'최은지',addr:'경기 안산시 단원구 123'}]})}]}}]})}};
  const result=await analyzePhoto({name:'출고.jpg'},{toDataURL:()=> 'data:image/jpeg;base64,abc'},'test-key',fetcher);
  assert.equal(request.contents[0].parts[1].inlineData.data,'abc');
  assert.equal(request.generationConfig.responseMimeType,'application/json');
  assert.equal(result[0].name,'최은지');
  assert.throws(()=>normalizePhotoResult({kind:'unknown',customers:[]},'x'),/형식/);
});

test('기본 모델이 503이면 기다렸다 다시 보내고, 계속 막히면 예비 모델로 넘긴다',async()=>{
  const {analyzePhoto}=await import('./photoAI.js');
  const calls=[],waits=[];
  const ok={ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({kind:'dispatch',customers:[{name:'최은지',addr:'경기 안산시'}]})}]}}]})};
  const busy={ok:false,status:503,json:async()=>({error:{status:'UNAVAILABLE'}})};
  const fetcher=async(url)=>{calls.push(url.match(/models\/([^:]+)/)[1]);return calls.length<=3?busy:ok};
  const result=await analyzePhoto({name:'a.jpg'},{toDataURL:()=>'data:image/jpeg;base64,abc'},'k',fetcher,'',async(ms)=>{waits.push(ms)});
  assert.deepEqual(calls,['gemini-3.5-flash-lite','gemini-3.5-flash-lite','gemini-3.5-flash-lite','gemini-3.5-flash']);
  assert.deepEqual(waits,[2000,5000]);
  assert.equal(result[0].name,'최은지');
});

test('두 모델 모두 막히면 실패를 알리고, 키 오류는 다시 보내지 않는다',async()=>{
  const {analyzePhoto}=await import('./photoAI.js');
  const img={toDataURL:()=>'data:image/jpeg;base64,abc'};
  let n=0;
  const busy=async()=>{n++;return {ok:false,status:503,json:async()=>({})}};
  await assert.rejects(analyzePhoto({name:'a.jpg'},img,'k',busy,'',async()=>{}),/503/);
  assert.equal(n,5);
  n=0;
  const bad=async()=>{n++;return {ok:false,status:400,json:async()=>({error:{status:'API_KEY_INVALID'}})}};
  await assert.rejects(analyzePhoto({name:'a.jpg'},img,'k',bad,'',async()=>{}),/키를 확인/);
  assert.equal(n,1);
});
