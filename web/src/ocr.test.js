import test from 'node:test';
import assert from 'node:assert/strict';
import {readWeight,readProduct,readElevator,parseFormOCR,parseTableOCR,documentKind,readFormFields,imageCanvas} from './ocr.js';

test('사진 비율과 관계없이 문서 제목과 전화번호로 유형을 구분한다',()=>{
  assert.equal(documentKind({text:'반품 의뢰서\n고객명 김민수\n회수지 서울시 강남구'},1200,800),'return');
  assert.equal(documentKind({text:'출고의뢰서\n시공일 2026-11-16'},1200,800),'form');
  assert.equal(documentKind({text:'고객명 전화번호\n김민수 010-1234-5678'},800,1600),'table');
});

test('반품의뢰서는 회수지와 고객을 읽고 수거 작업으로 표시한다',()=>{
  const result=parseFormOCR({text:'반품의뢰서\n고객명: 김민수\n회수지: 서울특별시 강남구 테헤란로 123\n연락처: 010-1234-5678'},1200,800,'반품.jpg');
  assert.equal(result.name,'김민수');
  assert.equal(result.addr,'서울특별시 강남구 테헤란로 123');
  assert.equal(result.safePhone,'010-1234-5678');
  assert.equal(result.bs,true);
});

test('엑셀 사진의 열 위치가 달라도 행별 고객명과 010 번호를 읽는다',()=>{
  const word=(text,x,y)=>({text,bbox:{x0:x-5,x1:x+5,y0:y-5,y1:y+5}});
  const data={words:[word('1',20,100),word('김민수',360,100),word('010-1234-5678',780,100),word('2',20,140),word('이영희',360,140),word('010-2222-3333',780,140)]};
  assert.deepEqual(parseTableOCR(data,1000,1500,'목록.jpg').map(c=>[c.name,c.phone]),[['김민수','010-1234-5678'],['이영희','010-2222-3333']]);
});

test('출고표 노란 합계 줄에서 총 무게를 읽는다',()=>{
  assert.equal(readWeight('오더별 수량 합계 4 1.581 90.2 20'),'90.2');
  assert.equal(readWeight('오더별 수량 합계 1 0.367 21.0 10'),'21');
  assert.equal(readWeight('오더별 수량 합계 7 2.709 167.2 50'),'167.2');
  assert.equal(readWeight('합계 없음'),'');
  assert.equal(readWeight('총 무게 90.2kg'),'90.2');
});

test('제품명에 소파라는 단어가 없어도 출고표 제품 칸의 값을 읽는다',()=>{
  assert.equal(readProduct('제품명 보네르 3000 3인용'),'보네르 3000 3인용');
  assert.equal(readProduct('제품명'),'');
});

test('엘리베이터 있음 표시와 인승 정보는 서로 별개로 읽는다',()=>{
  assert.deepEqual(readElevator('Y'),{noelev:false,elevatorKnown:true,elevSize:''});
  assert.deepEqual(readElevator('', '15인승'),{noelev:false,elevatorKnown:true,elevSize:'15인승'});
  assert.deepEqual(readElevator('', '1~7인승'),{noelev:false,elevatorKnown:true,elevSize:'1~7인승'});
  assert.deepEqual(readElevator('N'),{noelev:true,elevatorKnown:true,elevSize:''});
});

test('출고표의 제품·엘리베이터·하단 합계 무게를 고객 정보에 채운다',()=>{
  const word=(text,x,y)=>({text,bbox:{x0:x-10,x1:x+10,y0:y-10,y1:y+10}});
  const data={words:[word('보네르',220,760),word('3000',280,760),word('Y',760,580)],text:'오더별 수량 합계 4 1.581 90.2 20'};
  const result=parseFormOCR(data,1000,2000,'출고표.png');
  assert.equal(result.prod,'보네르 3000');
  assert.equal(result.elevatorKnown,true);
  assert.equal(result.weight,'90.2');
});

test('출고표의 시공일·두 연락처·사다리차와 여러 제품 행을 읽는다',()=>{
  const word=(text,x,y)=>({text,bbox:{x0:x-8,x1:x+8,y0:y-6,y1:y+6}});
  const data={words:[
    word('2026-11-16',90,105),word('정창휘',150,220),word('0508-2772-5789',780,220),word('--',900,220),
    word('Y',760,290),word('X',950,290),
    word('포레',220,375),word('플러스',270,375),word('3인용',320,375),
    word('→',210,422),word('포레',250,422),word('1인',300,422),
  ],text:'오더별 수량 합계 4 1.581 90.2 20'};
  const result=parseFormOCR(data,1000,1000,'출고표.png');
  assert.equal(result.installDate,'2026-11-16');
  assert.equal(result.safePhone,'0508-2772-5789');
  assert.equal(result.phone2,'');
  assert.equal(result.ladderKnown,true);
  assert.equal(result.ladderNeeded,false);
  assert.deepEqual(result.productRows,['포레 플러스 3인용','→ 포레 1인']);
  assert.equal(result.weight,'90.2');
  data.words[3]=word('0508-2772-5786',900,220);
  assert.equal(parseFormOCR(data,1000,1000,'출고표.png').phone2,'0508-2772-5786');
});

test('한샘 출고표의 제품 첫 행과 노란 합계 행을 각각 다시 읽는다',async()=>{
  const canvas={width:1000,fullHeight:2000};
  const worker={recognize:async(_canvas,{rectangle})=>{
    const y=rectangle.top/canvas.fullHeight;
    const x=rectangle.left/canvas.width;
    if(y>=.35&&y<.42)return {data:{text:'보네르 3000 아이보리 3인용 오픈형 우'}};
    if(y>=.46&&y<.47)return {data:{text:x>.7?'66.0':'오더별 수량 합계 3 1.285 66.0 20'}};
    return {data:{text:''}};
  }};
  const result=await readFormFields(worker,canvas,{prod:'',weight:''});
  assert.equal(result.prod,'보네르 3000 아이보리 3인용 오픈형 우');
  assert.equal(result.weight,'66');
});

test('긴 출고표의 하단도 OCR 이미지에 포함한다',async()=>{
  const originalBitmap=globalThis.createImageBitmap,originalDocument=globalThis.document;
  try{
    globalThis.createImageBitmap=async()=>({width:1000,height:2000,close(){}});
    globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}})})};
    const canvas=await imageCanvas({});
    assert.equal(canvas.height,canvas.fullHeight);
    assert.equal(canvas.isForm,true);
  }finally{
    globalThis.createImageBitmap=originalBitmap;
    globalThis.document=originalDocument;
  }
});
