import admin from "firebase-admin";

const FAMILY_ID = "our-fridge-2026";

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("FIREBASE_SERVICE_ACCOUNT secret is missing");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
const todayStr = kstNow.toISOString().slice(0, 10);

function daysLeft(expire) {
  const exp = new Date(expire + "T00:00:00Z");
  const today = new Date(todayStr + "T00:00:00Z");
  return Math.round((exp - today) / 86400000);
}

const itemsSnap = await db.collection("families").doc(FAMILY_ID).collection("items").get();
const items = itemsSnap.docs.map((d) => d.data());

const priority = items
  .map((i) => ({ ...i, d: daysLeft(i.expire) }))
  .filter((i) => i.d <= 3)
  .sort((a, b) => a.d - b.d);

const names = items.map((i) => i.name);
const has = (kw) => names.some((n) => n.includes(kw));
let recipe = "🍳 오늘의 추천 레시피";
if (has("돼지") && has("고추장")) recipe = "🍖 제육볶음";
else if (has("김치") && has("돼지")) recipe = "🍜 김치찌개";
else if (has("된장") && (has("애호박") || has("두부"))) recipe = "🥘 된장찌개";
else if (has("감자")) recipe = "🥔 감자조림";
else if (has("계란")) recipe = "🍳 계란말이";

const lines = [];
if (priority.length) {
  const p = priority[0];
  const dLabel = p.d <= 0 ? "오늘까지" : `D-${p.d}`;
  lines.push(`⚠️ ${p.icon || "🥗"} ${p.name} ${dLabel} — 오늘 꼭 써요!`);
}
lines.push(`👨‍🍳 추천: ${recipe} 어떠세요?`);
lines.push("앱에서 상세 레시피 확인 →");
const body = lines.join("\n");

const tokensSnap = await db.collection("families").doc(FAMILY_ID).collection("tokens").get();
const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);

if (!tokens.length) {
  console.log("등록된 푸시 토큰이 없습니다. 휴대폰에서 앱을 열고 알림을 허용해주세요.");
  process.exit(0);
}

const res = await admin.messaging().sendEachForMulticast({
  tokens,
  notification: { title: "🍽️ 오늘 저녁 뭐 먹지?", body },
});
console.log(`발송 완료: 성공 ${res.successCount}건 / 실패 ${res.failureCount}건`);
console.log("보낸 내용:\n" + body);

