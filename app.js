/* ============================================================

  우리집 냉장고 — 용현 · 옥화 전용 레시피 알리미

  - Firebase 설정이 채워지면: 2인 실시간 공유 + FCM 푸시 (0원)

  - 설정이 비어 있으면: 로컬 데모 모드 (브라우저 탭 간 공유)

  ============================================================ */

/* ---------- Firebase 초기화 ---------- */

let db = null, messaging = null;

let isFirebaseReady = false;

try {

 const hasConfig = typeof FIREBASE_CONFIG !== 'undefined'

   && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'DEMO';

 if (hasConfig && typeof firebase !== 'undefined') {

   firebase.initializeApp(FIREBASE_CONFIG);

   db = firebase.firestore();

   if (firebase.messaging.isSupported()) messaging = firebase.messaging();

   isFirebaseReady = true;

   console.log('✅ Firebase 운영 모드');

 }

} catch (e) {

 console.warn('⚠️ Firebase 초기화 실패 — 데모 모드로 실행:', e.message);

}

/* ---------- 상태 ---------- */

const TODAY = new Date().toISOString().slice(0, 10);

const addDays = (d) => {

 const t = new Date(); t.setDate(t.getDate() + d);

 return t.toISOString().slice(0, 10);

};

const DEFAULT_ITEMS = [

 { id: 'd1', name: '두부', qty: 2, unit: '모', status: 'fresh', expire: addDays(4), category: '단백질', addedBy: '옥화', icon: '🧈', updatedAt: TODAY + ' 09:00' },

 { id: 'd2', name: '애호박', qty: 1, unit: '개', status: 'fresh', expire: addDays(6), category: '채소', addedBy: '용현', icon: '🥒', updatedAt: TODAY + ' 09:00' },

 { id: 'd3', name: '양파', qty: 3, unit: '개', status: 'fresh', expire: addDays(12), category: '채소', addedBy: '옥화', icon: '🧅', updatedAt: TODAY + ' 09:00' },

 { id: 'd4', name: '대파', qty: 1, unit: '단', status: 'warning', expire: addDays(2), category: '채소', addedBy: '용현', icon: '🌱', updatedAt: TODAY + ' 09:00' },

 { id: 'd5', name: '돼지고기(앞다리)', qty: 300, unit: 'g', status: 'fresh', expire: addDays(3), category: '육류', addedBy: '용현', icon: '🥩', updatedAt: TODAY + ' 09:00' },

 { id: 'd6', name: '고추장', qty: 1, unit: '통', status: 'fresh', expire: addDays(190), category: '양념', addedBy: '옥화', icon: '🌶️', updatedAt: TODAY + ' 09:00' },

 { id: 'd7', name: '된장', qty: 1, unit: '통', status: 'fresh', expire: addDays(150), category: '양념', addedBy: '옥화', icon: '🍯', updatedAt: TODAY + ' 09:00' },

 { id: 'd8', name: '계란', qty: 8, unit: '개', status: 'fresh', expire: addDays(9), category: '단백질', addedBy: '용현', icon: '🥚', updatedAt: TODAY + ' 09:00' },

 { id: 'd9', name: '김치', qty: 1, unit: '통', status: 'fresh', expire: addDays(38), category: '반찬', addedBy: '옥화', icon: '🥬', updatedAt: TODAY + ' 09:00' },

 { id: 'd10', name: '감자', qty: 4, unit: '개', status: 'warning', expire: addDays(1), category: '채소', addedBy: '용현', icon: '🥔', updatedAt: TODAY + ' 09:00' },

];

let state = {

 currentUser: localStorage.getItem('fridge_user') || 'husband',

 currentPage: 'fridge',

 items: [],

 logs: [],

 syncMode: isFirebaseReady ? 'online' : 'demo',

 _catFilter: '전체',

 _rTab: 0,

 _lastDate: new Date().toDateString(),

};

const USERS = {

 husband: { name: '용현', label: '남편', avatar: '👨' },

 wife:    { name: '옥화', label: '아내', avatar: '👩' },

};

const USER_KEY = { '용현': 'husband', '옥화': 'wife' };

const LSK_ITEMS = `fridge_${FAMILY_ID}_items`;

const LSK_LOGS = `fridge_${FAMILY_ID}_logs`;

/* ---------- PWA ---------- */

