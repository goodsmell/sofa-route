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

test('AI 반품의뢰서는 회수 작업과 원본 확인 대상으로 만든다',()=>{
  const [row]=normalizePhotoResult({kind:'return',customers:[{name:'박정수',addr:'서울 강서구 공항대로 20',safePhone:'0508-1234-5678',productRows:['3인 소파'],elevatorKnown:false}]},'반품.jpg');
  assert.equal(row.bs,true);
  assert.equal(row.source,'form');
  assert.equal(row.prod,'3인 소파');
  assert.equal(row.safePhone,'0508-1234-5678');
  assert.equal(row.elevatorKnown,false);
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
