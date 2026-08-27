// Service Worker: MBG Plant Finder CORS proxy
// 사용자 브라우저 IP로 MBG 접근 (Cloudflare Worker IP 차단 우회)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // /plants/proxy/mbg?taxonid=XXXXX 요청 처리
  if (url.pathname.endsWith('/proxy/mbg')) {
    const taxonid = url.searchParams.get('taxonid');
    if (!taxonid) return;

    event.respondWith(
      fetch(
        `https://plantfinder.mobot.org/PlantFinderDetails.aspx?taxonid=${taxonid}&isprofile=0`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://plantfinder.mobot.org/',
          },
        }
      )
      .then(r => {
        const headers = new Headers();
        headers.set('Content-Type', 'text/html; charset=utf-8');
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(r.body, { status: r.status, headers });
      })
      .catch(err => new Response('error: ' + err.message, { status: 500 }))
    );
  }
});