async function registerPWA() {

 if (!('serviceWorker' in navigator)) return;

 try {

   await navigator.serviceWorker.register('./sw.js');

 } catch (e) { console.warn('SW 등록 실패:', e.message); }

}

/* ---------- 푸시 알림 ---------- */

async function ensurePushPermission() {

 if (!('Notification' in window)) { alert('이 브라우저는 알림을 지원하지 않습니다.'); return false; }

 if (Notification.permission === 'granted') return true;

 if (Notification.permission === 'denied') {

   alert('알림이 차단되어 있어요. 브라우저 설정에서 알림을 허용해주세요.');

   return false;

 }

 return (await Notification.requestPermission()) === 'granted';

}

async function sendTestPush() {

 try {

   const ok = await ensurePushPermission();

   if (!ok) return;

   showToast('① 권한 OK');

   if (!isFirebaseReady) { showToast('❌ Firebase 미연결(데모 모드)'); return; }

   showToast('② Firebase 연결됨');

   if (!messaging) { showToast('❌ 이 브라우저는 FCM 미지원'); return; }

   showToast('③ 토큰 발급 시도 중…');

   const reg = await navigator.serviceWorker.ready;

   const token = await messaging.getToken({

     vapidKey: (typeof VAPID_KEY !== 'undefined' && VAPID_KEY !== 'DEMO') ? VAPID_KEY : undefined,

     serviceWorkerRegistration: reg,

   });

   if (!token) { showToast('❌ 토큰이 비어 있어요'); return; }

   await db.collection('families').doc(FAMILY_ID)

     .collection('tokens').doc(state.currentUser)

     .set({ token, user: USERS[state.currentUser].name, updatedAt: new Date().toISOString() });

   showToast('✅ 푸시 토큰 등록 완료!');

   const priority = getPriorityItems();

   const top = generateRecipes(state.items)[0][0];

   const p = priority[0];

   const title = '🍽️ 오늘 저녁 뭐 먹지?';

   const body =

     (p ? `⚠️ ${p.name} ${p.s.label} — 오늘 꼭 써요!'n` : '') +

     `👨‍🍳 추천: ${top ? top.emoji + ' ' + top.name : '오늘의 레시피'} 어떠세요?'n앱에서 상세 레시피 확인 →`;

   reg.showNotification(title, {

     body, icon: './icon-192.png', badge: './icon-192.png',

     tag: 'daily-15', vibrate: [200, 100, 200],

     data: { url: './index.html' },

   });

 } catch (e) {

   showToast('❌ 오류: ' + e.message);

 }

}

async function subscribeFCM() {

 if (!isFirebaseReady || !messaging) return null;

 try {

   const token = await messaging.getToken({

     vapidKey: VAPID_KEY !== 'DEMO' ? VAPID_KEY : undefined,

     serviceWorkerRegistration: await navigator.serviceWorker.ready,

   });

   if (token) {

     await db.collection('families').doc(FAMILY_ID)

       .collection('tokens').doc(state.currentUser)

       .set({ token, user: USERS[state.currentUser].name, updatedAt: new Date().toISOString() });

     console.log('✅ FCM 토큰 저장 완료');

   }

   return token;

 } catch (e) { console.warn('FCM 구독 실패:', e.message); return null; }

}

/* ---------- 실시간 동기화 ---------- */

let _unsub = null;

function subscribeToChanges() {

 if (isFirebaseReady) {

   _unsub = db.collection('families').doc(FAMILY_ID).collection('items')

     .orderBy('expire', 'asc')

     .onSnapshot((snap) => {

       const incoming = snap.docs.map(d => ({ id: d.id, ...d.data() }));

       const changedByOther = state.items.length && incoming.length

         && JSON.stringify(incoming.map(i=>i.id)) !== JSON.stringify(state.items.map(i=>i.id));

       state.items = incoming.length ? incoming : state.items;

       if (changedByOther) showToast('🔄 상대방이 냉장고를 업데이트했어요!');

       updateSyncBadge();

       render();

     }, (err) => {

       console.warn('실시간 수신 오류:', err.message);

       state.syncMode = 'demo';

       updateSyncBadge();

     });

   // 활동 로그 구독

   db.collection('families').doc(FAMILY_ID).collection('logs')

     .orderBy('ts', 'desc').limit(30)

     .onSnapshot((snap) => {

       state.logs = snap.docs.map(d => d.data());

       if (state.currentPage === 'add') render();

     });

 } else {

   // 데모 모드: 같은 브라우저의 다른 탭과 공유

   window.addEventListener('storage', (e) => {

     if (e.key === LSK_ITEMS && e.newValue) {

       state.items = JSON.parse(e.newValue);

       showToast('🔄 상대방이 냉장고를 업데이트했어요!');

       render();

     }

     if (e.key === LSK_LOGS && e.newValue) state.logs = JSON.parse(e.newValue);

   });

 }

}

