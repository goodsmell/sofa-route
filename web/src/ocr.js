import {baseCustomer,normalizePhone,normalizeOcrAddress} from "./logic.js";
export function loadOCR(){return new Promise((resolve,reject)=>{if(window.Tesseract){resolve(window.Tesseract);return}const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=()=>resolve(window.Tesseract);s.onerror=()=>reject(new Error('글자 읽기 도구를 내려받지 못했습니다. 인터넷 연결을 확인해 주세요.'));document.head.appendChild(s)})}
function wordsIn(words,w,h,x0,y0,x1,y1){return words.filter(q=>{const b=q.bbox||{},x=((b.x0||0)+(b.x1||0))/2/w,y=((b.y0||0)+(b.y1||0))/2/h;return x>=x0&&x<=x1&&y>=y0&&y<=y1}).sort((a,b)=>(a.bbox.y0-b.bbox.y0)>12?(a.bbox.y0-b.bbox.y0):(a.bbox.x0-b.bbox.x0)).map(q=>q.text).join(' ').trim()}
function decodeSlot(value){const s=String(value||'').replace(/\s/g,'');if(/지정불가|시간무관|09[:시]?00[-~]17[:시]?00/.test(s))return'any';if(/오전|09[:시]?00[-~]13[:시]?00/.test(s))return'am';if(/오후|13[:시]?00[-~]17[:시]?00/.test(s))return'pm';return'any'}
const phonePattern=/(?:0\s*1\s*0|0\s*5\s*0\s*8)[\d\s.()\-]{8,18}\d/g;
function phoneMatches(value){return [...String(value||'').matchAll(phonePattern)].map(m=>normalizePhone(m[0])).filter(p=>/^0\d{9,11}$/.test(p.replace(/\D/g,'')))}
function labeledValue(text,labels){const line=String(text||'').split(/\n/).find(s=>labels.test(s));return line?line.replace(labels,'').replace(/^[\s:：|]+/,'').trim():''}
export function documentKind(data,w,h){
  const text=String(data.text||'');
  if(/반품\s*(?:의뢰서|요청서|접수)|회수\s*(?:의뢰서|요청서)/.test(text))return'return';
  if(/출고\s*(?:의뢰서|요청서)|시공일|오더별\s*수량\s*합계|설치주소|고객지정시간/.test(text))return'form';
  const phones=phoneMatches(text);
  if(/고객\s*명|연락처|휴대폰|핸드폰|전화번호/.test(text)&&phones.length || phones.length>=2)return'table';
  return h>w*1.2?'form':'table';
}
// 노란 줄 "오더별 수량 합계 4 1.581 90.2 20" 에서 세 번째 숫자가 총 무게(kg)
export function readWeight(text){const value=String(text||'').replace(/,/g,''),sum=value.match(/합\s*계\s*(\d{1,3})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/),labeled=value.match(/(?:총\s*무게|총\s*중량|무게\s*합계)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:kg|㎏)?/i);const kg=sum?parseFloat(sum[3]):labeled?parseFloat(labeled[1]):NaN;return kg>0&&kg<2000?String(kg):''}
function readWeightCell(text){const value=String(text||'').replace(/,/g,'').trim();return /^\d{1,3}(?:\.\d{1,3})?$/.test(value)&&Number(value)>0?String(Number(value)):''}
export function readProduct(text){
  const value=String(text||'').replace(/^\s*제품(?:명)?\s*[:：]?\s*/,'').replace(/\s+/g,' ').trim();
  return value&&value.length<120&&!/^(제품|모델|품목|확인|없음)$/.test(value)?value:'';
}
export function readElevator(text,capacity=''){
  const value=String(text||'').replace(/\s+/g,'').trim();
  const size=String(capacity||'').match(/\d+(?:\s*[~\-]\s*\d+)?\s*인승/)?.[0]||'';
  if(/^(?:N|X|무|없음|계단|불가|미설치)$/i.test(value))return {noelev:true,elevatorKnown:true,elevSize:''};
  if(/^(?:Y|O|유|있음|가능|설치)$/i.test(value)||size)return {noelev:false,elevatorKnown:true,elevSize:size};
  return {noelev:false,elevatorKnown:false,elevSize:''};
}
export function readYesNo(text){
  const value=String(text||'').replace(/\s+/g,'').trim();
  if(/^(?:Y|O|유|있음|필요)$/i.test(value))return {known:true,needed:true};
  if(/^(?:N|X|무|없음|불필요)$/i.test(value))return {known:true,needed:false};
  return {known:false,needed:false};
}
function productRows(words,w,h){
  const cells=(words||[]).filter(q=>q.text&&q.bbox&&((q.bbox.x0+q.bbox.x1)/2)/w>=.17&&((q.bbox.x0+q.bbox.x1)/2)/w<.57&&((q.bbox.y0+q.bbox.y1)/2)/h>=.35&&((q.bbox.y0+q.bbox.y1)/2)/h<.54);
  const rows=[];
  for(const word of cells.sort((a,b)=>a.bbox.y0-b.bbox.y0)){
    const y=(word.bbox.y0+word.bbox.y1)/2;
    let row=rows.find(r=>Math.abs(r.y-y)<h*.012);
    if(!row){row={y,words:[]};rows.push(row)}
    row.words.push(word);
  }
  return rows.map(r=>readProduct(r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(q=>q.text).join(' '))).filter(s=>/[가-힣]/.test(s)&&!/오더별|수량\s*합계|현장\s*특이사항/.test(s));
}
export function parseFormOCR(data,w,h,file){
  const words=data.words||[],text=data.text||'';
  const isReturn=/반품\s*(?:의뢰서|요청서|접수)|회수\s*(?:의뢰서|요청서)/.test(text);
  const field=(x0,y0,x1,y1)=>wordsIn(words,w,h,x0,y0,x1,y1);
  const row=field(.11,.17,.98,.25);
  const installDate=(field(.02,.085,.18,.12).match(/20\d{2}[-.\s]\d{1,2}[-.\s]\d{1,2}/)||text.match(/시공일\s*(20\d{2}[-.\s]\d{1,2}[-.\s]\d{1,2})/)||[])[0]?.replace(/[.\s]/g,'-')||'';
  let name=field(.11,.178,.205,.248).replace(/[^가-힣\s]/g,'').trim();
  let addr=field(.205,.178,.693,.248).replace(/^주소\s*/,'').trim();
  let safePhone=normalizePhone(field(.69,.178,.90,.248));
  let phone2=normalizePhone(field(.83,.178,.98,.248));
  if(isReturn){name='';addr='';safePhone='';phone2=''}
  if(!/^0\d{9,11}$/.test(safePhone.replace(/\D/g,''))){const m=row.match(/0\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}/);safePhone=m?normalizePhone(m[0]):''}
  const slotText=field(.50,.25,.67,.32)+' '+text.match(/(?:오전|오후)\s*\(?\d{1,2}[:시]/)?.[0];
  const slot=decodeSlot(slotText);
  // 제품명은 '제품명' 머리글 다음 줄의 첫 제품정보 행에 있다.
  const products=productRows(words,w,h);
  const product=products[0]||readProduct(field(.16,.36,.57,.405));
  const rawNotes=field(.02,.51,.96,.66).replace(/현장\s*특이사항/g,'').trim();
  const noteKeywords=/전날|연락|해피콜|진입시간|늦게|이르게|직접\s*수령|사다리차|기존\s*소파/;
  const koreanRatio=(rawNotes.match(/[가-힣]/g)||[]).length/Math.max(1,rawNotes.length);
  const notes=rawNotes.length<160&&(noteKeywords.test(rawNotes)||koreanRatio>.48)&&!/중\s*형\s*완\s*제\s*품|테\s*이\s*블.*서\s*랍/.test(rawNotes)?rawNotes:'';
  const elevText=field(.73,.27,.82,.32),rawElevSize=field(.81,.27,.92,.32).replace(/[^0-9인승\s]/g,'').trim();
  const elevator=readElevator(elevText,rawElevSize);
  const ladder=readYesNo(field(.91,.27,.99,.32));
  if(!/^0\d{9,11}$/.test(phone2.replace(/\D/g,'')))phone2='';
  const order=(text.match(/주문번호\s*([0-9]{8,12})/)||[])[1]||'';
  const weight=readWeight(text)||readWeightCell(field(.75,.466,.81,.505));
  if(!name){const m=text.match(/(?:고객명|고객\s*성명|성명|수령인|반품자)\s*[:：]?\s*([가-힣]{2,5})/);if(m)name=m[1]}
  if(!addr){const labeled=labeledValue(text,/^(?:회수지|반품지|수거지|방문지|설치주소|고객주소|주소)\s*[:：]?/);const m=(labeled||text).match(/(?:경기(?:도)?|서울(?:특별시)?|인천(?:광역시)?|강원(?:도|특별자치도)?|충청[남북]도|전라[남북]도|경상[남북]도|세종(?:특별자치시)?|대전(?:광역시)?|대구(?:광역시)?|부산(?:광역시)?|광주(?:광역시)?|울산(?:광역시)?|제주(?:특별자치도)?)\s*[^\n]{8,100}/);if(m)addr=m[0].trim()}
  if(isReturn&&!safePhone){safePhone=phoneMatches(labeledValue(text,/^(?:연락처|전화번호|휴대폰|고객\s*연락처)\s*[:：]?/))[0]||''}
  return {...baseCustomer({source:'form',verified:false,installDate,name,addr:normalizeOcrAddress(addr),safePhone,phone2,slot,prod:product,productRows:products,weight,...elevator,ladderKnown:ladder.known,ladderNeeded:ladder.needed,memo:[isReturn?'반품의뢰서':null,notes,order?'주문 '+order:''].filter(Boolean).join(' · '),call:/전날|해피콜|진입시간|설치\s*전날|배송\s*전\s*연락/.test(rawNotes),bs:isReturn||/기존\s*소파\s*BS|(?:BS|8S|85)\s*정\s*보|완\s*제\s*품/.test(text)}),file};
}
export async function readFormFields(worker,canvas,customer){
  const box=async(x0,y0,x1,y1)=>{
    const rectangle={left:Math.round(canvas.width*x0),top:Math.round(canvas.fullHeight*y0),width:Math.round(canvas.width*(x1-x0)),height:Math.round(canvas.fullHeight*(y1-y0))};
    const {data}=await worker.recognize(canvas,{rectangle});return (data.text||'').replace(/\s+/g,' ').trim();
  };
  const name=(await box(.113,.201,.203,.244)).replace(/[^가-힣]/g,'');
  const addr=await box(.207,.201,.69,.246);
  const phone=normalizePhone(await box(.695,.201,.88,.244));
  const phone2=normalizePhone(await box(.84,.201,.97,.244));
  const installDate=(await box(.02,.09,.18,.115)).match(/20\d{2}[-.\s]\d{1,2}[-.\s]\d{1,2}/)?.[0]?.replace(/[.\s]/g,'-')||'';
  const slot=await box(.515,.282,.65,.309);
  const elevator=await box(.735,.282,.80,.308);
  const capacity=await box(.81,.282,.9,.308);
  const ladder=readYesNo(await box(.925,.282,.975,.308));
  if(!customer.prod)customer.prod=readProduct(await box(.165,.36,.57,.405));
  if(name.length>=2)customer.name=name;
  if(addr.length>=8)customer.addr=normalizeOcrAddress(addr);
  if(/^0\d{9,11}$/.test(phone.replace(/\D/g,'')))customer.safePhone=phone;
  if(/^0\d{9,11}$/.test(phone2.replace(/\D/g,'')))customer.phone2=phone2;
  if(installDate)customer.installDate=installDate;
  if(slot)customer.slot=decodeSlot(slot);
  const elevatorInfo=readElevator(elevator,capacity);
  if(elevatorInfo.elevatorKnown)Object.assign(customer,elevatorInfo);
  if(ladder.known){customer.ladderKnown=true;customer.ladderNeeded=ladder.needed}
  if(!customer.weight){
    customer.weight=readWeight(await box(.53,.463,.83,.51));
    if(!customer.weight)customer.weight=readWeightCell(await box(.75,.466,.81,.505));
  }
  return customer;
}
export function parseTableOCR(data,w,h,file){
  const words=(data.words||[]).filter(q=>q.text&&q.bbox).sort((a,b)=>(a.bbox.y0+a.bbox.y1)-(b.bbox.y0+b.bbox.y1));
  const groups=[];for(const word of words){const y=(word.bbox.y0+word.bbox.y1)/2;let g=groups.find(r=>Math.abs(r.y-y)<Math.max(9,h*.012));if(!g){g={y,words:[]};groups.push(g)}g.words.push(word);g.y=(g.y*(g.words.length-1)+y)/g.words.length}
  const lines=groups.length?groups.map(g=>g.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(q=>q.text).join(' ')):String(data.text||'').split(/\n/);
  return lines.flatMap(line=>{
    const phones=phoneMatches(line);
    if(!phones.length)return [];
    const firstPhone=line.indexOf(phones[0].replace(/\D/g,'').slice(0,3));
    const before=firstPhone>=0?line.slice(0,firstPhone):line.split(/0\s*1\s*0|0\s*5\s*0\s*8/)[0];
    const names=[...before.matchAll(/[가-힣]{2,5}/g)].map(m=>m[0]).filter(s=>!/^(고객명|전화번호|연락처|휴대폰|핸드폰|이름|주소|배송지)$/.test(s));
    const name=names.at(-1)||'';
    const phone=phones.find(p=>p.startsWith('010'))||phones[0];
    return name?[{...baseCustomer({source:'list',verified:false,name,phone}),file}]:[];
  });
}
export async function imageCanvas(file){const bmp=await createImageBitmap(file);const scale=Math.min(6,1800/bmp.width),form=bmp.height>bmp.width*1.2;const c=document.createElement('canvas');c.width=Math.round(bmp.width*scale);c.fullHeight=Math.round(bmp.height*scale);c.height=c.fullHeight;c.isForm=form;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bmp,0,0,c.width,c.fullHeight);bmp.close();return c}
