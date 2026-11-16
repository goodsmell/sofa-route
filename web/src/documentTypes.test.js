import test from 'node:test';
import assert from 'node:assert/strict';
import {documentTypeLabel,documentDateLabel,documentAddressLabel,documentReviewFields,documentSpecificFields,needsDocumentReread} from './documentTypes.js';
import {stopFacts} from './logic.js';

test('여섯 의뢰서의 날짜와 방문지 라벨이 문서 종류에 맞다',()=>{
  assert.deepEqual(['dispatch','return','incident','measurement','move_install','move_dismantle'].map(type=>[
    documentTypeLabel(type),documentDateLabel(type),documentAddressLabel(type),
  ]),[
    ['출고의뢰서','시공일','설치 주소'],
    ['반품의뢰서','배송요청일','회수 주소'],
    ['1회 사고조치','요청일','방문 주소'],
    ['실측','요청일','실측 주소'],
    ['이동(설치)','요청일','설치 주소'],
    ['이동(해체)','요청일','해체 주소'],
  ]);
});

test('이동 작업은 두 주소를 따로 보이고 일반 배송 항목을 표시하지 않는다',()=>{
  const customer={documentType:'move_install',installDate:'2026-11-17',addr:'설치 주소',fromAddr:'해체 주소',toAddr:'설치 주소',requestDetails:'오전 방문'};
  const facts=stopFacts(customer);
  assert.deepEqual(documentSpecificFields(customer).slice(0,2),[['해체 주소','해체 주소'],['설치 주소','설치 주소']]);
  assert.ok(facts.some(([label])=>label==='요청사항'));
  assert.ok(!facts.some(([label])=>label==='무게'||label==='엘리베이터'));
  assert.deepEqual(documentReviewFields('move_install').filter(([field])=>field.endsWith('Addr')).map(([field])=>field),['fromAddr','toAddr']);
  assert.equal(needsDocumentReread(customer),false);
});