async function syncItems() {

 if (isFirebaseReady) {

   try {

     const ref = db.collection('families').doc(FAMILY_ID).collection('items');

     const batch = db.batch();

     const snap = await ref.get();

     snap.docs.forEach(d => batch.delete(d.ref));

     state.items.forEach(item => batch.set(ref.doc(String(item.id)), item));

     await batch.commit();

     return;

   } catch (e) { console.warn('동기화 실패, 로컬 저장:', e.message); }

 }

 localStorage.setItem(LSK_ITEMS, JSON.stringify(state.items));

}

async function pushLog(text) {

 const entry = {

   time: new Date().toLocaleString('ko-KR', { hour12: false }),

   ts: Date.now(),

   user: USERS[state.currentUser].label,

   avatar: USERS[state.currentUser].avatar,

   text,

 };

 state.logs.unshift(entry);

 if (state.logs.length > 50) state.logs.pop();

 if (isFirebaseReady) {

   try {

     await db.collection('families').doc(FAMILY_ID).collection('logs').add(entry);

     return;

   } catch (e) { console.warn('로그 동기화 실패:', e.message); }

 }

 localStorage.setItem(LSK_LOGS, JSON.stringify(state.logs));

}

/* ---------- 도메인 로직 ---------- */

function getStatus(expire) {

 const today = new Date(); today.setHours(0, 0, 0, 0);

 const exp = new Date(expire); exp.setHours(0, 0, 0, 0);

 const diff = Math.round((exp - today) / 86400000);

 if (diff < 0) return { key: 'danger', label: '기한지남', days: diff };

 if (diff === 0) return { key: 'danger', label: '오늘까지', days: diff };

 if (diff <= 2) return { key: 'danger', label: `D-${diff}`, days: diff };

 if (diff <= 5) return { key: 'warning', label: `D-${diff}`, days: diff };

 return { key: 'fresh', label: `D-${diff}`, days: diff };

}

function getPriorityItems() {

 return state.items

   .map(i => ({ ...i, s: getStatus(i.expire) }))

   .filter(i => i.s.days <= 4)

   .sort((a, b) => a.s.days - b.s.days);

}

async function addItem() {

 const name = document.getElementById('in-name').value.trim();

 const qty = parseFloat(document.getElementById('in-qty').value);

 if (!name || !qty) return alert('재료명과 수량을 입력해주세요!');

 const item = {

   id: 'i' + Date.now(),

   name, qty,

   unit: document.getElementById('in-unit').value,

   category: document.getElementById('in-cat').value,

   status: document.querySelector('input[name=status]:checked').value,

   expire: document.getElementById('in-expire').value,

   icon: document.getElementById('in-icon').value || '🥗',

   addedBy: USERS[state.currentUser].name,

   updatedAt: new Date().toLocaleString('ko-KR', { hour12: false }),

 };

 state.items.push(item);

 state.items.sort((a, b) => new Date(a.expire) - new Date(b.expire));

 await syncItems();

 await pushLog(`${item.icon} ${item.name} ${item.qty}${item.unit} 추가`);

 showToast(`✅ ${USERS[state.currentUser].name}님이 ${name} 추가!`);

 showPage('fridge');

}

async function editItem(id) {

 const it = state.items.find(i => i.id === id);

 if (!it) return;

 const newQty = prompt(`"${it.name}" 수량 변경 (현재 ${it.qty}${it.unit})'n0 입력 시 삭제됩니다`, it.qty);

 if (newQty === null) return;

 const n = parseFloat(newQty);

 if (n === 0) return deleteItem(id);

 if (isNaN(n) || n < 0) return alert('올바른 수량을 입력해주세요');

 const old = it.qty;

 it.qty = n;

 it.updatedAt = new Date().toLocaleString('ko-KR', { hour12: false });

 await syncItems();

 await pushLog(`${it.icon} ${it.name} 수량: ${old}${it.unit} → ${n}${it.unit}`);

 render();

}

async function deleteItem(id) {

 const it = state.items.find(i => i.id === id);

