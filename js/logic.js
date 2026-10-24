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

/* ───────── 집안일 봉사 (위반 1건 = 봉사 카드 1장) ─────────
   카드마다 '하루 횟수(perDay)'가 있고, 시작일부터 기한까지 매일 그만큼 한다.
   총 횟수(count) = 하루 횟수 × 날수. 그날 몫을 채우면 그다음 집안일은 평소처럼 용돈이 쌓인다. */

// 자녀의 봉사 카드 목록. 예전 버전(합계 숫자만 저장)은 카드 하나로 보여 준다.
export function servicesOf(member) {
  if (Array.isArray(member.services)) return member.services;
  const n = member.serviceRemaining || 0;
  return n > 0 ? [{
    id: 'legacy', reason: '생활 약속 위반', count: n, remaining: n, perDay: 1, startDay: 0,
    dueAt: member.serviceDueAt ?? null, createdAt: 0,
  }] : [];
}

export const perDayOf = (s) => s.perDay || 1;
// 이 카드를 그날 해야 하는지 (시작일 ~ 기한, 남은 횟수 있음)
const activeOn = (s, day) => s.remaining > 0 && (s.startDay || 0) <= day && (!s.dueAt || day <= startOfDay(s.dueAt));
// 이 카드로 그날 이미 한 횟수
export const doneOn = (s, day) => (s.lastDay === day ? s.dayDone || 0 : 0);

// 그날 봉사로 채울 카드: 오늘 몫이 남은 카드 중 기한이 이른 것, 먼저 생긴 것부터. 없으면 null.
export function serviceTarget(member, day) {
  return [...servicesOf(member)]
    .filter((s) => activeOn(s, day) && doneOn(s, day) < perDayOf(s))
    .sort((a, b) => (a.dueAt || Infinity) - (b.dueAt || Infinity) || a.createdAt - b.createdAt)[0] || null;
}

// 항목 목록으로 자녀 계정에 저장할 값을 만든다. 합계(serviceRemaining)와 가장 이른 기한도 함께 맞춘다.
function servicePatch(items) {
  const active = items.filter((s) => s.remaining > 0);
  const dues = active.map((s) => s.dueAt).filter(Boolean);
  return {
    services: active,
    serviceRemaining: active.reduce((sum, s) => sum + s.remaining, 0),
    serviceDueAt: dues.length ? Math.min(...dues) : null,
  };
}

