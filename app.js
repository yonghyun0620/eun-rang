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
  wife:    { name: '옥화', label: '아내', avatar: '👩' },
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
      (p ? `⚠️ ${p.name} ${p.s.label} — 오늘 꼭 써요!\n` : '') +
      `👨‍🍳 추천: ${top ? top.emoji + ' ' + top.name : '오늘의 레시피'} 어떠세요?\n앱에서 상세 레시피 확인 →`;

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
  const newQty = prompt(`"${it.name}" 수량 변경 (현재 ${it.qty}${it.unit})\n0 입력 시 삭제됩니다`, it.qty);
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
  if (!it || !confirm(`"${it.name}"을(를) 삭제할까요?`)) return;
  state.items = state.items.filter(i => i.id !== id);
  await syncItems();
  await pushLog(`${it.icon} ${it.name} 삭제`);
  render();
}

/* ---------- 레시피 ---------- */
function generateRecipes(items) {
  const names = items.map(i => i.name);
  const has = (kw) => names.some(n => n.includes(kw));

  return [
    [
      has('두부') && has('돼지') && { emoji: '🍲', name: '돼지고기 두부찌개', time: '25분', level: '쉬움', rating: 4.7, match: 95, ingredients: ['돼지고기', '두부', '양파', '대파', '고추장', '김치'], desc: '고소한 두부와 얼큰한 돼지고기의 만남' },
      has('된장') && has('애호박') && { emoji: '🥘', name: '애호박 된장국', time: '20분', level: '쉬움', rating: 4.5, match: 92, ingredients: ['애호박', '된장', '대파', '양파', '두부'], desc: '시원하고 구수한 집밥 스테디셀러' },
      has('김치') && { emoji: '🍜', name: '김치찌개', time: '30분', level: '보통', rating: 4.8, match: 88, ingredients: ['김치', '돼지고기', '두부', '대파', '양파'], desc: '밥도둑의 정석, 오늘 저녁 이거다!' },
      has('감자') && { emoji: '🥔', name: '감자 된장국', time: '20분', level: '쉬움', rating: 4.4, match: 85, ingredients: ['감자', '된장', '대파', '양파'], desc: '포근한 감자와 구수한 된장의 조화' },
    ].filter(Boolean),
    [
      has('계란') && { emoji: '🍳', name: '계란말이', time: '10분', level: '쉬움', rating: 4.6, match: 100, ingredients: ['계란', '대파'], desc: '부드럽고 담백한 국민 반찬' },
      has('감자') && { emoji: '🥔', name: '감자조림', time: '25분', level: '쉬움', rating: 4.5, match: 90, ingredients: ['감자', '간장', '양파'], desc: '달짝지근하게 조린 밥반찬' },
      has('애호박') && { emoji: '🥒', name: '애호박전', time: '15분', level: '쉬움', rating: 4.7, match: 95, ingredients: ['애호박', '계란', '밀가루'], desc: '바삭하고 고소한 애호박전' },
      has('김치') && { emoji: '🌶️', name: '김치볶음', time: '10분', level: '쉬움', rating: 4.4, match: 92, ingredients: ['김치', '대파'], desc: '묵은지로 만드는 밥도둑' },
    ].filter(Boolean),
    [
      has('돼지') && has('고추장') && { emoji: '🍖', name: '제육볶음', time: '20분', level: '보통', rating: 4.9, match: 98, ingredients: ['돼지고기', '고추장', '양파', '대파'], desc: '매콤달콤 밥 한 공기 뚝딱!' },
      has('계란') && { emoji: '🍚', name: '계란볶음밥', time: '15분', level: '쉬움', rating: 4.5, match: 88, ingredients: ['계란', '대파', '김치', '밥'], desc: '간단하지만 맛있는 한그릇' },
      has('두부') && { emoji: '🥢', name: '두부조림', time: '20분', level: '쉬움', rating: 4.6, match: 90, ingredients: ['두부', '간장', '대파'], desc: '부드러운 두부에 양념 쏙쏙' },
      has('돼지') && has('김치') && { emoji: '🥩', name: '김치찜', time: '40분', level: '보통', rating: 4.7, match: 93, ingredients: ['돼지고기', '김치', '양파', '대파'], desc: '푹 익은 김치와 돼지고기의 환상조합' },
    ].filter(Boolean),
  ];
}

