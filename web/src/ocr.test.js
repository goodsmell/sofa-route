import test from 'node:test';
import assert from 'node:assert/strict';
import {readWeight,readProduct,readElevator,parseFormOCR,imageCanvas} from './ocr.js';

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
  const data={words:[word('보네르',220,680),word('3000',280,680),word('Y',760,580)],text:'오더별 수량 합계 4 1.581 90.2 20'};
  const result=parseFormOCR(data,1000,2000,'출고표.png');
  assert.equal(result.prod,'보네르 3000');
  assert.equal(result.elevatorKnown,true);
  assert.equal(result.weight,'90.2');
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
