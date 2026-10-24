// 앱 화면 파일은 네트워크 우선(업데이트 바로 반영), CDN 라이브러리는 캐시 우선으로 저장한다.
// 앱 파일을 고쳐서 올릴 때마다 아래 버전을 바꾸면, 설치된 앱이 새 버전을 받고 스스로 새로 고친다.
const CACHE = 'chore-v10';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/logic.js', './js/config.js',
  './js/store/demo.js', './js/store/firebase.js',
  './icons/icon.svg', './icons/icon-192.png',
];
const CDN_HOSTS = ['unpkg.com', 'www.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (url.origin === location.origin) {
    // 브라우저가 잠시 저장해 둔 파일(GitHub Pages는 최대 10분) 대신 서버에 새 버전이 있는지 확인한다.
    e.respondWith(
      fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }

  if (CDN_HOSTS.includes(url.hostname) && !url.pathname.includes('/__/')) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })),
    );
  }
});
