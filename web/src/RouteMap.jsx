import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {fetchTmapRoute,validTruck} from './tmapRoute.js';

const KEY='sofa-route-tmap-key-v1';
const PROFILE='sofa-route-truck-v1';
const DEFAULT_PROFILE={height:'340',weight:'3500',width:'',totalWeight:'',length:''};

function customerPopup(stop,index) {
  const popup=document.createElement('div');
  popup.className='map-customer';
  const title=document.createElement('strong');
  title.className='map-customer-title';
  title.textContent=`${index+1}. ${stop.name||'고객'}`;
  popup.append(title);
  const add=(label,value)=>{
    if(!value)return;
    const row=document.createElement('div');
    row.className='map-customer-row';
    const name=document.createElement('span');
    name.textContent=label;
    const detail=document.createElement('span');
    detail.textContent=String(value);
    row.append(name,detail);
    popup.append(row);
  };
  add('주소',stop.addr);
  add('제품',stop.prod);
  add('무게',stop.weight?`${stop.weight}kg`:'');
  add('방문 시간',stop.promiseTime||({am:'오전',pm:'오후',any:'지정불가'}[stop.slot]));
  add('엘리베이터',stop.noelev?'없음':stop.elevSize?`${stop.elevSize}인승`:'');
  add('소파 수거',stop.bs?'있음':'');
  add('배송 상태',stop.done?'완료':'');
  add('특이사항',stop.memo);
  const phones=[['전화',stop.phone],['안심번호',stop.safePhone],['2차 번호',stop.phone2]];
  for(const [label,number] of phones){
    if(!number)continue;
    const link=document.createElement('a');
    link.href=`tel:${String(number).replace(/\D/g,'')}`;
    link.textContent=`${label} ${number}`;
    popup.append(link);
  }
  return popup;
}