/* ---------- 화면 렌더 ---------- */
function switchUser(u) {
  state.currentUser = u;
  localStorage.setItem('fridge_user', u);
  document.getElementById('tab-husband').classList.toggle('active', u === 'husband');
  document.getElementById('tab-wife').classList.toggle('active', u === 'wife');
  if (isFirebaseReady && messaging) subscribeFCM();
  render();
}

function showPage(p) {
  state.currentPage = p;
  ['fridge', 'add', 'recipe', 'notify', 'settings'].forEach(x => {
    document.getElementById('btn-' + x)?.classList.toggle('active', x === p);
  });
  render();
}

function updateSyncBadge() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.innerHTML = state.syncMode === 'online'
    ? '<span class="w-2 h-2 bg-green-300 rounded-full status-dot"></span><span>실시간 공유 중</span>'
    : '<span class="w-2 h-2 bg-yellow-200 rounded-full status-dot"></span><span>데모 모드</span>';
}

function render() {
  const c = document.getElementById('app-content');
  c.className = 'p-4 fade-in';
  updateSyncBadge();

  if (state.currentPage === 'fridge') c.innerHTML = renderFridge();
  else if (state.currentPage === 'add') c.innerHTML = renderAdd();
  else if (state.currentPage === 'recipe') c.innerHTML = renderRecipe();
  else if (state.currentPage === 'notify') c.innerHTML = renderNotify();
  else if (state.currentPage === 'settings') c.innerHTML = renderSettings();
}

