import {baseCustomer, normalizePhone, normalizeOcrAddress} from './logic.js';

const MODEL='gemini-3.5-flash-lite';
const ENDPOINT=`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const fields=['name','addr','phone','safePhone','phone2','installDate','slot','prod','weight','elevSize','memo'];
const stringProperties=Object.fromEntries(fields.map(key=>[key,{type:'string'}]));
const schema={
  type:'object',
  properties:{
    kind:{type:'string',enum:['dispatch','return','contacts']},
    customers:{type:'array',items:{type:'object',properties:{...stringProperties,slot:{type:'string',enum:['am','pm','any']},productRows:{type:'array',items:{type:'string'}},elevatorKnown:{type:'boolean'},noelev:{type:'boolean'},ladderKnown:{type:'boolean'},ladderNeeded:{type:'boolean'},call:{type:'boolean'}},required:['name','addr','phone','safePhone','phone2','installDate','slot','prod','weight','elevSize','memo','productRows','elevatorKnown','noelev','ladderKnown','ladderNeeded','call']}},
  },
  required:['kind','customers'],
};

export function normalizePhotoDate(value,targetDate=''){
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
  if(!result||!['dispatch','return','contacts'].includes(result.kind)||!Array.isArray(result.customers))throw new Error('AI 사진 분석 결과의 형식이 올바르지 않습니다.');
  return result.customers.filter(row=>row&&typeof row==='object').map(row=>{
    const value=key=>typeof row[key]==='string'?row[key].trim():'';
    const isList=result.kind==='contacts';
    const phone=normalizePhone(value('phone'));
    const safePhone=normalizePhone(value('safePhone'));
    const phone2=normalizePhone(value('phone2'));
    const validPhone=p=>/^0\d{9,11}$/.test(p.replace(/\D/g,''));
    const productRows=Array.isArray(row.productRows)?row.productRows.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()):[];
    return {...baseCustomer({
      source:isList?'list':'form',verified:false,name:value('name'),
      addr:isList?'':normalizeOcrAddress(value('addr')),
      phone:isList&&validPhone(phone)&&phone.startsWith('010')?phone:'',
      safePhone:!isList&&validPhone(safePhone)?safePhone:'',
      phone2:!isList&&validPhone(phone2)?phone2:'',
      installDate:normalizePhotoDate(value('installDate'),targetDate),slot:['am','pm','any'].includes(value('slot'))?value('slot'):'any',
      prod:value('prod')||productRows[0]||'',productRows,weight:value('weight'),elevSize:value('elevSize'),
      elevatorKnown:row.elevatorKnown===true,noelev:row.elevatorKnown===true&&row.noelev===true,
      ladderKnown:row.ladderKnown===true,ladderNeeded:row.ladderKnown===true&&row.ladderNeeded===true,
      call:row.call===true,bs:result.kind==='return',
      memo:[result.kind==='return'?'반품의뢰서':'',value('memo')].filter(Boolean).join(' · '),
    }),file};
  }).filter(row=>row.source==='list'?row.name&&row.phone:(!targetDate||row.installDate===targetDate)&&(row.name||row.addr||row.phone||row.safePhone));
}

function canvasData(canvas){return canvas.toDataURL('image/jpeg',.88).split(',')[1]}

export async function analyzePhoto(file,canvas,key,fetcher=fetch,targetDate=''){
  const prompt=[
    '이 사진은 소파 배송 업무의 출고의뢰서, 반품의뢰서, 또는 고객명과 전화번호가 있는 엑셀 화면이다.',
    '사진에 실제로 보이는 글자만 추출한다. 추측하거나 누락된 값을 만들어내지 않는다. 불명확한 값은 빈 문자열로 둔다.',
    'kind는 출고의뢰서 dispatch, 반품·회수의뢰서 return, 고객 전화번호 표 contacts 중 하나다.',
    '의뢰서는 고객별로 한 객체를 만든다. 반품의뢰서의 addr는 회수지/반품지 주소다.',
    targetDate?`배송 날짜는 ${targetDate}이다. 의뢰서에서는 시공일 또는 회수 예정일이 이 날짜인 고객만 추출한다. 날짜가 보이지 않거나 다른 날짜면 추출하지 않는다.`:'',
    '엑셀 화면은 표의 모든 고객 행을 각각 한 객체로 만든다. 이름과 전화번호가 같은 행인지 확인한다. 표의 주소는 잘릴 수 있으므로 addr는 비운다.',
    '실제 고객 번호(010)는 의뢰서에서 추출하지 않는다. phone은 엑셀 고객 목록의 010 번호만 적는다. safePhone은 의뢰서의 0508 안심번호, phone2는 의뢰서의 두 번째 연락처다.',
    'installDate는 YYYY-MM-DD, slot은 오전 am/오후 pm/지정 없음 any다. 제품이 여러 줄이면 productRows에 각각 넣고 prod는 첫 제품이다.',
    '엘리베이터와 사다리차의 여부가 보이지 않으면 Known은 false다. 무게는 kg 숫자만 적는다. 특이사항은 memo에 적는다.',
    '오직 지정된 JSON 형식으로 답한다.',
  ].join('\n');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),60000);
  let response;
  try{
    response=await fetcher(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:controller.signal,body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/jpeg',data:canvasData(canvas)}}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,temperature:0}})});
  }catch(error){throw new Error(error.name==='AbortError'?'AI 사진 분석 시간이 초과됐습니다.':'AI 사진 분석에 연결하지 못했습니다.');}
  finally{clearTimeout(timeout)}
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const code=payload.error?.status;throw new Error(code==='RESOURCE_EXHAUSTED'?'AI 사용 한도에 도달했습니다.':code==='API_KEY_INVALID'||response.status===403?'Gemini API 키를 확인해 주세요.':`AI 사진 분석에 실패했습니다 (${response.status}).`)}
  const content=payload.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('')||'';
  let parsed;
  try{parsed=JSON.parse(content)}catch{throw new Error('AI 사진 분석 결과를 읽지 못했습니다.')}
  return normalizePhotoResult(parsed,file.name,targetDate);
}
