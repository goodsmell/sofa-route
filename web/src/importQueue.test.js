import test from 'node:test';
import assert from 'node:assert/strict';
import {updateSession,sessionOf,nextQueued,queuedCount,loadImports,saveImports,IMPORT_KEY} from './importQueue.js';

const memory=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};

test('날짜별로 대기 사진과 확인 목록을 따로 보관하고 비면 그 날짜를 지운다',()=>{
  let all={};
  all=updateSession(all,'2026-11-18',s=>({...s,queue:[{imageId:'a',name:'a.jpg'},{imageId:'b',name:'b.jpg'}]}));
  all=updateSession(all,'2026-11-19',s=>({...s,pending:[{name:'최유진'}]}));
  assert.equal(queuedCount(all),2);
  assert.deepEqual(nextQueued(all),{date:'2026-11-18',item:{imageId:'a',name:'a.jpg'}});
  assert.equal(sessionOf(all,'2026-11-19').pending[0].name,'최유진');
  assert.deepEqual(sessionOf(all,'2026-11-20').queue,[]);
  all=updateSession(all,'2026-11-18',s=>({...s,queue:[]}));
  assert.equal('2026-11-18' in all,false);
  assert.equal(nextQueued(all),null);
});

test('기기 저장소에 저장했다가 다시 열면 그대로 불러온다',()=>{
  const storage=memory();
  const all=updateSession({},'2026-11-18',s=>({...s,queue:[{imageId:'a',name:'a.jpg'}],failed:[{imageId:'b',name:'b.jpg',error:'503'}]}));
  assert.equal(saveImports(all,storage),true);
  assert.deepEqual(loadImports(storage),all);
  saveImports({},storage);
  assert.equal(storage.getItem(IMPORT_KEY),null);
  storage.setItem(IMPORT_KEY,'{깨진');
  assert.deepEqual(loadImports(storage),{});
});
