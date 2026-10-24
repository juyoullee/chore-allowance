// 화면과 저장소(체험/Firebase)가 함께 쓰는 규칙과 도우미 함수

// 집안일 종류: duty(기본 할 일, 무급·체크만) / paid(용돈 집안일) / mission(특별 미션, 한 번만)
export const KINDS = {
  duty: { label: '기본 할 일', desc: '원래 해야 하는 일. 돈 없이 체크만 해요.' },
  paid: { label: '용돈 집안일', desc: '할 때마다 부모님 승인 후 용돈이 쌓여요.' },
  mission: { label: '특별 미션', desc: '한 번만 하는 큰일. 마감일을 정할 수 있어요.' },
};
export const choreKind = (c) => c.kind || 'paid';

export const DEFAULT_CHORES = [
  { emoji: '🛏️', name: '이불 개기', price: 0, kind: 'duty' },
  { emoji: '🎒', name: '책상·책가방 정리', price: 0, kind: 'duty' },
  { emoji: '👟', name: '신발 정리', price: 300 },
  { emoji: '♻️', name: '분리수거', price: 500 },
  { emoji: '🗑️', name: '음식물 쓰레기 버리기', price: 500 },
  { emoji: '👕', name: '빨래 개기', price: 700 },
  { emoji: '🍽️', name: '설거지', price: 1000 },
  { emoji: '🛏️', name: '내 방 청소', price: 1000 },
  { emoji: '🧹', name: '청소기 돌리기', price: 1500 },
  { emoji: '🚽', name: '화장실 청소', price: 2000 },
];

export function newChore(c, order) {
  return {
    kind: c.kind || 'paid',
    emoji: c.emoji || '✅',
    name: c.name,
    price: c.price,
    desc: c.desc || '',
    dailyLimit: c.dailyLimit || 0,
    days: c.days || [],
    targets: c.targets || [],
    hidden: false,
    order,
    createdAt: Date.now(),
  };
}

// 기본 할 일은 체크하면 바로 완료, 나머지 요청은 부모 승인을 기다린다.
export const initialStatus = (type) => (type === 'duty' ? 'approved' : 'pending');

export function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.getRandomValues(new Uint32Array(6));
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

export const won = (n) => `${(n || 0).toLocaleString('ko-KR')}원`;

export function startOfDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeek(t = Date.now()) {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 월요일 시작
  return d.getTime();
}

export function startOfMonth(t = Date.now()) {
  const d = new Date(startOfDay(t));
  d.setDate(1);
  return d.getTime();
}

export function addMonths(monthStart, n) {
  const d = new Date(monthStart);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}

// 일요일부터 시작하는 달력 칸. 1일 앞의 빈칸은 null.
export function monthCells(monthStart) {
  const d = new Date(monthStart);
  const y = d.getFullYear();
  const m = d.getMonth();
  const cells = Array(d.getDay()).fill(null);
  const days = new Date(y, m + 1, 0).getDate();
  for (let i = 1; i <= days; i++) cells.push(new Date(y, m, i).getTime());
  return cells;
}

