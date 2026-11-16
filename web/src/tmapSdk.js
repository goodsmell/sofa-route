let pending;

export function loadTmapSdk() {
  if (window.Tmapv2?.Map && window.Tmapv2?.Marker && window.Tmapv2?.Polyline)
    return Promise.resolve(window.Tmapv2);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (window.Tmapv2?.Map && window.Tmapv2?.Marker && window.Tmapv2?.Polyline) {
        resolve(window.Tmapv2);
      } else if (window.__tmapSdkLoadError || Date.now() - started > 15000) {
        pending = null;
        reject(new Error("T맵 지도를 불러오지 못했어요. 지도보기 상품이 활성화된 앱키와 인터넷 연결을 확인해 주세요."));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
  return pending;
}
