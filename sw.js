const CACHE = 'fridge-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

self.addEventListener('push', (e) => {
  let payload = {};
  try { payload = e.data.json(); } catch { payload = { body: e.data ? e.data.text() : '' }; }
  const n = payload.notification || payload;
  e.waitUntil(
    self.registration.showNotification(n.title || '🍳 우리집 냉장고', {
      body: n.body || '오늘의 추천 레시피가 도착했어요!',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'daily-15',
      vibrate: [200, 100, 200],
      data: { url: './index.html' }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./index.html'));
});