export function fmtTime(t) {
  const d = new Date(t);
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  return t >= startOfDay() ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

export function fmtDate(t) {
  return new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

export const sum = (list) => list.reduce((s, r) => s + (r.amount || 0), 0);

// 이 자녀가 받는 금액. 자녀별 금액(prices)이 있으면 그 값, 없으면 기본 금액.
export const priceFor = (chore, childId) => chore.prices?.[childId] ?? chore.price;

// 이 항목이 이 자녀 대상인지 (대상 자녀를 정하지 않았으면 모두)
export const targetsChild = (chore, childId) => !chore.targets?.length || chore.targets.includes(childId);

// 이 자녀에게 지금 보여 줄 항목인지 (숨김, 대상 자녀, 요일, 끝난 미션)
export function choreVisibleTo(chore, childId, now = Date.now()) {
  if (chore.hidden || !targetsChild(chore, childId)) return false;
  if (choreKind(chore) === 'mission') return !chore.done;
  return !chore.days?.length || chore.days.includes(new Date(now).getDay());
}

// 오늘 이 자녀가 이 항목으로 보낸 요청 수 (반려된 것은 제외)
export function todayCount(requests, childId, choreId) {
  const from = startOfDay();
  return requests.filter((r) => r.childId === childId && r.choreId === choreId
    && r.status !== 'rejected' && r.createdAt >= from).length;
}

// 미션에 걸린 대기 중 요청. 누군가 확인을 기다리는 동안 다른 자녀는 할 수 없다.
// (승인되면 미션 자체가 done이 되고, 부모가 다시 열면 새로 할 수 있다.)
export const missionRequest = (requests, choreId) =>
  requests.find((r) => r.choreId === choreId && r.status === 'pending');

export const isOverdue = (chore, now = Date.now()) => Boolean(chore.dueAt) && now > chore.dueAt;

export function dueLabel(dueAt) {
  if (!dueAt) return '마감 없음';
  const days = Math.round((startOfDay(dueAt) - startOfDay()) / 86400000);
  if (days < 0) return '마감 지남';
  return days === 0 ? '오늘 마감' : `D-${days}`;
}

// 'YYYY-MM-DD' ↔ 그날 23:59:59 (밀리초)
export const dateInputToDue = (s) => (s ? new Date(`${s}T23:59:59.999`).getTime() : null);
export function dueToDateInput(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 저축 목표 진행 상황. 최근 4주 용돈 집안일 평균으로 남은 기간을 어림한다.
export function goalProgress(member, requests) {
  const { goal } = member;
  if (!goal?.amount) return null;
  const balance = member.balance || 0;
  const remain = Math.max(0, goal.amount - balance);
  const from = Date.now() - 28 * 86400000;
  const weekly = requests.filter((r) => r.childId === member.id && r.createdAt >= from)
    .reduce((s, r) => s + earnedAmount(r), 0) / 4;
  return {
    pct: Math.min(100, Math.floor((balance / goal.amount) * 100)),
    remain,
    weeks: remain > 0 && weekly > 0 ? Math.ceil(remain / weekly) : null,
  };
}

export function pendingPayoutSum(requests, childId) {
  return sum(requests.filter((r) => r.type === 'payout' && r.childId === childId && r.status === 'pending'));
}

// 지급 요청이 가능한지 검사한다. 불가능하면 이유를, 가능하면 null을 돌려준다.
export function checkPayout(member, requests, amount) {
  if (member.serviceRemaining > 0) {
    return `집안일 봉사가 ${member.serviceRemaining}회 남아 있어서 지급 요청을 할 수 없어요.`;
  }
  const available = (member.balance || 0) - pendingPayoutSum(requests, member.id);
  if (available <= 0) return '요청할 수 있는 잔액이 없어요.';
  if (!Number.isInteger(amount) || amount <= 0) return '금액을 입력해 주세요.';
  if (amount > available) return `최대 ${won(available)}까지 요청할 수 있어요.`;
  return null;
}

// 승인했을 때 자녀 계정이 어떻게 바뀌는지 계산한다.
// - 집안일 봉사가 남아 있으면 용돈 집안일은 무급으로 처리하고 봉사 횟수를 1 줄인다 (특별 미션은 제외).
// - 잔액은 마이너스가 될 수 없다.
export function approvalEffect(req, member) {
  if (req.status !== 'pending') throw new Error('이미 처리된 요청이에요.');
  const balance = member.balance || 0;
  const service = member.serviceRemaining || 0;
  if (req.type === 'chore' && req.choreKind !== 'mission' && service > 0) {
    return { balance, serviceRemaining: service - 1, serviceUsed: true };
  }
  const after = balance + (req.type === 'payout' ? -req.amount : req.amount);
  if (after < 0) throw new Error('잔액이 부족해서 승인할 수 없어요.');
  return { balance: after, serviceRemaining: service, serviceUsed: false };
}

/* ───────── 2차: 연속 보너스 · 차감 · 집안일 봉사 ───────── */

export const DEFAULT_SETTINGS = { streakDays: 7, streakBonus: 1000, violencePerCase: 2 };
export const settingsOf = (family) => ({ ...DEFAULT_SETTINGS, ...(family?.settings || {}) });

const addDays = (day, n) => {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

// 연속 달성에 들어가는 기록: 승인된 용돈 집안일, 미션, 기본 할 일
export const isWork = (r) => (r.type === 'chore' || r.type === 'duty') && r.status === 'approved';

// 실제로 잔액을 늘린 금액 (봉사로 처리된 집안일은 0원)
export function earnedAmount(r) {
  if (r.status !== 'approved') return 0;
  if (r.type === 'bonus') return r.amount;
  if (r.type === 'chore' && !r.serviceUsed) return r.amount;
  return 0;
}

// 그날 이 자녀에게 정해진 기본 할 일 (요일·대상·숨김 반영, 그날 뒤에 만든 항목은 제외)
export function dutiesOn(chores, childId, day) {
  const end = addDays(day, 1);
  return chores.filter((c) => choreKind(c) === 'duty' && choreVisibleTo(c, childId, day)
    && (!c.createdAt || c.createdAt < end));
}

// 연속 달성: 그날의 기본 할 일을 '모두' 한 날이 이어지는 일수.
// - 기본 할 일이 없는 날(요일 지정 등)은 세지도 끊지도 않는다.
// - 오늘 아직 다 못 했으면 어제까지 이어진 기록을 센다 (오늘이 끝나기 전까지는 끊기지 않음).
export function streakInfo(requests, chores, childId, streakDays, now = Date.now()) {
  const doneByDay = new Map();
  for (const r of requests) {
    if (r.childId !== childId || r.type !== 'duty' || r.status !== 'approved') continue;
    const k = startOfDay(r.createdAt);
    if (!doneByDay.has(k)) doneByDay.set(k, new Set());
    doneByDay.get(k).add(r.choreId);
  }
  const stateOf = (day) => {
    const list = dutiesOn(chores, childId, day);
    if (!list.length) return 'none';
    return list.every((c) => doneByDay.get(day)?.has(c.id)) ? 'done' : 'missed';
  };

  const today = startOfDay(now);
  const todayState = stateOf(today);
  const doneDays = [];
  let day = todayState === 'done' ? today : addDays(today, -1);
  for (let i = 0; i < 400 && stateOf(day) !== 'missed'; i++) {
    if (stateOf(day) === 'done') doneDays.unshift(day);
    day = addDays(day, -1);
  }
  const count = doneDays.length;

  // 보너스 구간의 마지막 날을 구간 키로 쓴다. 이미 요청한 구간은 다시 받을 수 없다.
  const claimed = new Set(requests.filter((r) => r.type === 'bonus' && r.childId === childId).map((r) => r.streakKey));
  const unclaimed = [];
  for (let k = 1; k * streakDays <= count; k++) {
    const key = doneDays[k * streakDays - 1];
    if (!claimed.has(key)) unclaimed.push(key);
  }
  return { count, todayState, toNext: streakDays - (count % streakDays), unclaimed };
}

// 부모가 직접 남기는 기록. { patch: 자녀 계정 변경, record: 기록 문서 }를 돌려준다.
export function penaltyRecord(member, amount, reason) {
  const balance = member.balance || 0;
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('차감할 금액을 입력해 주세요.');
  if (amount > balance) throw new Error(`잔액(${won(balance)})보다 많이 차감할 수 없어요.`);
  return {
    patch: { balance: balance - amount },
    record: { type: 'penalty', amount, reason, balanceAfter: balance - amount },
  };
}

/* ───────── 생활 규칙표 ───────── */

// 규칙을 어겼을 때: money(용돈 차감) / service(집안일 봉사) / warning(경고만)
export const RULE_TYPES = {
  money: { label: '용돈 차감', icon: '🚫' },
  service: { label: '집안일 봉사', icon: '🤝' },
  warning: { label: '경고', icon: '⚠️' },
};

// 부모가 처음 고쳐 쓰기 전까지 보여 주는 기본 규칙 (저장은 부모가 편집할 때)
export const DEFAULT_RULES = [
  { id: 'r-phone', emoji: '📵', title: '밤 10시 이후 스마트폰 사용', desc: '10시가 되면 휴대폰은 거실 충전기에 둬요.', type: 'money', amount: 500 },
  { id: 'r-game', emoji: '🎮', title: '게임 시간 넘기기', desc: '평일 1시간, 주말 2시간까지예요.', type: 'money', amount: 500 },
  { id: 'r-home', emoji: '⏰', title: '귀가 시간 어기기', desc: '늦으면 미리 연락해요.', type: 'money', amount: 1000 },
  { id: 'r-lie', emoji: '🤥', title: '거짓말', desc: '실수는 괜찮아요. 솔직하게 말해요.', type: 'service', count: 1 },
  { id: 'r-fight', emoji: '🤜', title: '형제와 몸싸움', desc: '말로 해결하고, 어려우면 부모님께 말해요.', type: 'service', count: 2 },
  { id: 'r-late', emoji: '🐢', title: '맡은 일 미루기', desc: '기본 할 일은 그날 안에 해요.', type: 'warning' },
];

export const DEFAULT_RULES_NOTE = '약속을 지키면 용돈과 보너스가 쌓이고, 어기면 아래처럼 차감이나 집안일 봉사가 있어요. '
  + '잘못했을 때는 먼저 부모님과 이야기해요.';

export const rulesOf = (family) => family?.rules ?? DEFAULT_RULES;
export const rulesNoteOf = (family) => family?.rulesNote ?? DEFAULT_RULES_NOTE;

export function ruleEffect(rule) {
  if (rule.type === 'money') return `${RULE_TYPES.money.icon} ${won(rule.amount)} 차감`;
  if (rule.type === 'service') return `${RULE_TYPES.service.icon} 집안일 봉사 ${rule.count}회`;
  return `${RULE_TYPES.warning.icon} 경고`;
}

// count가 음수면 집안일 봉사를 줄인다 (해제).
export function serviceRecord(member, count, reason) {
  if (!Number.isInteger(count) || count === 0) throw new Error('봉사 횟수를 입력해 주세요.');
  const remaining = Math.max(0, (member.serviceRemaining || 0) + count);
  return {
    patch: { serviceRemaining: remaining },
    record: { type: 'service', amount: 0, count, reason, serviceAfter: remaining },
  };
}

export function errorMessage(e) {
  const code = e?.code || '';
  const map = {
    'permission-denied': '권한이 없어요. 다시 로그인해 보세요.',
    unavailable: '인터넷 연결을 확인해 주세요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/user-not-found': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
    'auth/weak-password': '비밀번호는 6자 이상으로 해 주세요.',
    'auth/invalid-email': '이메일 형식이 맞지 않아요.',
    'auth/popup-closed-by-user': '로그인 창이 닫혔어요.',
    'auth/popup-blocked': '팝업이 막혔어요. 이메일로 로그인해 보세요.',
    'auth/unauthorized-domain': '이 주소는 Firebase 승인 도메인에 등록되어 있지 않아요.',
  };
  return map[code] || e?.message || '문제가 생겼어요. 다시 시도해 주세요.';
}