function renderFridge() {
  const total = state.items.length;
  const warning = state.items.filter(i => ['warning', 'danger'].includes(getStatus(i.expire).key)).length;
  const fresh = total - warning;
  const categories = ['전체', '채소', '육류', '단백질', '반찬', '양념', '기타'];
  const filtered = (state._catFilter === '전체' ? state.items : state.items.filter(i => i.category === state._catFilter))
    .slice().sort((a, b) => new Date(a.expire) - new Date(b.expire));

  return `
    <div class="grid grid-cols-3 gap-2 mb-4">
      <div class="bg-white rounded-2xl p-3 shadow-sm text-center"><div class="text-2xl font-black text-orange-500">${total}</div><div class="text-xs text-gray-500">총 재료</div></div>
      <div class="bg-white rounded-2xl p-3 shadow-sm text-center"><div class="text-2xl font-black text-red-500">${warning}</div><div class="text-xs text-gray-500">임박 재료</div></div>
      <div class="bg-white rounded-2xl p-3 shadow-sm text-center"><div class="text-2xl font-black text-green-500">${fresh}</div><div class="text-xs text-gray-500">신선 재료</div></div>
    </div>

    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400 p-3 rounded-xl mb-4">
      <div class="flex items-start gap-2">
        <i class="fas fa-bell text-blue-500 mt-1"></i>
        <div class="text-xs flex-1">
          <div class="font-bold text-blue-800">📱 매일 15:00 푸시 알림</div>
          <div class="text-gray-700 mt-1">임박 재료 ${warning}개 기반으로 오늘의 저녁 메뉴를 보내드릴게요!</div>
          <button onclick="sendTestPush()" class="mt-2 text-xs bg-blue-500 text-white px-3 py-1.5 rounded-full font-bold">테스트 알림 받기</button>
        </div>
      </div>
    </div>

    <div class="flex gap-2 overflow-x-auto pb-2 mb-3">
      ${categories.map(cat => `
        <button onclick="setCat('${cat}')" class="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium ${state._catFilter === cat ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 shadow-sm'}">${cat}</button>
      `).join('')}
    </div>

    <div class="space-y-2">
      ${filtered.length === 0 ? '<div class="text-center text-xs text-gray-400 py-8">재료가 없어요. 추가해주세요!</div>' : ''}
      ${filtered.map(item => {
        const s = getStatus(item.expire);
        const who = USER_KEY[item.addedBy] || (item.addedBy === '용현' ? 'husband' : 'wife');
        return `
        <div class="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3">
          <div class="text-3xl">${item.icon}</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold text-sm">${item.name}</span>
              <span class="badge-${s.key} text-[10px] px-2 py-0.5 rounded-full font-bold">${s.label}</span>
            </div>
            <div class="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
              <span class="font-medium text-gray-700">${item.qty}${item.unit}</span><span>·</span><span>${item.expire}까지</span>
            </div>
            <div class="text-[10px] text-gray-400 mt-0.5">${USERS[who]?.avatar || '👤'} ${item.addedBy}님 등록 · ${item.updatedAt || ''}</div>
          </div>
          <div class="flex flex-col gap-1">
            <button onclick="editItem('${item.id}')" class="text-blue-500 text-sm p-1"><i class="fas fa-edit"></i></button>
            <button onclick="deleteItem('${item.id}')" class="text-red-500 text-sm p-1"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderAdd() {
  return `
    <h2 class="text-lg font-black mb-1">🥕 재료 등록</h2>
    <p class="text-xs text-gray-500 mb-4">${USERS[state.currentUser].avatar} ${USERS[state.currentUser].name}님으로 등록됩니다</p>

    <div class="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div>
        <label class="text-xs text-gray-600 font-bold">재료명</label>
        <input id="in-name" type="text" placeholder="예: 두부, 배추, 소고기" class="w-full mt-1 border rounded-xl px-3 py-2.5 text-sm">
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-xs text-gray-600 font-bold">수량</label>
          <input id="in-qty" type="number" placeholder="1" class="w-full mt-1 border rounded-xl px-3 py-2.5 text-sm">
        </div>
        <div>
          <label class="text-xs text-gray-600 font-bold">단위</label>
          <select id="in-unit" class="w-full mt-1 border rounded-xl px-3 py-2.5 text-sm">
            <option>개</option><option>모</option><option>단</option><option>g</option>
            <option>kg</option><option>통</option><option>봉지</option><option>ml</option>
          </select>
        </div>
      </div>
      <div>
        <label class="text-xs text-gray-600 font-bold">카테고리</label>
        <select id="in-cat" class="w-full mt-1 border rounded-xl px-3 py-2.5 text-sm">
          <option>채소</option><option>육류</option><option>단백질</option>
          <option>반찬</option><option>양념</option><option>기타</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-gray-600 font-bold">상태</label>
        <div class="grid grid-cols-3 gap-2 mt-1">
          ${[['fresh','🟢 신선','green'],['warning','🟡 보통','yellow'],['danger','🔴 임박','red']].map(([v,t,c],i)=>`
          <label class="border rounded-xl p-2 text-center text-xs cursor-pointer hover:bg-${c}-50">
            <input type="radio" name="status" value="${v}" ${i===0?'checked':''} class="hidden peer">
            <span class="peer-checked:font-bold">${t}</span>
          </label>`).join('')}
        </div>
      </div>
      <div>
        <label class="text-xs text-gray-600 font-bold">유통기한</label>
        <input id="in-expire" type="date" value="${addDays(7)}" class="w-full mt-1 border rounded-xl px-3 py-2.5 text-sm">
      </div>
      <div>
        <label class="text-xs text-gray-600 font-bold">아이콘 (이모지)</label>
        <input id="in-icon" type="text" value="🥗" maxlength="2" class="w-full mt-1 border rounded-xl px-3 py-2.5 text-sm">
      </div>
      <button onclick="addItem()" class="w-full bg-gradient-to-r from-orange-500 to-rose-500 text-white py-3 rounded-xl font-black shadow-lg">
        <i class="fas fa-check"></i> 냉장고에 추가하기
      </button>
    </div>

    <div class="mt-4">
      <h3 class="text-sm font-black mb-2">📝 최근 공유 활동</h3>
      <div class="bg-white rounded-2xl shadow-sm divide-y max-h-56 overflow-y-auto">
        ${state.logs.length === 0 ? '<div class="p-3 text-xs text-gray-400 text-center">활동 기록이 없습니다</div>' :
          state.logs.slice(0, 10).map(l => `
            <div class="p-3 text-xs">
              <div class="flex justify-between"><span class="font-bold">${l.avatar} ${l.user}</span><span class="text-gray-400">${l.time}</span></div>
              <div class="text-gray-600 mt-0.5">${l.text}</div>
            </div>`).join('')}
      </div>
    </div>`;
}

function renderRecipe() {
  const priority = getPriorityItems();
  const recipes = generateRecipes(state.items);
  const tabRecipes = recipes[state._rTab] || [];
  const todayLabel = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

  return `
    <h2 class="text-lg font-black mb-1">🍲 오늘의 추천 레시피</h2>
    <p class="text-xs text-gray-500 mb-3">${todayLabel} 기준 · 냉장고 재료 분석</p>

    <div class="bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl p-3 mb-4 border border-red-100">
      <div class="text-xs font-bold text-red-600 mb-2"><i class="fas fa-exclamation-circle"></i> 유통기한 임박! 우선 활용 추천</div>
      <div class="flex flex-wrap gap-1">
        ${priority.length === 0 ? '<span class="text-xs text-gray-500">임박 재료가 없어요 👍</span>' : ''}
        ${priority.slice(0, 4).map(i => `
          <span class="bg-white px-2 py-1 rounded-full text-xs shadow-sm">${i.icon} ${i.name} <span class="text-red-500 font-bold">${i.s.label}</span></span>
        `).join('')}
      </div>
    </div>

    <div class="flex gap-2 mb-3">
      ${['찌개/국', '반찬', '메인요리'].map((c, idx) => `
        <button onclick="setRecipeTab(${idx})" class="flex-1 py-2 rounded-xl text-xs font-bold ${state._rTab === idx ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 shadow-sm'}">${c}</button>
      `).join('')}
    </div>

    <div class="space-y-3">
      ${tabRecipes.length === 0 ? '<div class="text-center text-xs text-gray-400 py-8">현재 재료로 추천할 레시피가 없어요.<br>재료를 더 추가해 보세요!</div>' : ''}
      ${tabRecipes.map(r => `
        <div class="recipe-card bg-white rounded-2xl overflow-hidden shadow-sm">
          <div class="p-4">
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1">
                <div class="text-2xl mb-1">${r.emoji}</div>
                <h3 class="font-black text-base">${r.name}</h3>
                <p class="text-xs text-gray-500 mt-0.5">${r.desc}</p>
                <div class="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span><i class="far fa-clock"></i> ${r.time}</span>
                  <span><i class="fas fa-fire"></i> ${r.level}</span>
                  <span><i class="fas fa-star text-yellow-400"></i> ${r.rating}</span>
                </div>
              </div>
              <div class="text-right">
                <div class="text-sm text-green-600 font-black">${r.match}%</div>
                <div class="text-[10px] text-gray-400">재료 매칭</div>
              </div>
            </div>
            <div class="mt-2">
              <div class="text-[10px] text-gray-500 mb-1">사용 재료</div>
              <div class="flex flex-wrap gap-1">
                ${r.ingredients.map(ing => {
                  const ok = state.items.some(i => i.name.includes(ing) || ing.includes(i.name));
                  return `<span class="text-[10px] px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${ok ? '✓' : '+'} ${ing}</span>`;
                }).join('')}
              </div>
            </div>
            <div class="mt-3 pt-3 border-t flex gap-2">
              <button onclick="viewRecipe('${r.name}')" class="flex-1 bg-orange-500 text-white text-xs py-2.5 rounded-xl font-bold"><i class="fas fa-book-open"></i> 상세 레시피</button>
              <a href="https://www.10000recipe.com/recipe/list.html?q=${encodeURIComponent(r.name)}" target="_blank" rel="noopener" class="flex-1 bg-white border border-orange-500 text-orange-500 text-xs py-2.5 rounded-xl font-bold text-center"><i class="fas fa-external-link-alt"></i> 만개의레시피</a>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderNotify() {
  const priority = getPriorityItems();
  const top = generateRecipes(state.items)[0][0];
  const p = priority[0];
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const permLabel = perm === 'granted' ? '<span class="text-green-500 font-bold">허용됨 ✅</span>'
    : perm === 'denied' ? '<span class="text-red-500 font-bold">차단됨 — 브라우저 설정에서 허용 필요</span>'
    : '<span class="text-gray-500 font-bold">아직 미설정</span>';

  return `
    <h2 class="text-lg font-black mb-1">🔔 푸시 알림</h2>
    <p class="text-xs text-gray-500 mb-3">매일 오후 3시, 두 분 휴대폰으로 추천 레시피가 울립니다</p>

    <div class="bg-white rounded-2xl p-4 shadow-sm mb-4 text-xs space-y-2">
      <div class="flex items-center justify-between"><span>🔔 알림 권한</span>${permLabel}</div>
      <div class="flex items-center justify-between"><span>⏰ 발송 시각</span><span class="font-bold text-orange-500">매일 15:00</span></div>
      <div class="flex items-center justify-between"><span>☁️ 발송 방식</span><span class="font-bold">${state.syncMode === 'online' ? 'Firebase 푸시 (서버 발송)' : '데모 — Firebase 설정 후 서버 발송'}</span></div>
      <div class="flex items-center justify-between"><span>👥 수신자</span><span class="font-bold">👨 용현 · 👩 옥화</span></div>
    </div>

    <div class="bg-gray-900 rounded-2xl p-4 mb-4">
      <div class="text-white text-xs font-bold mb-3 flex items-center gap-2"><i class="fas fa-mobile-alt"></i> 오늘 15시 발송될 알림 미리보기</div>
      <div class="bg-gray-800 rounded-2xl p-3">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white text-sm">🍳</div>
          <div><div class="text-white text-xs font-bold">우리집 냉장고</div><div class="text-gray-400 text-[10px]">오늘 오후 3:00</div></div>
        </div>
        <div class="mt-2 text-white text-sm font-bold">🍽️ 오늘 저녁 뭐 먹지?</div>
        <div class="mt-1 text-gray-300 text-xs leading-relaxed">
          ${p ? `⚠️ <b>${p.name}</b> ${p.s.label} — 오늘 꼭 써요!<br>` : ''}
          👨‍🍳 추천: <b>${top ? top.emoji + ' ' + top.name : '오늘의 레시피'}</b> 어떠세요?<br>
          <span class="text-gray-500">앱에서 상세 레시피 확인 →</span>
        </div>
      </div>
    </div>

    <button onclick="sendTestPush()" class="w-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white py-3 rounded-xl font-black text-sm shadow-lg mb-3">
      <i class="fas fa-paper-plane"></i> 지금 푸시 알림 테스트
    </button>

    <div class="p-3 bg-amber-50 rounded-xl text-[11px] text-gray-700 border border-amber-200 leading-relaxed">
      <b>💡 운영 모드에서는</b><br>
      • 앱을 꺼도 서버(Firebase)에서 매일 15시에 자동 발송<br>
      • 두 분 각자 휴대폰에 홈 화면 설치 후 알림 허용 1회만 하면 끝<br>
      • Firebase Cloud Messaging — <b>완전 무료, 문자 비용 0원</b>
    </div>`;
}

function renderSettings() {
  return `
    <h2 class="text-lg font-black mb-3">⚙️ 설정</h2>
    <div class="space-y-3">
      <div class="bg-white rounded-2xl p-4 shadow-sm">
        <div class="font-bold text-sm mb-2">👥 가족 구성원</div>
        <div class="text-xs space-y-2">
          <div class="flex items-center justify-between"><span>👨 용현 (남편)</span><span class="text-green-500 font-bold">관리자</span></div>
          <div class="flex items-center justify-between"><span>👩 옥화 (아내)</span><span class="text-green-500 font-bold">구성원</span></div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-4 shadow-sm">
        <div class="font-bold text-sm mb-2">📱 앱 정보</div>
        <div class="text-xs text-gray-600 space-y-1">
          <div>버전: 1.1.0 (토큰 진단)</div>
          <div>가족 코드: ${FAMILY_ID}</div>
          <div>동기화: ${state.syncMode === 'online' ? 'Firebase 실시간 ✅' : '데모 모드 (설정 필요)'}</div>
        </div>
      </div>
      <button onclick="exportData()" class="w-full bg-white shadow-sm text-gray-700 py-2.5 rounded-xl text-xs font-bold">
        <i class="fas fa-download"></i> 냉장고 데이터보내기 (JSON)
      </button>
    </div>`;
}

/* ---------- 유틸 ---------- */
function setCat(cat) { state._catFilter = cat; render(); }
function setRecipeTab(idx) { state._rTab = idx; render(); }

function showToast(msg) {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = 'fixed top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-4 py-2.5 rounded-full z-[60] shadow-lg fade-in whitespace-nowrap';
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function viewRecipe(name) {
  const detail = {
    '돼지고기 두부찌개': {
      steps: [
        '냄비에 참기름을 두르고 돼지고기 300g을 볶아주세요.',
        '고기 색이 변하면 양파, 대파를 넣고 함께 볶습니다.',
        '물 500ml, 고추장 2큰술, 다진마늘 1큰술을 넣고 끓입니다.',
        '끓기 시작하면 두부를 큼직하게 썰어 넣어주세요.',
        '5분 더 끓인 후 대파를 올려 마무리합니다.',
      ],
      tip: '💡 김치를 넣으면 김치찌개 스타일로도 즐길 수 있어요!',
    },
    '애호박 된장국': {
      steps: [
        '멸치육수 600ml를 준비하고 된장 2큰술을 풀어주세요.',
        '애호박을 반달 모양으로 썰어 넣습니다.',
        '양파와 두부를 추가하고 5분간 끓입니다.',
        '마지막에 대파를 넣고 한소끔 더 끓입니다.',
      ],
      tip: '💡 청양고추를 넣으면 얼큰한 맛이 됩니다.',
    },
    '제육볶음': {
      steps: [
        '돼지고기 300g에 고추장 2큰술, 고춧가루 1큰술, 간장 1큰술, 설탕 1큰술, 다진마늘을 넣고 10분 재워주세요.',
        '팬에 기름을 두르고 양파를 먼저 볶습니다.',
        '재운 고기를 넣고 센 불에서 빠르게 볶아주세요.',
        '대파를 넣고 1분 더 볶으면 완성!',
      ],
      tip: '💡 상추쌈과 함께 먹으면 더 맛있어요!',
    },
  };
  const d = detail[name] || { steps: ['만개의레시피에서 상세 레시피를 확인해주세요.'], tip: '' };

  const modal = document.getElementById('modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.querySelector('div').innerHTML = `
    <div class="flex justify-between items-start mb-3">
      <h3 class="font-black text-lg">${name}</h3>
      <button onclick="closeModal()" class="text-gray-400 text-2xl leading-none">&times;</button>
    </div>
    <div class="space-y-3">
      ${d.steps.map((s, i) => `
        <div class="flex gap-3 text-sm">
          <div class="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">${i + 1}</div>
          <div class="pt-0.5 text-gray-700">${s}</div>
        </div>`).join('')}
    </div>
    ${d.tip ? `<div class="mt-4 p-3 bg-yellow-50 rounded-xl text-xs text-gray-700">${d.tip}</div>` : ''}
    <a href="https://www.10000recipe.com/recipe/list.html?q=${encodeURIComponent(name)}" target="_blank" rel="noopener" class="mt-4 block bg-orange-500 text-white text-center py-2.5 rounded-xl text-sm font-bold">
      만개의레시피에서 자세히 보기 <i class="fas fa-external-link-alt"></i>
    </a>`;
}

function closeModal() {
  const m = document.getElementById('modal');
  m.classList.add('hidden');
  m.classList.remove('flex');
}

function exportData() {
  const data = { family: FAMILY_ID, exported: new Date().toISOString(), items: state.items, logs: state.logs };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `우리집냉장고_${TODAY}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- 초기화 ---------- */
async function init() {
  // 저장된 데이터 로드
  const saved = localStorage.getItem(LSK_ITEMS);
  const savedLogs = localStorage.getItem(LSK_LOGS);
  state.items = saved ? JSON.parse(saved) : [...DEFAULT_ITEMS];
  state.logs = savedLogs ? JSON.parse(savedLogs) : [];
  if (!saved) localStorage.setItem(LSK_ITEMS, JSON.stringify(state.items));

  await registerPWA();
  subscribeToChanges();

  // Firebase 운영 모드면 익명 로그인 + FCM 구독
  if (isFirebaseReady) {
    try {
      await firebase.auth().signInAnonymously();
      if (messaging) {
        const ok = await ensurePushPermission();
        if (ok) await subscribeFCM();
        messaging.onMessage((payload) => {
          const n = payload.notification || {};
          showToast(`📱 ${n.title || '알림'}: ${n.body || ''}`);
        });
      }
    } catch (e) { console.warn('인증/푸시 설정 실패:', e.message); }
  }

  // 사용자 탭 초기화
  document.getElementById('tab-husband').classList.toggle('active', state.currentUser === 'husband');
  document.getElementById('tab-wife').classList.toggle('active', state.currentUser === 'wife');

  render();

  // 자정 지나면 화면 갱신 (D-day 재계산)
  setInterval(() => {
    if (new Date().toDateString() !== state._lastDate) {
      state._lastDate = new Date().toDateString();
      render();
    }
  }, 60000);
}

document.addEventListener('DOMContentLoaded', init);


