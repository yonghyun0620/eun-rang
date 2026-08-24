importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');
importScripts('./firebase-config.js');

const CACHE = 'fridge-v3';
const ASSETS = ['./', './index.html', './app.js', './firebase-config.js', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

/* 네트워크 우선: 항상 최신 파일을 받고, 오프라인일 때만 캐시 사용 */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});

/* Firebase 백그라운드 푸시 수신 */
try {
  firebase.initializeApp(FIREBASE_CONFIG);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const n = payload.notification || {};
    return self.registration.showNotification(n.title || '🍳 우리집 냉장고', {
      body: n.body || '오늘의 추천 레시피가 도착했어요!',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'daily-15',
      vibrate: [200, 100, 200],
      data: { url: './index.html' }
    });
  });
} catch (e) {}

/* 일반 푸시 폴백 */
self.addEventListener('push', (e) => {
  if (!e.data) return;
  let payload = {};
  try { payload = e.data.json(); } catch { payload = { body: e.data.text() }; }
  if (payload.notification) return;
  e.waitUntil(
    self.registration.showNotification(payload.title || '🍳 우리집 냉장고', {
      body: payload.body || '오늘의 추천 레시피가 도착했어요!',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'daily-15',
      vibrate: [200, 100, 200],
      data: { url: './index.html' }
    })
  );
});

/* 알림 클릭 시 앱 열기 */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return clients.openWindow('./index.html');
    })
  );
});