// 승인했을 때 자녀 계정이 어떻게 바뀌는지 계산한다. serviceUsed 외의 값은 자녀 계정에 그대로 저장한다.
// - 그날(집안일을 한 날) 봉사 몫이 남아 있으면 용돈 집안일은 무급(봉사)으로 처리한다 (특별 미션 제외).
//   그날 몫을 다 채운 뒤의 집안일은 평소처럼 용돈이 쌓인다.
// - 잔액은 마이너스가 될 수 없다.
export function approvalEffect(req, member) {
  if (req.status !== 'pending') throw new Error('이미 처리된 요청이에요.');
  const balance = member.balance || 0;
  const service = member.serviceRemaining || 0;
  const day = startOfDay(req.createdAt);
  const target = req.type === 'chore' && req.choreKind !== 'mission' && serviceTarget(member, day);
  if (target) {
    const next = servicesOf(member).map((s) => (s.id === target.id
      ? { ...s, remaining: s.remaining - 1, lastDay: day, dayDone: doneOn(s, day) + 1 }
      : s));
    return { balance, serviceUsed: true, ...servicePatch(next) };
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
  if (rule.type === 'service') return `${RULE_TYPES.service.icon} 집안일 봉사 하루 ${rule.count}회`;
  return `${RULE_TYPES.warning.icon} 경고`;
}

// 오늘부터 기한(그날 포함)까지 며칠인지. 기한이 없거나 오늘이면 1일.
export function serviceDays(dueAt, now = Date.now()) {
  if (!dueAt) return 1;
  return Math.max(1, Math.round((startOfDay(dueAt) - startOfDay(now)) / 86400000) + 1);
}

// 집안일 봉사 부여: 카드마다 '하루 perDay회 × 오늘부터 기한까지 날수'.
// pieces > 1이면 위반 건마다 카드를 따로 만든다 (예: 중대 사안 2건 → 카드 2장, 각각 매일 perDay회).
// perDay가 음수면 남은 봉사를 모두 없앤다 (해제). dueAt은 마지막 날 23:59.
export function serviceRecord(member, perDay, reason, dueAt = null, pieces = 1) {
  if (!Number.isInteger(perDay) || perDay === 0) throw new Error('봉사 횟수를 입력해 주세요.');
  const items = servicesOf(member);
  let next;
  let added = 0;
  if (perDay < 0) {
    next = [];
  } else {
    const now = Date.now();
    const count = perDay * serviceDays(dueAt, now);
    const cards = Array.from({ length: pieces }, (_, i) => ({
      id: `s-${now.toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      reason: pieces > 1 ? `${reason} · ${i + 1}건째` : reason,
      perDay,
      count,
      remaining: count,
      startDay: startOfDay(now),
      dueAt,
      createdAt: now + i,
    }));
    added = count * pieces;
    next = [...items, ...cards];
  }
  const patch = servicePatch(next);
  return {
    patch,
    record: {
      type: 'service', amount: 0, count: perDay < 0 ? -(member.serviceRemaining || 0) : added,
      reason: pieces > 1 ? `${reason} (${pieces}건)` : reason, serviceAfter: patch.serviceRemaining, dueAt,
    },
  };
}

// 봉사 카드 하나를 고치거나(사유·하루 횟수·기한) 종료한다.
// 하루 횟수나 기한을 바꾸면 '오늘부터 기한까지' 남은 횟수를 다시 계산한다 (오늘 이미 한 것은 빼고).
export function serviceItemChange(member, itemId, { reason, perDay, dueAt, close = false }, now = Date.now()) {
  const items = servicesOf(member);
  const item = items.find((s) => s.id === itemId);
  if (!item) throw new Error('이미 끝난 봉사예요.');
  let next;
  let delta;
  let note;
  if (close) {
    next = items.filter((s) => s.id !== itemId);
    delta = -item.remaining;
    note = `${item.reason} 종료`;
  } else {
    const per = Number(perDay);
    if (!Number.isInteger(per) || per < 1 || per > 20) throw new Error('하루 횟수는 1~20회로 정해 주세요.');
    const name = (reason || '').trim() || item.reason;
    const due = dueAt ?? item.dueAt;
    const today = startOfDay(now);
    // 오늘부터 기한까지 해야 할 횟수 - 오늘 이미 한 횟수
    const remaining = Math.max(0, per * serviceDays(due, now) - doneOn(item, today));
    next = items.map((s) => (s.id === itemId
      ? { ...s, reason: name, perDay: per, dueAt: due, remaining, count: (s.count - s.remaining) + remaining }
      : s));
    delta = remaining - item.remaining;
    note = remaining === 0 ? `${name} 종료` : `${name} 수정`;
  }
  const patch = servicePatch(next);
  return { patch, record: { type: 'service', amount: 0, count: delta, reason: note, serviceAfter: patch.serviceRemaining } };
}

// 기본 기한: 오늘부터 days일째 되는 날 23:59 (days=1이면 오늘)
export function defaultServiceDue(days, now = Date.now()) {
  const d = new Date(addDays(startOfDay(now), Math.max(1, days) - 1));
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// 오늘 봉사 현황. quota: 오늘 해야 할 횟수, done: 오늘 한 횟수, pending: 오늘 한 집안일 중 승인 대기.
// state: none(오늘은 할 봉사 없음) / done(오늘 몫 완료) / pending(승인만 되면 완료) / todo(아직 남음)
export function serviceToday(member, requests, now = Date.now()) {
  const today = startOfDay(now);
  let quota = 0;
  let done = 0;
  for (const s of servicesOf(member)) {
    const d = doneOn(s, today);
    done += d;
    if (activeOn(s, today) || d > 0) quota += Math.min(perDayOf(s), d + s.remaining);
  }
  const pending = requests.filter((r) => r.childId === member.id && r.type === 'chore' && r.choreKind !== 'mission'
    && r.status === 'pending' && startOfDay(r.createdAt) === today).length;
  let state = 'todo';
  if (quota === 0) state = 'none';
  else if (done >= quota) state = 'done';
  else if (done + pending >= quota) state = 'pending';
  return { state, quota, done, pending };
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
