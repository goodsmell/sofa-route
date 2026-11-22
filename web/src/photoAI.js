import {baseCustomer, normalizePhone, normalizeOcrAddress, mentionsOldSofaPickup} from './logic.js';
import {DOCUMENT_TYPES} from './documentTypes.js';

const MODEL='gemini-3.5-flash-lite';
// 기본 모델이 붐벼서(503 등) 계속 거절하면 서버가 따로인 예비 모델로 한 번 더 보낸다.
const FALLBACK_MODEL='gemini-3.5-flash';
const endpoint=(model)=>`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
// 기본 모델: 바로 → 2초 → 5초 뒤 (3번), 예비 모델: 바로 → 3초 뒤 (2번)
const PLAN=[[MODEL,[0,2000,5000]],[FALLBACK_MODEL,[0,3000]]];
const BUSY=new Set([429,500,502,503,504]);
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const fields=['name','addr','phone','safePhone','phone2','installDate','slot','prod','weight','elevSize','memo','fromAddr','toAddr','requestReason','requestDetails','orderNo','siteNo'];
const stringProperties=Object.fromEntries(fields.map(key=>[key,{type:'string'}]));
const schema={
  type:'object',
  properties:{
    kind:{type:'string',enum:[...Object.keys(DOCUMENT_TYPES),'contacts']},
    customers:{type:'array',items:{type:'object',properties:{...stringProperties,slot:{type:'string',enum:['am','pm','any']},productRows:{type:'array',items:{type:'string'}},elevatorKnown:{type:'boolean'},noelev:{type:'boolean'},ladderKnown:{type:'boolean'},ladderNeeded:{type:'boolean'},call:{type:'boolean'},bs:{type:'boolean'}},required:['name','addr','phone','safePhone','phone2','installDate','slot','prod','weight','elevSize','memo','fromAddr','toAddr','requestReason','requestDetails','orderNo','siteNo','productRows','elevatorKnown','noelev','ladderKnown','ladderNeeded','call','bs']}},
  },
  required:['kind','customers'],
};

export function normalizePhotoDate(value,targetDate=''){
  const raw=String(value||'').trim();
  if(/^\d{8}$/.test(raw))value=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6)}`;
  const numbers=String(value||'').match(/\d+/g)||[];
  if(numbers.length<2)return '';
  const year=numbers.length>=3?(numbers[0].length===2?2000+Number(numbers[0]):Number(numbers[0])):Number(targetDate.slice(0,4));
  const month=Number(numbers.length>=3?numbers[1]:numbers[0]);
  const day=Number(numbers.length>=3?numbers[2]:numbers[1]);
  const date=new Date(year,month-1,day);
  return date.getFullYear()===year&&date.getMonth()+1===month&&date.getDate()===day
    ?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:'';
}

export function normalizePhotoResult(result,file,targetDate=''){
  if(!result||![...Object.keys(DOCUMENT_TYPES),'contacts'].includes(result.kind)||!Array.isArray(result.customers))throw new Error('AI 사진 분석 결과의 형식이 올바르지 않습니다.');
  return result.customers.filter(row=>row&&typeof row==='object').map(row=>{
    const value=key=>typeof row[key]==='string'?row[key].trim():'';
    const isList=result.kind==='contacts';
    const phone=normalizePhone(value('phone'));
    const safePhone=normalizePhone(value('safePhone'));
    const phone2=normalizePhone(value('phone2'));
    const validPhone=p=>/^0\d{9,11}$/.test(p.replace(/\D/g,''));
    const productRows=Array.isArray(row.productRows)?row.productRows.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()):[];
    const fromAddr=normalizeOcrAddress(value('fromAddr'));
    const toAddr=normalizeOcrAddress(value('toAddr'));
    const visitAddr=result.kind==='move_install'?toAddr||normalizeOcrAddress(value('addr'))
      :result.kind==='move_dismantle'?fromAddr||normalizeOcrAddress(value('addr'))
      :normalizeOcrAddress(value('addr'));
    return {...baseCustomer({
      source:isList?'list':'form',verified:false,name:value('name'),
      documentType:isList?'':result.kind,
      addr:isList?'':visitAddr,
      fromAddr:isList?'':fromAddr,toAddr:isList?'':toAddr,
      requestReason:isList?'':value('requestReason'),requestDetails:isList?'':value('requestDetails'),
      orderNo:isList?'':value('orderNo'),siteNo:isList?'':value('siteNo'),
      phone:isList&&validPhone(phone)&&phone.startsWith('010')?phone:'',
      safePhone:!isList&&validPhone(safePhone)?safePhone:'',
      phone2:!isList&&validPhone(phone2)?phone2:'',
      installDate:normalizePhotoDate(value('installDate'),targetDate),slot:['am','pm','any'].includes(value('slot'))?value('slot'):'any',
      prod:value('prod')||productRows[0]||'',productRows,weight:value('weight'),elevSize:value('elevSize'),
      elevatorKnown:row.elevatorKnown===true,noelev:row.elevatorKnown===true&&row.noelev===true,
      ladderKnown:row.ladderKnown===true,ladderNeeded:row.ladderKnown===true&&row.ladderNeeded===true,
      call:row.call===true,bs:row.bs===true||mentionsOldSofaPickup(value('memo')),memo:value('memo'),
    }),file};
  }).filter(row=>row.source==='list'?row.name&&row.phone:(row.name||row.addr||row.phone||row.safePhone));
}

