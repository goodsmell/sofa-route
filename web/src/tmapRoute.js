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
  return {points,lines,truck:validTruck(profile)};
}
