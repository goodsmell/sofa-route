import test from 'node:test';
import assert from 'node:assert/strict';
import {routeInput,applyAiOrder,planWithGemini} from './routeAI.js';

const day={
  date:'2026-11-16',
  depart:'06:40',
  start:'그레이박스 (경기 안산시 단원구 해봉로 232)',
  end:'팔곡화물차고지 (경기 안산시 팔곡산단1길 13)',
  list:[
    {id:'a',name:'홍길동',addr:'경기도 성남시 분당구 방아로29번길 7, 103동 301호 (이매동)',phone:'010-1234-5678',slot:'am',prod:'일반 소파',memo:''},
    {id:'b',name:'김철수',addr:'경기도 수원시 영통구 덕영대로 100, 202동 123호 (영통동)',phone:'010-9876-5432',slot:'pm',prod:'리클라이너',memo:'가능하면 늦게'},
  ],
};

test('AI 입력에는 이름, 전화번호, 상세 번지가 없다',()=>{
  const input=JSON.stringify(routeInput(day));
  for(const secret of ['홍길동','김철수','010-1234-5678','103동','301호','202동','123호'])assert.ok(!input.includes(secret),secret);
  assert.ok(input.includes('이매동'));
  assert.ok(input.includes('영통동'));
});

test('AI가 일부 고객을 빼거나 중복하면 코스를 바꾸지 않는다',()=>{
  assert.throws(()=>applyAiOrder(day,['a','a']));
  assert.throws(()=>applyAiOrder(day,['a']));
  assert.deepEqual(applyAiOrder(day,['b','a']).list.map(c=>c.id),['b','a']);
});

const responseFor = async(url,request)=>{
    assert.match(url,/gemini-3\.5-flash-lite:generateContent/);
    assert.equal(request.headers['x-goog-api-key'],'test-key');
    const body=JSON.parse(request.body);
    assert.ok(!JSON.stringify(body).includes('010-'));
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"order":["b","a"]}'}]}}]})};
};

test('Gemini가 준 순서를 그대로 적용한다',async()=>{
  const next=await planWithGemini(day,'test-key',responseFor);
  assert.deepEqual(next.list.map(c=>c.id),['b','a']);
  assert.equal(next.aiRecommended,true);
});
