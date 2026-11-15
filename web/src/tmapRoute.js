const API = 'https://apis.openapi.sk.com/tmap';

export function mapAddress(value) {
  const raw = String(value || '').trim();
  const wrapped = raw.match(/\(([^()]*(?:로|길|동|읍|면|리)\s*\d[^()]*)\)/)?.[1];
  return (wrapped || raw).split(',')[0].split('(')[0].trim();
}

export function parseGeocode(data) {
  const item = data?.coordinateInfo?.coordinate?.[0];
  const lat = Number(item?.newLatEntr || item?.latEntr || item?.newLat || item?.lat);
  const lng = Number(item?.newLonEntr || item?.lonEntr || item?.newLon || item?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 30 && lat < 40 && lng > 120 && lng < 135 ? {lat, lng} : null;
}

async function geocode(address, key, fetcher) {
  const query = new URLSearchParams({version:'1',format:'json',addressFlag:'F00',coordType:'WGS84GEO',fullAddr:mapAddress(address),page:'1',count:'1'});
  const response = await fetcher(`${API}/geo/fullAddrGeo?${query}`, {headers:{appKey:key,Accept:'application/json'}});
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'T맵 앱키를 확인해 주세요.' : '주소 위치를 찾지 못했습니다.');
  return parseGeocode(await response.json());
}

export function validTruck(profile) {
  const ranges = {width:[100,300],height:[100,600],weight:[500,600000],totalWeight:[500,600000],length:[200,4000]};
  return Object.entries(ranges).every(([field,[min,max]]) => Number(profile?.[field]) >= min && Number(profile?.[field]) <= max);
}

export function routeBody(day, points, profile) {
  const start = points[0], end = points.at(-1);
  const body = {
    reqCoordType:'WGS84GEO',resCoordType:'WGS84GEO',startName:'출발',startX:String(start.lng),startY:String(start.lat),
    startTime:`${day.date.replaceAll('-','')}${day.depart.replace(':','')}`,
    endName:'귀가',endX:String(end.lng),endY:String(end.lat),searchOption:'0',carType:'4',
    viaPoints:points.slice(1,-1).map((point,i)=>({viaPointId:`stop${i+1}`,viaPointName:`${i+1}번`,viaX:String(point.lng),viaY:String(point.lat)})),
  };
  if (validTruck(profile)) Object.assign(body,{
    truckType:'1',truckWidth:String(profile.width),truckHeight:String(profile.height),
    truckWeight:String(profile.weight),truckTotalWeight:String(profile.totalWeight),truckLength:String(profile.length),
  });
  return body;
}

export function routeLines(data) {
  return (data?.features || []).filter(feature=>feature?.geometry?.type==='LineString')
    .map(feature=>feature.geometry.coordinates.map(([lng,lat])=>({lat:Number(lat),lng:Number(lng)})))
    .filter(line=>line.length > 1 && line.every(point=>Number.isFinite(point.lat)&&Number.isFinite(point.lng)));
}

