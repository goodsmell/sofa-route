import {baseCustomer,normalizePhone} from "./logic.js";
export function loadOCR(){return new Promise((resolve,reject)=>{if(window.Tesseract){resolve(window.Tesseract);return}const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=()=>resolve(window.Tesseract);s.onerror=()=>reject(new Error('글자 읽기 도구를 내려받지 못했습니다. 인터넷 연결을 확인해 주세요.'));document.head.appendChild(s)})}
function wordsIn(words,w,h,x0,y0,x1,y1){return words.filter(q=>{const b=q.bbox||{},x=((b.x0||0)+(b.x1||0))/2/w,y=((b.y0||0)+(b.y1||0))/2/h;return x>=x0&&x<=x1&&y>=y0&&y<=y1}).sort((a,b)=>(a.bbox.y0-b.bbox.y0)>12?(a.bbox.y0-b.bbox.y0):(a.bbox.x0-b.bbox.x0)).map(q=>q.text).join(' ').trim()}
function decodeSlot(value){const s=String(value||'').replace(/\s/g,'');if(/지정불가|시간무관|09[:시]?00[-~]17[:시]?00/.test(s))return'any';if(/오전|09[:시]?00[-~]13[:시]?00/.test(s))return'am';if(/오후|13[:시]?00[-~]17[:시]?00/.test(s))return'pm';return'any'}
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
export function parseFormOCR(data,w,h,file){
  const words=data.words||[],text=data.text||'';
  const field=(x0,y0,x1,y1)=>wordsIn(words,w,h,x0,y0,x1,y1);
  const row=field(.11,.17,.98,.25);
  let name=field(.11,.178,.205,.248).replace(/[^가-힣\s]/g,'').trim();
  let addr=field(.205,.178,.693,.248).replace(/^주소\s*/,'').trim();
  let safePhone=normalizePhone(field(.69,.178,.90,.248));
  if(!/^0\d{9,11}$/.test(safePhone.replace(/\D/g,''))){const m=row.match(/0\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}/);safePhone=m?normalizePhone(m[0]):''}
  const slotText=field(.50,.25,.67,.32)+' '+text.match(/(?:오전|오후)\s*\(?\d{1,2}[:시]/)?.[0];
  const slot=decodeSlot(slotText);
  // 제품명은 '제품명' 머리글 다음 줄의 첫 제품정보 행에 있다.
  const product=readProduct(field(.16,.36,.57,.405));
  const rawNotes=field(.02,.51,.96,.66).replace(/현장\s*특이사항/g,'').trim();
  const noteKeywords=/전날|연락|해피콜|진입시간|늦게|이르게|직접\s*수령|사다리차|기존\s*소파/;
  const koreanRatio=(rawNotes.match(/[가-힣]/g)||[]).length/Math.max(1,rawNotes.length);
  const notes=rawNotes.length<160&&(noteKeywords.test(rawNotes)||koreanRatio>.48)&&!/중\s*형\s*완\s*제\s*품|테\s*이\s*블.*서\s*랍/.test(rawNotes)?rawNotes:'';
  const elevText=field(.73,.27,.82,.32),rawElevSize=field(.81,.27,.92,.32).replace(/[^0-9인승\s]/g,'').trim();
  const elevator=readElevator(elevText,rawElevSize);
  const second=(rawNotes.match(/0(?:10|11|16|17|18|19)[-\s]?\d{3,4}[-\s]?\d{4}/)||[])[0]||'';
  const order=(text.match(/주문번호\s*([0-9]{8,12})/)||[])[1]||'';
  const weight=readWeight(text)||readWeightCell(field(.75,.466,.81,.505));
  if(!name){const m=text.match(/고객명\s*([가-힣]{2,5})/);if(m)name=m[1]}
  if(!addr){const m=text.match(/(?:경기(?:도)?|서울(?:특별시)?|인천(?:광역시)?|강원(?:도|특별자치도)?)\s*[가-힣\d\s,()\-]{12,100}/);if(m)addr=m[0].split(/\n/)[0].trim()}
  return {...baseCustomer({source:'form',verified:false,name,addr,safePhone,phone2:normalizePhone(second),slot,prod:product,weight,...elevator,memo:[notes,order?'주문 '+order:''].filter(Boolean).join(' · '),call:/전날|해피콜|진입시간|설치\s*전날|배송\s*전\s*연락/.test(rawNotes),bs:/기존\s*소파\s*BS|(?:BS|8S|85)\s*정\s*보|완\s*제\s*품/.test(text)}),file};
}
export async function readFormFields(worker,canvas,customer){
  const box=async(x0,y0,x1,y1)=>{
    const rectangle={left:Math.round(canvas.width*x0),top:Math.round(canvas.fullHeight*y0),width:Math.round(canvas.width*(x1-x0)),height:Math.round(canvas.fullHeight*(y1-y0))};
    const {data}=await worker.recognize(canvas,{rectangle});return (data.text||'').replace(/\s+/g,' ').trim();
  };
  const name=(await box(.113,.201,.203,.244)).replace(/[^가-힣]/g,'');
  const addr=await box(.207,.201,.69,.246);
  const phone=normalizePhone(await box(.695,.201,.88,.244));
  const slot=await box(.515,.282,.65,.309);
  const elevator=await box(.735,.282,.80,.308);
  const capacity=await box(.81,.282,.9,.308);
  if(!customer.prod)customer.prod=readProduct(await box(.165,.36,.57,.405));
  if(name.length>=2)customer.name=name;
  if(addr.length>=8)customer.addr=addr;
  if(/^0\d{9,11}$/.test(phone.replace(/\D/g,'')))customer.safePhone=phone;
  if(slot)customer.slot=decodeSlot(slot);
  const elevatorInfo=readElevator(elevator,capacity);
  if(elevatorInfo.elevatorKnown)Object.assign(customer,elevatorInfo);
  if(!customer.weight){
    customer.weight=readWeight(await box(.53,.463,.83,.51));
    if(!customer.weight)customer.weight=readWeightCell(await box(.75,.466,.81,.505));
  }
  return customer;
}
export function parseTableOCR(data,w,h,file){
  const words=(data.words||[]).filter(q=>q.text&&q.bbox).sort((a,b)=>(a.bbox.y0+a.bbox.y1)-(b.bbox.y0+b.bbox.y1));
  const groups=[];for(const word of words){const y=(word.bbox.y0+word.bbox.y1)/2;let g=groups.find(r=>Math.abs(r.y-y)<h*.022);if(!g){g={y,words:[]};groups.push(g)}g.words.push(word);g.y=(g.y*(g.words.length-1)+y)/g.words.length}
  return groups.map(g=>{const col=(a,b)=>g.words.filter(q=>{const x=(q.bbox.x0+q.bbox.x1)/2/w;return x>=a&&x<b}).sort((a,b)=>a.bbox.x0-b.bbox.x0).map(q=>q.text).join(' ').trim();const name=col(0,.31).replace(/[^가-힣\s]/g,'').trim(),phone=normalizePhone(col(.31,.62)),addr=col(.62,1);return {...baseCustomer({source:'list',verified:false,name,phone,addr}),file}}).filter(c=>c.name.length>=2&&/^(0\d{9,11})$/.test(c.phone.replace(/\D/g,'')));
}
export async function imageCanvas(file){const bmp=await createImageBitmap(file);const scale=Math.min(6,1800/bmp.width),form=bmp.height>bmp.width*1.2;const c=document.createElement('canvas');c.width=Math.round(bmp.width*scale);c.fullHeight=Math.round(bmp.height*scale);c.height=c.fullHeight;c.isForm=form;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bmp,0,0,c.width,c.fullHeight);bmp.close();return c}
