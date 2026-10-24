// Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱(웹 앱)에서 복사한 값을 넣으세요.
// 값이 비어 있으면 앱은 체험 모드(이 기기 브라우저에만 저장)로 동작합니다.
export const firebaseConfig = {
  apiKey: 'AIzaSyD8lsS4h6e5tQFTN4tiXVlhr1yJrk3yKXU',
  authDomain: 'chore-allowance-d82c1.firebaseapp.com',
  projectId: 'chore-allowance-d82c1',
  storageBucket: 'chore-allowance-d82c1.firebasestorage.app',
  messagingSenderId: '517390858926',
  appId: '1:517390858926:web:12ddbc7df50096ab744b3f',
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
