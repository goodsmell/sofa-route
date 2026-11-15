import test from 'node:test';
import assert from 'node:assert/strict';
import {readWeight} from './ocr.js';

test('출고표 노란 합계 줄에서 총 무게를 읽는다',()=>{
  assert.equal(readWeight('오더별 수량 합계 4 1.581 90.2 20'),'90.2');
  assert.equal(readWeight('오더별 수량 합계 1 0.367 21.0 10'),'21');
  assert.equal(readWeight('오더별 수량 합계 7 2.709 167.2 50'),'167.2');
  assert.equal(readWeight('합계 없음'),'');
});