export async function fetchTmapRoute(day, key, profile, fetcher=fetch) {
  if (!day.list.length) throw new Error('배송지가 없습니다.');
  if (day.list.length > 30) throw new Error('지도 경로는 배송지 30곳까지 지원합니다.');
  const addresses = [day.start,...day.list.map(stop=>stop.addr),day.end];
  const points = [];
  for (let i=0;i<addresses.length;i++) {
    if (!mapAddress(addresses[i])) throw new Error(`${i===0?'출발지':i===addresses.length-1?'귀가 장소':`${i}번 고객`} 주소를 확인해 주세요.`);
    const point = await geocode(addresses[i],key,fetcher);
    if (!point) throw new Error(`${i===0?'출발지':i===addresses.length-1?'귀가 장소':`${i}번 고객`} 주소의 위치를 찾지 못했습니다.`);
    points.push(point);
  }
  const response = await fetcher(`${API}/routes/routeSequential30?version=1`,{
    method:'POST',headers:{appKey:key,Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify(routeBody(day,points,profile)),
  });
  if (!response.ok) throw new Error(response.status===401||response.status===403?'T맵 앱키 또는 API 권한을 확인해 주세요.':'T맵 경로를 가져오지 못했습니다.');
  const data = await response.json();
  const lines = routeLines(data);
  if (!lines.length) throw new Error('T맵이 도로 경로를 돌려주지 않았습니다.');
  return {points,lines,legs:routeLegs(data,points),truck:validTruck(profile)};
}

const near=(a,b)=>Math.hypot((a.lat-b.lat)*111,(a.lng-b.lng)*88)<0.7;

// 출발→1번, 1번→2번 … 마지막→귀가 구간별 거리(km)와 시간(분)
export function routeLegs(data,points) {
  const count=points.length-1;
  const lines=(data?.features||[]).filter(feature=>feature?.geometry?.type==='LineString');
  const leg=(distance,time)=>({km:Math.round(distance/100)/10,min:Math.max(1,Math.round(time/60))});
  if (lines.length===count) return lines.map(feature=>leg(+feature.properties?.distance||0,+feature.properties?.time||0));
  const legs=[];let distance=0,time=0;
  for (const feature of lines) {
    distance+=+feature.properties?.distance||0;time+=+feature.properties?.time||0;
    const [lng,lat]=feature.geometry.coordinates.at(-1)||[];
    if (legs.length<count-1&&near({lat:+lat,lng:+lng},points[legs.length+1])) {legs.push(leg(distance,time));distance=0;time=0}
  }
  legs.push(leg(distance,time));
  return legs.length===count?legs:null;
}

// 구간 결과를 고객별 이동 시간에 저장한다. travelFrom은 그때의 바로 앞 장소라서 순서가 바뀌면 다시 받아야 함을 알 수 있다.
export function applyLegs(day,legs) {
  if (!legs||legs.length!==day.list.length+1) return day;
  const list=day.list.map((stop,i)=>({...stop,travel:legs[i].min,travelKm:legs[i].km,travelFrom:i?day.list[i-1].id:'start'}));
  const last=legs.at(-1);
  return {...day,list,endTravel:last.min,endTravelKm:last.km,endFrom:day.list.at(-1)?.id||'start'};
}

export function legInfo(day,i) {
  const stop=i<day.list.length?day.list[i]:null,prev=i?day.list[i-1].id:'start';
  const km=stop?stop.travelKm:day.endTravelKm,from=stop?stop.travelFrom:day.endFrom,min=stop?(stop.travel??30):(day.endTravel??30);
  if (km==null) return {min,km:null,state:'default'};
  return {min,km,state:from===prev?'tmap':'stale'};
}

export const fmtDuration=min=>{min=Math.max(0,Math.round(min));const h=Math.floor(min/60),m=min%60;return h?(m?`${h}시간 ${m}분`:`${h}시간`):`${m}분`};

// 출발~귀가 전체 이동 거리·시간. 거리는 모든 구간을 T맵으로 받았을 때만 합산한다.
export function routeTotals(day) {
  const legs=Array.from({length:day.list.length+1},(_,i)=>legInfo(day,i));
  const km=legs.every(leg=>leg.km!=null)?Math.round(legs.reduce((sum,leg)=>sum+leg.km,0)*10)/10:null;
  return {km,min:legs.reduce((sum,leg)=>sum+(+leg.min||0),0),exact:legs.every(leg=>leg.state==='tmap')};
}

// 출발·귀가·고객 주소를 좌표로 바꾼다. 주소가 그대로면 고객에 저장해 둔 좌표를 다시 쓴다.
export async function geocodeDay(day, key, fetcher = fetch) {
  const one = async address => {
    if (!mapAddress(address)) return null;
    try {return await geocode(address, key, fetcher)} catch (error) {if (/앱키/.test(error.message)) throw error; return null}
  };
  const start = await one(day.start), end = await one(day.end);
  if (!start || !end) throw new Error('출발지나 귀가 장소 위치를 찾지 못했습니다.');
  const pos = {}, cache = {};
  for (const stop of day.list) {
    if (stop.geoAddr === stop.addr && Number.isFinite(stop.lat)) {pos[stop.id] = {lat: stop.lat, lng: stop.lng}; continue}
    const point = await one(stop.addr);
    if (point) {pos[stop.id] = point; cache[stop.id] = {lat: point.lat, lng: point.lng, geoAddr: stop.addr}}
  }
  return {start, end, pos, cache};
}
