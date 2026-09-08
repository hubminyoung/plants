// Service Worker: MBG Plant Finder CORS proxy
// 사용자 브라우저 IP로 MBG 접근 (Cloudflare Worker IP 차단 우회)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

const MBG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://plantfinder.mobot.org/',
};

function mbgResponse(promise) {
  return promise
    .then(r => {
      const headers = new Headers();
      headers.set('Content-Type', 'text/html; charset=utf-8');
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(r.body, { status: r.status, headers });
    })
    .catch(err => new Response('error: ' + err.message, { status: 500 }));
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // /plants/proxy/mbg?taxonid=XXXXX — detail 조회
  if (url.pathname.endsWith('/proxy/mbg') && url.searchParams.get('taxonid')) {
    const taxonid = url.searchParams.get('taxonid');
    event.respondWith(mbgResponse(
      fetch(`https://plantfinder.mobot.org/PlantFinderDetails.aspx?taxonid=${taxonid}&isprofile=0`, { headers: MBG_HEADERS })
    ));
  }

  // /plants/proxy/mbg/search?q=XXX — 이름 검색 (taxonid 찾기)
  else if (url.pathname.endsWith('/proxy/mbg/search') && url.searchParams.get('q')) {
    const q = url.searchParams.get('q');
    event.respondWith(mbgResponse(
      fetch(`https://plantfinder.mobot.org/PlantFinderListResults.aspx?basic=${encodeURIComponent(q)}`, { headers: MBG_HEADERS })
    ));
  }
});
