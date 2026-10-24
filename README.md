# 집안일 용돈 (PWA)

집안일을 하면 용돈이 쌓이고, 자녀가 지급을 요청하면 부모가 승인하는 가족용 웹앱입니다.
기획 내용은 [기획서.md](기획서.md)를 보세요.

## 1. 내 컴퓨터에서 바로 체험하기 (Firebase 없이)

`js/config.js`가 비어 있으면 **체험 모드**로 실행됩니다. 데이터는 그 브라우저에만 저장됩니다.

```bash
python -m http.server 5173
```

브라우저에서 `http://localhost:5173`을 엽니다. 탭을 두 개 열어 하나는 **부모로 체험하기**, 하나는 **자녀로 체험하기**로 들어가면 요청과 승인이 실시간으로 오가는 것을 볼 수 있습니다.

## 2. 가족이 각자 폰으로 쓰기 (Firebase 설정)

부모님 Google 계정으로 한 번만 하면 됩니다. 무료 요금제(Spark)로 충분합니다.

1. <https://console.firebase.google.com> → **프로젝트 추가** → 이름 입력(예: chore-allowance) → 만들기
2. **빌드 > Authentication** → 시작하기 → 로그인 방법에서 **Google**과 **이메일/비밀번호**를 사용 설정
3. **빌드 > Firestore Database** → 데이터베이스 만들기 → 위치 `asia-northeast3 (서울)` → **프로덕션 모드**
4. Firestore의 **규칙** 탭에 이 폴더의 [firestore.rules](firestore.rules) 내용을 통째로 붙여 넣고 **게시**
5. **프로젝트 설정(톱니바퀴) > 일반 > 내 앱 > 웹(</>)** → 앱 등록 → 나오는 `firebaseConfig` 값을 [js/config.js](js/config.js)에 붙여 넣기
6. 앱을 인터넷에 올리기 (아래 3번). 올린 주소의 도메인을 **Authentication > 설정 > 승인된 도메인**에 추가

### 처음 사용하는 순서
1. 부모: 로그인 → **새 가족 만들기** → 기본 집안일 8개가 자동으로 들어갑니다.
2. 부모: **가족** 탭에서 자녀용 초대 코드를 확인합니다.
3. 자녀: 자기 폰에서 로그인 → **초대 코드로 참여** → 코드 입력
4. 다른 부모: 부모용 초대 코드로 참여

## 3. 인터넷에 올리기 (택1)

빌드 과정이 없어서 폴더를 그대로 올리면 됩니다. (단, `.claude` 폴더와 `*.md` 파일은 올리지 않아도 됩니다.)

- **Netlify Drop**: <https://app.netlify.com/drop> 에 폴더를 끌어다 놓기. 가장 쉽습니다.
- **GitHub Pages**: 저장소에 올리고 Settings > Pages에서 켜기
- **Firebase Hosting**: Node.js 설치 후 `npm i -g firebase-tools` → `firebase login` → `firebase init hosting` → `firebase deploy`

## 4. 폰에 설치하기

- **안드로이드(Chrome)**: 주소를 열고 메뉴 ⋮ → **홈 화면에 추가**(또는 앱 설치)
- **아이폰(Safari)**: 공유 버튼 → **홈 화면에 추가**

> 아이폰 홈 화면 앱에서 Google 로그인 창이 잘 안 뜨면 이메일/비밀번호 로그인을 쓰세요.

## 파일 구성

| 파일 | 내용 |
|---|---|
| `index.html`, `css/app.css` | 화면 틀과 디자인 |
| `js/app.js` | 부모·자녀 화면 전체 |
| `js/logic.js` | 금액 계산, 지급 가능 여부, 기본 집안일 목록 등 규칙 |
| `js/store/firebase.js` | Firebase 저장소 |
| `js/store/demo.js` | 체험 모드 저장소 (localStorage) |
| `firestore.rules` | 보안 규칙 (부모만 승인·가격 변경 가능 등) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA(설치, 오프라인) |

## 1차 버전에 들어간 것 / 다음 단계

- [x] 로그인, 가족 만들기와 초대 코드 참여
- [x] 집안일 항목·가격 관리 (부모 폰: 추가, 수정, 가격 변경, 숨기기, 삭제, 순서, 대상 자녀, 하루 횟수)
- [x] 완료 요청 → 승인/반려(사유) → 잔액 적립
- [x] 지급 요청 → 지급 완료/반려, 잔액 마이너스 방지
- [x] 기록과 이번 달 합계
- [x] 월간 달력 (날짜별 집안일 횟수, 많이 한 집안일)
- [x] 집안일 3종류: 기본 할 일(무급·체크만) / 용돈 집안일 / 특별 미션(한 번, 마감일)
- [x] 저축 목표 (진행률, 예상 기간)

> 규칙 파일(`firestore.rules`)이 바뀌었습니다. Firebase를 이미 설정했다면 Firestore 규칙 탭에 다시 붙여 넣고 게시하세요.
- [x] 2차: 연속 달성 보너스, 차감(벌점), 봉사 의무 부여(학교폭력 규칙 포함), 규칙 설정
- [ ] 3차: 푸시 알림