function canvasData(canvas){return canvas.toDataURL('image/jpeg',.88).split(',')[1]}

export async function analyzePhoto(file,canvas,key,fetcher=fetch,targetDate='',wait=sleep){
  const prompt=[
    '이 사진은 소파 업무의 출고의뢰서, 반품의뢰서, 1회 사고조치 요청서, 실측 요청서, 이동(설치), 이동(해체), 또는 고객명·전화번호 엑셀 표 중 하나다.',
    '사진에 실제로 보이는 글자만 추출한다. 추측하거나 누락된 값을 만들어내지 않는다. 불명확한 값은 빈 문자열로 둔다.',
    'kind는 제목을 기준으로 dispatch=출고의뢰서, return=반품의뢰서, incident=1회 사고조치 요청서, measurement=실측, move_install=이동(설치), move_dismantle=이동(해체), contacts=엑셀 고객 번호 표 중 하나다. 비슷해 보여도 제목이 다르면 섞지 않는다.',
    '의뢰서 사진은 작업 방문 건마다 한 객체를 만든다. 엑셀 표만 여러 고객 행을 만든다.',
    'name은 실제 방문지의 고객명이다. 사업소, 담당자, 기사 이름을 고객명으로 쓰지 않는다. 고객명이 관계 표현(예: 어머님)뿐이거나 불분명하면 빈 문자열로 두어 확인받는다.',
    'dispatch는 시공일과 고객 주소, 제품정보를 읽는다. return은 배송요청일과 배송지주소(회수할 곳), 반품사유, 제품정보를 읽는다.',
    'incident는 요청일, 고객 주소, 요청사유, 요청사항을 읽는다. measurement는 요청일, 설치주소(실측 방문지), 요청사항을 읽는다.',
    'move_install과 move_dismantle은 해체/철거주소를 fromAddr, 설치주소를 toAddr에 각각 적는다. move_install의 addr는 설치주소, move_dismantle의 addr는 해체/철거주소다. 두 주소를 합치지 않는다.',
    'installDate에는 문서 유형에 맞는 실제 방문 날짜만 YYYY-MM-DD로 적는다. 출고=시공일, 반품=배송요청일, 사고조치·실측·이동=요청일이다. 원시공일, 작성일, 사진 촬영일은 방문 날짜가 아니다.',
    targetDate?`선택한 방문 날짜는 ${targetDate}이다. 방문 날짜가 이 날짜와 달라도 의뢰서는 그대로 추출하고, installDate에는 문서에 적힌 실제 날짜를 적는다. 날짜를 읽을 수 없으면 빈 문자열로 둔다.`:'',
    '엑셀 화면은 표의 모든 고객 행을 각각 한 객체로 만든다. 이름과 전화번호가 같은 행인지 확인한다. 표의 주소는 잘릴 수 있으므로 addr는 비운다.',
    '실제 고객 번호(010)는 의뢰서에서 추출하지 않는다. phone은 엑셀 고객 목록의 010 번호만 적는다. safePhone은 의뢰서의 0508 안심번호, phone2는 의뢰서의 두 번째 연락처다.',
    'slot은 오전 am/오후 pm/지정 없음 any다. 제품이 여러 줄이면 productRows에 각각 넣고 prod는 첫 제품이다. 총 무게가 없으면 weight는 빈 문자열이다.',
    '엘리베이터와 사다리차 여부가 보이지 않으면 Known은 false다. 반품사유/사고 요청사유는 requestReason, 조치·실측·이동 요청 내용은 requestDetails, 주문·요청번호는 orderNo, 현장번호는 siteNo, 그 외 특이사항은 memo에 적는다.',
    'bs는 기존 소파를 수거해야 하는지다. 의뢰서 맨 아래에 BS정보 칸이 있거나, 특이사항에 버리는/내리는 소파(쇼파)가 있다고 적혀 있으면 true, 아니면 false다.',
    '오직 지정된 JSON 형식으로 답한다.',
  ].join('\n');
  const body=JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/jpeg',data:canvasData(canvas)}}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,temperature:0}});
  let response,payload;
  plan: for(const [model,delays] of PLAN){
    for(const delay of delays){
      if(delay) await wait(delay);
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),60000);
      try{
        response=await fetcher(endpoint(model),{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:controller.signal,body});
      }catch(error){throw new Error(error.name==='AbortError'?'AI 사진 분석 시간이 초과됐습니다.':'AI 사진 분석에 연결하지 못했습니다.');}
      finally{clearTimeout(timeout)}
      payload=await response.json().catch(()=>({}));
      if(response.ok) break plan;
      if(!BUSY.has(response.status)) break plan;
      // 한도 초과는 기다려도 안 풀리니 바로 예비 모델로 넘어간다.
      if(payload.error?.status==='RESOURCE_EXHAUSTED') break;
    }
  }
  if(!response.ok){const code=payload.error?.status;throw new Error(code==='RESOURCE_EXHAUSTED'?'AI 사용 한도에 도달했습니다.':code==='API_KEY_INVALID'||response.status===403?'Gemini API 키를 확인해 주세요.':`AI 사진 분석에 실패했습니다 (${response.status}).`)}
  const content=payload.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('')||'';
  let parsed;
  try{parsed=JSON.parse(content)}catch{throw new Error('AI 사진 분석 결과를 읽지 못했습니다.')}
  return normalizePhotoResult(parsed,file.name,targetDate);
}
