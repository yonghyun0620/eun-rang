/* 우리집 냉장고 — Service Worker (오프라인 캐시 + 푸시 알림 수신) */
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

const CACHE = 'fridge-v1';
const ASSETS = ['./', './index.html', './app.js', './firebase-config.js', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});

/* ---- Firebase 백그라운드 푸시 수신 (앱이 꺼져 있어도 알림 도착) ---- */
try {
  firebase.initializeApp(self.FIREBASE_CONFIG || { apiKey: 'DEMO', projectId: 'DEMO', messagingSenderId: 'DEMO', appId: 'DEMO' });
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const n = payload.notification || {};
    self.registration.showNotification(n.title || '🍳 우리집 냉장고', {
      body: n.body || '오늘의 추천 레시피가 도착했어요!',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'daily-15',
      vibrate: [200, 100, 200],
      data: { url: './index.html' }
    });
  });
} catch (e) { /* 데모 모드: 무시 */ }

/* ---- 일반 푸시(비-Firebase 경로) 폴백 ---- */
self.addEventListener('push', (e) => {
  if (!e.data) return;
  let payload = {};
  try { payload = e.data.json(); } catch { payload = { body: e.data.text() }; }
  if (payload.notification) return; // Firebase 메시지는 위에서 처리
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
