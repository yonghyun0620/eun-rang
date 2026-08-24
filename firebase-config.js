/* ==========================================================================
   🔥 Firebase 설정 파일 — ✅ 실제 키 값이 입력된 완성본입니다.
   프로젝트: eun-rang-home
   남은 설정:
   1. Firebase 콘솔 → Authentication → 익명(Anonymous) 로그인 사용 설정
   2. Firestore Database → 데이터베이스 만들기 → 아래 보안 규칙 적용
   3. (푸시 알림용) Cloud Messaging → 웹 푸시 인증서 → 키 쌍 생성 후
      생성된 키를 아래 VAPID_KEY의 "DEMO" 자리에 붙여넣기
   ========================================================================== */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDnYKzp_en97af69HpzMj1NwAiyrClijjY",
  authDomain: "eun-rang-home.firebaseapp.com",
  projectId: "eun-rang-home",
  storageBucket: "eun-rang-home.firebasestorage.app",
  messagingSenderId: "583548854291",
  appId: "1:583548854291:web:1497fe4dd3999031a35fe6",
};

/* 우리 가족 코드 — 두 분 휴대폰 모두 같은 값이어야 데이터가 공유됩니다 */
const FAMILY_ID = "our-fridge-2026";

/* FCM 웹 푸시 인증 키
   (Firebase 콘솔 → 프로젝트 설정 → Cloud Messaging → 웹 푸시 인증서에서
    키 쌍 생성 후 여기에 붙여넣으세요. 생성 전까지는 "DEMO" 그대로 둬도 됩니다) */
const VAPID_KEY = "BEw8wS-n3WFiLAV0LpmBTZd1BdpX8EbT94aHdoGmyIsv4XUS9RhGWp1Px8pwud1TBnGCjYb0AnsMI63a23HB2fg";

/* ==========================================================================
   📋 Firestore 보안 규칙 (콘솔 → Firestore Database → 규칙 탭에 붙여넣기)
   ─────────────────────────────────────────────────────────────
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /families/our-fridge-2026/{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ========================================================================== */