function drawMap(node,route,day) {
  const {points,lines}=route;
  const map=L.map(node,{scrollWheelZoom:true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; OpenStreetMap contributors',maxZoom:19,
  }).addTo(map);
  for(const line of lines) L.polyline(line.map(point=>[point.lat,point.lng]),{color:'#285b6b',weight:5}).addTo(map);
  const places=new Map();
  points.forEach(point=>{
    const location=`${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
    if(!places.has(location))places.set(location,[]);
    places.get(location).push(point);
  });
  for(const group of places.values()){
    const point=group[0];
    const label=group.map(item=>item.label).join('·');
    const marker=L.circleMarker([point.lat,point.lng],{radius:group.length>1?19:15,color:'#fff',weight:2,fillColor:'#285b6b',fillOpacity:1})
      .bindTooltip(label,{permanent:true,direction:'center',className:'route-map-label'})
      .addTo(map);
    const customers=group.filter(item=>item.index>=0&&item.index<day.list.length);
    if(customers.length){
      const content=document.createElement('div');
      content.className='map-customer-group';
      customers.forEach(item=>content.append(customerPopup(day.list[item.index],item.index)));
      marker.bindPopup(content,{maxWidth:320,minWidth:240});
    }
    marker.getElement()?.setAttribute('aria-label',`${label}번 배송 정보`);
  }
  const bounds=L.latLngBounds(points.map(point=>[point.lat,point.lng]));
  const fit=()=>{map.invalidateSize();map.fitBounds(bounds,{padding:[24,24],maxZoom:15})};
  fit();
  const observer=new ResizeObserver(fit);
  observer.observe(node);
  return ()=>{observer.disconnect();map.remove()};
}

export default function RouteMap({day}) {
  const node=useRef(null);
  const [key,setKey]=useState(()=>localStorage.getItem(KEY)||'');
  const [draft,setDraft]=useState(key);
  const [profile,setProfile]=useState(()=>{try{return {...DEFAULT_PROFILE,...JSON.parse(localStorage.getItem(PROFILE)||'{}')}}catch{return DEFAULT_PROFILE}});
  const [status,setStatus]=useState('');
  const [route,setRoute]=useState(null);
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    if(!key||!day.list.length||!version)return;
    let active=true;
    setRoute(null);setStatus('지도 경로 불러오는 중…');
    fetchTmapRoute(day,key,profile,fetch,{useCache:false}).then(result=>{
      if(!active)return;
      setRoute(result);setStatus('');
    }).catch(error=>{if(active)setStatus(error.message||'지도를 불러오지 못했습니다.')});
    return ()=>{active=false};
  },[version]);
  useEffect(()=>{
    if(!route||!node.current)return;
    try{return drawMap(node.current,route,day)}catch(error){console.error('지도 표시 실패',error);setStatus('지도 표시 중 오류가 났습니다. 새로고침을 눌러 주세요.');return undefined}
  },[route,day]);
  const saveKey=()=>{const value=draft.trim();if(!value)return;localStorage.setItem(KEY,value);if(value!==key){window.location.reload();return}setVersion(v=>v+1)};
  const changeProfile=(field,value)=>setProfile(previous=>{const next={...previous,[field]:value};localStorage.setItem(PROFILE,JSON.stringify(next));return next});
  return <section className="view map-view"><div className="wrap">
    <div className="panel map-panel"><div className="route-title"><h2>배송 지도</h2>{key&&day.list.length>0&&<button type="button" onClick={()=>setVersion(v=>v+1)}>{route?'지도 새로고침':'지도 경로 보기'}</button>}</div>
      {!key?<div className="map-setup"><p className="hint">T맵 앱키를 넣으면 방문 순서대로 도로 경로를 표시합니다.</p><label className="field"><span>T맵 앱키</span><input type="text" value={draft} onChange={e=>setDraft(e.target.value)} autoComplete="off"/></label><button className="primary big" onClick={saveKey} disabled={!draft.trim()}>지도 연결</button><a className="map-help" href="https://openapi.sk.com/" target="_blank" rel="noreferrer">T맵 앱키 만들기</a></div>:day.list.length===0?<p className="hint">배송지를 추가하면 지도에 경로가 표시됩니다.</p>:<>{route?<div id="tmap-route-map" ref={node} className="route-map" aria-label="방문 순서 지도" role="img"/>:<p className="hint">현재 순서의 지도를 보려면 ‘지도 경로 보기’를 누르세요.</p>}{status&&<p className="hint" role="status">{status}</p>}{route?.missing?.length>0&&<p className="hint" role="status">지도에 못 올린 곳: {route.missing.map(m=>m.name).join(', ')} · 카드에서 "T맵 검색용 주소"를 넣어 주세요.</p>}{route&&<p className="hint">출발 → {day.list.map((stop,i)=>`${i+1} ${stop.name||'고객'}`).join(' → ')} → 귀가</p>}{route&&<p className="hint">{route.truck?`높이 ${(Number(profile.height)/100).toFixed(2)}m 등 입력한 화물차 제원 반영`:'차량 높이·폭 등 제한 미반영 · T맵 운전 경로에서 확인'}</p>}</>}
    </div>
    {key&&<details className="panel"><summary>화물차 제원 · 앱키</summary><p className="hint">제원을 모두 입력하면 화물차 경로를 요청합니다. 차량 등록 정보를 확인해 적어 주세요.</p><div className="two">{[['height','높이 (cm)'],['width','폭 (cm)'],['length','길이 (cm)'],['weight','적재중량 (kg)'],['totalWeight','총중량 (kg)']].map(([field,label])=><label className="field" key={field}><span>{label}</span><input type="number" inputMode="numeric" value={profile[field]} onChange={e=>changeProfile(field,e.target.value)}/></label>)}</div>{validTruck(profile)&&<p className="hint">제원 저장됨 · 지도 새로고침을 누르면 반영됩니다.</p>}<label className="field"><span>T맵 앱키 변경</span><input type="text" value={draft} onChange={e=>setDraft(e.target.value)} autoComplete="off"/></label><button onClick={saveKey}>앱키 저장</button><button onClick={()=>{localStorage.removeItem(KEY);setKey('');setDraft('');setRoute(null)}}>앱키 지우기</button></details>}
  </div></section>;
}
