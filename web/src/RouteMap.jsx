import React,{useEffect,useRef,useState} from 'react';
import {fetchTmapRoute,validTruck} from './tmapRoute.js';

const KEY='sofa-route-tmap-key-v1';
const PROFILE='sofa-route-truck-v1';
const DEFAULT_PROFILE={height:'340',weight:'3500',width:'',totalWeight:'',length:''};
let sdkPromise;

function loadSdk(key) {
  if (window.Tmapv2) return Promise.resolve(window.Tmapv2);
  if (!sdkPromise) sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=`https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${encodeURIComponent(key)}`;
    script.onload=()=>window.Tmapv2?resolve(window.Tmapv2):reject(new Error('T맵 지도를 열지 못했습니다.'));
    script.onerror=()=>reject(new Error('T맵 지도 연결에 실패했습니다.'));
    document.head.appendChild(script);
  }).catch(error=>{sdkPromise=null;throw error});
  return sdkPromise;
}

function drawMap(node,Tmap,route) {
  const {points,lines}=route;
  const center=points[0];
  const map=new Tmap.Map(node.id,{center:new Tmap.LatLng(center.lat,center.lng),width:'100%',height:'380px',zoom:10,zoomControl:true,scrollwheel:true});
  const overlays=[];
  for (const line of lines) overlays.push(new Tmap.Polyline({path:line.map(point=>new Tmap.LatLng(point.lat,point.lng)),strokeColor:'#285b6b',strokeWeight:5,map}));
  points.forEach((point,i)=>overlays.push(new Tmap.Marker({position:new Tmap.LatLng(point.lat,point.lng),map,title:point.label==='출발'||point.label==='귀가'?point.label:`${point.label}번 배송`,label:point.label||String(i)})));
  const lat=points.map(point=>point.lat),lng=points.map(point=>point.lng);
  try {
    const bounds=new Tmap.LatLngBounds(new Tmap.LatLng(Math.min(...lat),Math.min(...lng)),new Tmap.LatLng(Math.max(...lat),Math.max(...lng)));
    map.fitBounds(bounds);
  } catch { map.setCenter(new Tmap.LatLng(center.lat,center.lng)); }
  return ()=>{for(const overlay of overlays)overlay.setMap(null);map.destroy?.()};
}

export default function RouteMap({day}) {
  const node=useRef(null);
  const [key,setKey]=useState(()=>localStorage.getItem(KEY)||'');
  const [draft,setDraft]=useState(key);
  const [profile,setProfile]=useState(()=>{try{return {...DEFAULT_PROFILE,...JSON.parse(localStorage.getItem(PROFILE)||'{}')}}catch{return DEFAULT_PROFILE}});
  const [status,setStatus]=useState('');
  const [route,setRoute]=useState(null);
  const [sdk,setSdk]=useState(null);
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    if(!key||!day.list.length)return;
    let active=true;
    setRoute(null);setStatus('지도 경로 불러오는 중…');
    Promise.all([loadSdk(key),fetchTmapRoute(day,key,profile,fetch,{useCache:false})]).then(([loaded,result])=>{
      if(!active)return;
      setSdk(loaded);setRoute(result);setStatus('');
    }).catch(error=>{if(active)setStatus(error.message||'지도를 불러오지 못했습니다.')});
    return ()=>{active=false};
  },[key,version]);
  useEffect(()=>{
    if(!route||!sdk||!node.current)return;
    try{return drawMap(node.current,sdk,route)}catch{setStatus('지도 표시 중 오류가 났습니다.');return undefined}
  },[route,sdk]);
  const saveKey=()=>{const value=draft.trim();if(!value)return;localStorage.setItem(KEY,value);if(value!==key){window.location.reload();return}setVersion(v=>v+1)};
  const changeProfile=(field,value)=>setProfile(previous=>{const next={...previous,[field]:value};localStorage.setItem(PROFILE,JSON.stringify(next));return next});
  return <section className="view"><div className="wrap">
    <div className="panel"><div className="route-title"><h2>배송 지도</h2>{key&&day.list.length>0&&<button type="button" onClick={()=>setVersion(v=>v+1)}>새로고침</button>}</div>
      {!key?<div className="map-setup"><p className="hint">T맵 앱키를 넣으면 방문 순서대로 도로 경로를 표시합니다.</p><label className="field"><span>T맵 앱키</span><input type="text" value={draft} onChange={e=>setDraft(e.target.value)} autoComplete="off"/></label><button className="primary big" onClick={saveKey} disabled={!draft.trim()}>지도 연결</button><a className="map-help" href="https://openapi.sk.com/" target="_blank" rel="noreferrer">T맵 앱키 만들기</a></div>:day.list.length===0?<p className="hint">배송지를 추가하면 지도에 경로가 표시됩니다.</p>:<><div id="tmap-route-map" ref={node} className="route-map" aria-label="방문 순서 지도" role="img"/>{status&&<p className="hint" role="status">{status}</p>}{route?.missing?.length>0&&<p className="hint" role="status">지도에 못 올린 곳: {route.missing.map(m=>m.name).join(', ')} · 카드에서 "T맵 검색용 주소"를 넣어 주세요.</p>}{route&&<p className="hint">출발 → {day.list.map((stop,i)=>`${i+1} ${stop.name||'고객'}`).join(' → ')} → 귀가</p>}<p className="hint">{route?.truck?`높이 ${(Number(profile.height)/100).toFixed(2)}m 등 입력한 화물차 제원 반영`:'차량 높이·폭 등 제한 미반영 · T맵 운전 경로에서 확인'}</p></>}
    </div>
    {key&&<details className="panel"><summary>화물차 제원 · 앱키</summary><p className="hint">제원을 모두 입력하면 화물차 경로를 요청합니다. 차량 등록 정보를 확인해 적어 주세요.</p><div className="two">{[['height','높이 (cm)'],['width','폭 (cm)'],['length','길이 (cm)'],['weight','적재중량 (kg)'],['totalWeight','총중량 (kg)']].map(([field,label])=><label className="field" key={field}><span>{label}</span><input type="number" inputMode="numeric" value={profile[field]} onChange={e=>changeProfile(field,e.target.value)}/></label>)}</div>{validTruck(profile)&&<p className="hint">제원 저장됨 · 지도 새로고침을 누르면 반영됩니다.</p>}<label className="field"><span>T맵 앱키 변경</span><input type="text" value={draft} onChange={e=>setDraft(e.target.value)} autoComplete="off"/></label><button onClick={saveKey}>앱키 저장</button><button onClick={()=>{localStorage.removeItem(KEY);setKey('');setDraft('');setRoute(null)}}>앱키 지우기</button></details>}
  </div></section>;
}
