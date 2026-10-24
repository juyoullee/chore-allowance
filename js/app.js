import { html, render, useState, useEffect, useRef } from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';
import { isConfigured } from './config.js';
import {
  won, sum, fmtTime, fmtDate, startOfDay, startOfWeek, startOfMonth, addMonths, monthCells,
  todayCount, pendingPayoutSum, checkPayout, choreVisibleTo, errorMessage,
  KINDS, choreKind, missionRequest, isOverdue, dueLabel, dateInputToDue, dueToDateInput, goalProgress,
  settingsOf, streakInfo, earnedAmount, isWork, penaltyRecord, serviceRecord,
} from './logic.js';

const store = (await import(isConfigured ? './store/firebase.js' : './store/demo.js')).default;

/* ───────── 공통 도우미 ───────── */

let pushToast = () => {};
const toast = (msg) => pushToast(msg);

// 저장 작업을 실행하고, 실패하면 이유를 토스트로 보여 준다.
async function run(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    console.error(e);
    toast(errorMessage(e));
    return false;
  }
}

// 실시간 구독 값. deps가 바뀌면 새 값이 올 때까지 undefined(로딩)를 돌려준다.
function useWatch(subscribe, deps) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState({ key: null, value: undefined });
  useEffect(() => subscribe((value) => setState({ key, value })), [key]);
  return state.key === key ? state.value : undefined;
}

function Toast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef();
  pushToast = (m) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2800);
  };
  return msg && html`<div class="toast" role="status">${msg}</div>`;
}

const Loading = () => html`<div class="center"><div class="spinner"></div></div>`;

function Modal({ title, onClose, children }) {
  return html`
    <div class="backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-label=${title}>
        <div class="sheet-head">
          <h2>${title}</h2>
          <button class="icon-btn" onClick=${onClose} aria-label="닫기">✕</button>
        </div>
        ${children}
      </div>
    </div>`;
}

function Empty({ icon, text }) {
  return html`<div class="empty"><div class="empty-icon">${icon}</div><p>${text}</p></div>`;
}

const reqTitle = (r) => ({
  payout: '용돈 지급 요청',
  bonus: `${r.streakDays}일 연속 달성 보너스`,
  penalty: '차감',
  service: r.count > 0 ? `집안일 봉사 ${r.count}회 부여` : `집안일 봉사 ${-r.count}회 해제`,
}[r.type] || r.choreName);
const reqIcon = (r) => ({ payout: '💸', bonus: '🔥', penalty: '🚫', service: '🤝' }[r.type] || r.emoji);
const statusLabel = { pending: '대기', approved: '승인', rejected: '반려' };
const statusText = (r) => {
  if (r.type === 'duty') return '완료';
  if (r.type === 'penalty' || r.type === 'service') return '부모 기록';
  if (r.serviceUsed) return '봉사로 처리';
  return statusLabel[r.status];
};
// 기록에 이유를 보여 줄지 (반려 사유, 차감·봉사 사유)
const showReason = (r) => r.reason && (r.status === 'rejected' || r.type === 'penalty' || r.type === 'service');

function Amount({ r }) {
  if (r.type === 'duty') return html`<div class="amount duty">✔</div>`;
  if (r.type === 'service') return html`<div class="amount service">${r.count > 0 ? '+' : ''}${r.count}회</div>`;
  if (r.serviceUsed) return html`<div class="amount service">봉사</div>`;
  const minus = r.type === 'payout' || r.type === 'penalty';
  return html`<div class=${`amount ${minus ? 'minus' : 'plus'} ${r.status === 'rejected' ? 'struck' : ''}`}>
    ${minus ? '-' : '+'}${won(r.amount)}
  </div>`;
}

/* ───────── 로그인 · 가족 연결 ───────── */

function DemoLogin() {
  return html`
    <div class="auth">
      <div class="logo">🏠</div>
      <h1>집안일 용돈</h1>
      <p class="muted">지금은 <b>체험 모드</b>예요. 데이터는 이 기기 브라우저에만 저장돼요.</p>
      <p class="muted small">브라우저 탭을 두 개 열어 하나는 부모, 하나는 자녀로 들어가면 요청과 승인이 오가는 것을 볼 수 있어요.</p>
      <div class="stack">
        ${store.demoAccounts.map((a) => html`
          <button class="btn primary block" onClick=${() => store.signInDemo(a.uid)}>${a.label}</button>`)}
      </div>
      <p class="muted small">가족이 각자 폰으로 쓰려면 README의 Firebase 설정을 따라 주세요.</p>
    </div>`;
}

function FirebaseLogin() {
  const [signUp, setSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await run(() => (signUp ? store.signUpEmail(email.trim(), pw) : store.signInEmail(email.trim(), pw)));
    setBusy(false);
  };

  return html`
    <div class="auth">
      <div class="logo">🏠</div>
      <h1>집안일 용돈</h1>
      <p class="muted">집안일을 하고, 용돈을 모아요.</p>
      <button class="btn block google" onClick=${() => run(store.signInGoogle)}>Google 계정으로 계속하기</button>
      <div class="divider"><span>또는 이메일</span></div>
      <form class="stack" onSubmit=${submit}>
        <input type="email" placeholder="이메일" autocomplete="email" required
          value=${email} onInput=${(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="비밀번호 (6자 이상)" required minlength="6"
          autocomplete=${signUp ? 'new-password' : 'current-password'}
          value=${pw} onInput=${(e) => setPw(e.target.value)} />
        <button class="btn primary block" disabled=${busy}>${signUp ? '가입하기' : '로그인'}</button>
      </form>
      <button class="link" onClick=${() => setSignUp(!signUp)}>
        ${signUp ? '이미 계정이 있어요 → 로그인' : '처음이에요 → 이메일로 가입'}
      </button>
    </div>`;
}

function Onboarding({ user }) {
  const [tab, setTab] = useState('join');
  const [name, setName] = useState(user.name || '');
  const [familyName, setFamilyName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const myName = name.trim();
    await run(() => (tab === 'create'
      ? store.createFamily({ familyName: familyName.trim(), myName })
      : store.joinFamily({ code: code.trim().toUpperCase(), myName })));
    setBusy(false);
  };

  return html`
    <div class="auth">
      <div class="logo">👨‍👩‍👦</div>
      <h1>가족 연결하기</h1>
      <div class="seg">
        <button class=${tab === 'join' ? 'on' : ''} onClick=${() => setTab('join')}>초대 코드로 참여</button>
        <button class=${tab === 'create' ? 'on' : ''} onClick=${() => setTab('create')}>새 가족 만들기</button>
      </div>
      <p class="muted small">
        ${tab === 'create'
          ? '처음 시작하는 부모님이 가족을 만들어요. 만든 뒤 초대 코드를 자녀와 다른 부모님께 알려 주세요.'
          : '부모님께 받은 초대 코드를 입력하세요. 자녀용 코드인지 부모용 코드인지에 따라 역할이 정해져요.'}
      </p>
      <form class="stack" onSubmit=${submit}>
        <input placeholder="내 이름 (예: 엄마, 민수)" required maxlength="20"
          value=${name} onInput=${(e) => setName(e.target.value)} />
        ${tab === 'create'
          ? html`<input placeholder="가족 이름 (예: 우리집)" required maxlength="20"
              value=${familyName} onInput=${(e) => setFamilyName(e.target.value)} />`
          : html`<input class="code-input" placeholder="초대 코드 6자리" required maxlength="6"
              value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase())} />`}
        <button class="btn primary block" disabled=${busy}>${tab === 'create' ? '가족 만들기' : '참여하기'}</button>
      </form>
      <button class="link" onClick=${() => store.signOut()}>다른 계정으로 로그인</button>
    </div>`;
}

/* ───────── 화면 틀 ───────── */

function Shell({ family, me, tabs, tab, setTab, children }) {
  return html`
    <div class="shell">
      <header class="top">
        <div>
          <div class="fam">${family.name}</div>
          <div class="who">${me.name} · ${me.role === 'parent' ? '부모' : '자녀'}${store.mode === 'demo' ? ' · 체험' : ''}</div>
        </div>
        <button class="btn small ghost" onClick=${() => store.signOut()}>나가기</button>
      </header>
      <main>${children}</main>
      <nav class="tabs">
        ${tabs.map(([key, label, icon, badge]) => html`
          <button class=${tab === key ? 'on' : ''} onClick=${() => setTab(key)}>
            <span class="tab-icon">${icon}${badge > 0 && html`<span class="badge">${badge}</span>`}</span>
            <span>${label}</span>
          </button>`)}
      </nav>
    </div>`;
}

/* ───────── 부모: 승인함 ───────── */

// 자녀별 오늘 기본 할 일 진행 상황
function DutyStatus({ chores, members, requests }) {
  const rows = members.filter((m) => m.role === 'child').map((c) => {
    const duties = chores.filter((ch) => choreKind(ch) === 'duty' && choreVisibleTo(ch, c.id));
    const left = duties.filter((d) => todayCount(requests, c.id, d.id) === 0);
    return { c, duties, left };
  }).filter((r) => r.duties.length);
  if (!rows.length) return null;
  return html`
    <h2 class="section">오늘 기본 할 일</h2>
    <div class="card list">
      ${rows.map(({ c, duties, left }) => html`
        <div class="row-item" key=${c.id}>
          <span class="emoji small">${left.length ? '⏳' : '✅'}</span>
          <div class="grow">
            <div class="title">${c.name} ${duties.length - left.length}/${duties.length}</div>
            <div class="muted small">${left.length ? `남은 일: ${left.map((d) => d.name).join(', ')}` : '모두 했어요'}</div>
          </div>
        </div>`)}
    </div>`;
}

// 승인 카드 아래에 붙는 안내 (지급, 봉사 처리, 연속 보너스)
function ApproveHint({ r, member, requests, chores, family }) {
  if (r.type === 'payout') {
    return html`<p class="hint">현재 잔액 ${won(member?.balance)} · 용돈을 실제로 준 다음 승인하세요.</p>`;
  }
  if (r.type === 'chore' && r.choreKind !== 'mission' && member?.serviceRemaining > 0) {
    return html`<p class="hint service-hint">🤝 집안일 봉사가 ${member.serviceRemaining}회 남아 있어서 승인하면 <b>무급(봉사)</b>으로 처리돼요.</p>`;
  }
  if (r.type === 'bonus') {
    const s = streakInfo(requests, chores, r.childId, settingsOf(family).streakDays);
    return html`<p class="hint">🔥 오늘의 기본 할 일 ${s.count}일 연속 완료 · 달력 탭에서 기록을 확인할 수 있어요.</p>`;
  }
  return null;
}

function ApproveTab({ fid, requests, members, chores, family }) {
  const [rejecting, setRejecting] = useState(null);
  const pending = requests.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const memberOf = (id) => members.find((m) => m.id === id);
  const duty = html`<${DutyStatus} chores=${chores} members=${members} requests=${requests} />`;
  const asService = (r) => r.type === 'chore' && r.choreKind !== 'mission' && memberOf(r.childId)?.serviceRemaining > 0;
  const okMsg = (r) => {
    if (r.type === 'payout') return '지급 완료로 기록했어요.';
    if (asService(r)) return '봉사 1회로 처리했어요.';
    return `${won(r.amount)} 적립했어요.`;
  };

  if (!pending.length) return html`${duty}<${Empty} icon="📭" text="승인할 요청이 없어요." />`;

  return html`
    ${duty}
    <h2 class="section">승인 대기 ${pending.length}건</h2>
    ${pending.map((r) => html`
      <div class="card" key=${r.id}>
        <div class="row-item">
          <span class="emoji">${reqIcon(r)}</span>
          <div class="grow">
            <div class="title">${reqTitle(r)}</div>
            <div class="muted small">${r.childName} · ${fmtTime(r.createdAt)}</div>
          </div>
          <${Amount} r=${r} />
        </div>
        ${r.memo && html`<div class="memo">“${r.memo}”</div>`}
        <${ApproveHint} r=${r} member=${memberOf(r.childId)} requests=${requests} chores=${chores} family=${family} />
        <div class="actions">
          <button class="btn" onClick=${() => setRejecting(r)}>반려</button>
          <button class="btn primary" onClick=${() => run(() => store.decide(fid, r.id, true), okMsg(r))}>
            ${r.type === 'payout' ? '지급 완료' : asService(r) ? '승인 (봉사)' : '승인'}
          </button>
        </div>
      </div>`)}
    ${rejecting && html`<${RejectModal} fid=${fid} req=${rejecting} onClose=${() => setRejecting(null)} />`}`;
}

function RejectModal({ fid, req, onClose }) {
  const [reason, setReason] = useState('');
  const quick = req.type === 'payout'
    ? ['지금은 줄 수 없어요', '금액을 다시 정해 주세요']
    : ['아직 덜 했어요', '다시 깨끗이 해 주세요', '하지 않았어요'];
  const submit = async () => {
    if (await run(() => store.decide(fid, req.id, false, reason.trim()), '반려했어요.')) onClose();
  };
  return html`
    <${Modal} title="반려하기" onClose=${onClose}>
      <p class="muted">${req.childName} · ${reqTitle(req)} ${won(req.amount)}</p>
      <div class="chips">
        ${quick.map((q) => html`<button class="chip" onClick=${() => setReason(q)}>${q}</button>`)}
      </div>
      <textarea rows="3" placeholder="자녀에게 보여 줄 이유 (선택)" maxlength="100"
        value=${reason} onInput=${(e) => setReason(e.target.value)}></textarea>
      <button class="btn danger block" onClick=${submit}>반려</button>
    <//>`;
}

/* ───────── 부모: 집안일 항목 · 가격 관리 ───────── */

const daysLabel = (days) => (days.length === 7 ? '매일' : [...days].sort().map((d) => WEEKDAYS[d]).join('·'));

function ChoresTab({ fid, chores, members }) {
  const [editing, setEditing] = useState(null);
  const children = members.filter((m) => m.role === 'child');
  const nameOf = (id) => children.find((c) => c.id === id)?.name || '?';
  const groups = Object.keys(KINDS).map((kind) => ({ kind, items: chores.filter((c) => choreKind(c) === kind) }));

  // 같은 종류 안에서 순서를 바꾸고, 전체 순서를 다시 저장한다.
  const move = (gi, i, dir) => {
    const lists = groups.map((g) => g.items.map((c) => c.id));
    const ids = lists[gi];
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => store.reorderChores(fid, lists.flat()));
  };

  return html`
    <div class="section-head">
      <h2 class="section">집안일 관리</h2>
      <button class="btn primary small" onClick=${() => setEditing({})}>+ 추가</button>
    </div>
    <p class="hint">가격을 바꿔도 이미 승인된 기록과 대기 중인 요청은 원래 가격 그대로 처리돼요.</p>
    ${groups.map(({ kind, items }, gi) => html`
      <h3 class="day">${KINDS[kind].label} ${items.length}개</h3>
      ${!items.length && html`<p class="hint">${KINDS[kind].desc}</p>`}
      ${items.map((c, i) => html`
        <div class=${`card chore-row ${c.hidden || c.done ? 'dim' : ''}`} key=${c.id}>
          <button class="row-item grow plain" onClick=${() => setEditing(c)} aria-label=${`${c.name} 수정`}>
            <span class="emoji">${c.emoji}</span>
            <div class="grow">
              <div class="title">${c.name}</div>
              <div class="tags">
                ${c.hidden && html`<span class="tag">숨김</span>`}
                ${kind === 'mission' && html`
                  <span class=${`tag ${c.done ? 'ok' : isOverdue(c) ? 'warn' : ''}`}>${c.done ? '완료' : dueLabel(c.dueAt)}</span>`}
                ${kind !== 'mission' && c.days?.length > 0 && html`<span class="tag">${daysLabel(c.days)}</span>`}
                ${kind === 'paid' && c.dailyLimit > 0 && html`<span class="tag">하루 ${c.dailyLimit}회</span>`}
                ${c.targets?.length > 0 && html`<span class="tag">${c.targets.map(nameOf).join(', ')}</span>`}
              </div>
            </div>
            <div class="price">${kind === 'duty' ? html`<span class="muted small">무급</span>` : won(c.price)}</div>
          </button>
          <div class="order-btns">
            <button class="icon-btn" disabled=${i === 0} onClick=${() => move(gi, i, -1)} aria-label="위로">▲</button>
            <button class="icon-btn" disabled=${i === items.length - 1} onClick=${() => move(gi, i, 1)} aria-label="아래로">▼</button>
          </div>
        </div>`)}`)}
    ${editing && html`
      <${ChoreEditor} fid=${fid} chore=${editing} children=${children} count=${chores.length}
        onClose=${() => setEditing(null)} />`}`;
}

const EMOJIS = ['🍽️', '🧹', '🧺', '👕', '🗑️', '♻️', '🛏️', '🚽', '👟', '🪴', '🐶', '🛒', '🧽', '🚗', '📚', '✅'];

function ChoreEditor({ fid, chore, children, count, onClose }) {
  const isNew = !chore.id;
  const [f, setF] = useState({
    emoji: '✅', name: '', price: 500, desc: '', dailyLimit: 0, days: [], targets: [], hidden: false,
    ...chore,
    kind: choreKind(chore),
    due: dueToDateInput(isNew ? Date.now() + 7 * 86400000 : chore.dueAt),
  });
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const toggle = (k, v) => setF((prev) => ({
    ...prev, [k]: prev[k].includes(v) ? prev[k].filter((x) => x !== v) : [...prev[k], v],
  }));
  const { kind } = f;

  const save = async () => {
    const price = kind === 'duty' ? 0 : Number(f.price);
    const dailyLimit = kind === 'paid' ? Number(f.dailyLimit) || 0 : 0;
    if (!f.name.trim()) return toast('집안일 이름을 입력해 주세요.');
    if (kind !== 'duty' && (!Number.isInteger(price) || price < 10 || price > 1000000)) {
      return toast('금액은 10원~1,000,000원 사이의 정수로 입력해 주세요.');
    }
    if (!Number.isInteger(dailyLimit) || dailyLimit < 0) return toast('하루 횟수는 0 이상의 정수로 입력해 주세요.');
    const data = {
      kind,
      emoji: f.emoji.trim() || '✅',
      name: f.name.trim(),
      price,
      desc: f.desc.trim(),
      dailyLimit,
      days: kind === 'mission' ? [] : f.days,
      dueAt: kind === 'mission' ? dateInputToDue(f.due) : null,
      targets: f.targets,
      hidden: !!f.hidden,
    };
    if (isNew) Object.assign(data, { order: count, createdAt: Date.now() });
    else data.id = chore.id;
    if (await run(() => store.saveChore(fid, data), isNew ? '집안일을 추가했어요.' : '저장했어요.')) onClose();
  };

  const reopen = async () => {
    if (await run(() => store.saveChore(fid, { id: chore.id, done: false }), '미션을 다시 열었어요.')) onClose();
  };

  const remove = async () => {
    if (!confirm(`'${chore.name}'을(를) 삭제할까요? 지난 기록은 그대로 남아요.`)) return;
    if (await run(() => store.deleteChore(fid, chore.id), '삭제했어요.')) onClose();
  };

  return html`
    <${Modal} title=${isNew ? '집안일 추가' : '집안일 수정'} onClose=${onClose}>
      <div class="seg small">
        ${Object.entries(KINDS).map(([k, v]) => html`
          <button class=${kind === k ? 'on' : ''} onClick=${() => set('kind', k)}>${v.label}</button>`)}
      </div>
      <p class="hint">${KINDS[kind].desc}</p>
      <label class="field">아이콘
        <div class="emoji-pick">
          ${EMOJIS.map((e) => html`
            <button class=${f.emoji === e ? 'on' : ''} onClick=${() => set('emoji', e)}>${e}</button>`)}
        </div>
      </label>
      <label class="field">이름
        <input maxlength="20" placeholder="예: 설거지" value=${f.name} onInput=${(e) => set('name', e.target.value)} />
      </label>
      ${kind !== 'duty' && html`
        <label class="field">금액 (원)
          <input type="number" inputmode="numeric" min="10" step="100" value=${f.price}
            onInput=${(e) => set('price', e.target.value)} />
          <div class="chips">
            ${[100, 500, 1000].map((n) => html`
              <button class="chip" onClick=${() => set('price', (Number(f.price) || 0) + n)}>+${n.toLocaleString()}</button>`)}
          </div>
        </label>`}
      <label class="field">설명 (선택)
        <input maxlength="50" placeholder="예: 그릇을 닦고 건조대에 정리" value=${f.desc}
          onInput=${(e) => set('desc', e.target.value)} />
      </label>
      ${kind === 'mission' && html`
        <label class="field">마감일 (비우면 마감 없음)
          <input type="date" value=${f.due} onInput=${(e) => set('due', e.target.value)} />
        </label>`}
      ${kind === 'paid' && html`
        <label class="field">하루 최대 횟수 (0이면 제한 없음)
          <input type="number" inputmode="numeric" min="0" step="1" value=${f.dailyLimit}
            onInput=${(e) => set('dailyLimit', e.target.value)} />
        </label>`}
      ${kind !== 'mission' && html`
        <div class="field">하는 요일 (아무것도 선택하지 않으면 매일)
          <div class="chips">
            ${WEEKDAYS.map((w, i) => html`
              <button class=${`chip ${f.days.includes(i) ? 'on' : ''}`} onClick=${() => toggle('days', i)}>${w}</button>`)}
          </div>
        </div>`}
      ${children.length > 1 && html`
        <div class="field">${kind === 'mission' ? '맡길 자녀 (먼저 하는 사람이 가져가요)' : '보여 줄 자녀'} (아무도 선택하지 않으면 모두)
          <div class="chips">
            ${children.map((c) => html`
              <button class=${`chip ${f.targets.includes(c.id) ? 'on' : ''}`} onClick=${() => toggle('targets', c.id)}>${c.name}</button>`)}
          </div>
        </div>`}
      <label class="switch">
        <input type="checkbox" checked=${f.hidden} onChange=${(e) => set('hidden', e.target.checked)} />
        <span>자녀 화면에서 숨기기</span>
      </label>
      <button class="btn primary block" onClick=${save}>저장</button>
      ${!isNew && kind === 'mission' && chore.done && html`
        <button class="btn block reopen" onClick=${reopen}>미션 다시 열기</button>`}
      ${!isNew && html`<button class="btn danger-ghost block" onClick=${remove}>삭제</button>`}
    <//>`;
}

/* ───────── 부모: 가족 ───────── */

function FamilyTab({ fid, family, members, requests, chores }) {
  const children = members.filter((m) => m.role === 'child');
  const parents = members.filter((m) => m.role === 'parent');
  const settings = settingsOf(family);
  const [penaltyFor, setPenaltyFor] = useState(null);
  const [serviceFor, setServiceFor] = useState(null);
  const [editSettings, setEditSettings] = useState(false);

  const copy = (code) => run(() => navigator.clipboard.writeText(code), '코드를 복사했어요.');
  const regen = (role) => {
    if (!confirm('새 코드를 만들면 지금 코드는 더 이상 쓸 수 없어요. 계속할까요?')) return;
    run(() => store.regenerateCode(family, role), '새 코드를 만들었어요.');
  };

  return html`
    <h2 class="section">자녀</h2>
    ${!children.length && html`<p class="hint">아직 참여한 자녀가 없어요. 아래 자녀용 초대 코드를 자녀 폰에서 입력하게 해 주세요.</p>`}
    ${children.map((c) => {
      const pend = requests.filter((r) => r.childId === c.id && r.status === 'pending').length;
      const streak = streakInfo(requests, chores, c.id, settings.streakDays);
      return html`
        <div class="card" key=${c.id}>
          <div class="row-item">
            <span class="emoji">🧒</span>
            <div class="grow">
              <div class="title">${c.name}</div>
              <div class="muted small">대기 중인 요청 ${pend}건${streak.count > 0 ? ` · 🔥 ${streak.count}일 연속` : ''}</div>
              ${c.serviceRemaining > 0 && html`<div class="small service-text">🤝 집안일 봉사 ${c.serviceRemaining}회 남음</div>`}
              ${c.goal?.amount > 0 && html`
                <div class="muted small">목표 ${c.goal.emoji || '🎯'} ${c.goal.name} · ${goalProgress(c, requests).pct}%</div>`}
            </div>
            <div class="price">${won(c.balance)}</div>
          </div>
          <div class="actions even">
            <button class="btn small" onClick=${() => setPenaltyFor(c)}>🚫 차감</button>
            <button class="btn small" onClick=${() => setServiceFor(c)}>🤝 집안일 봉사</button>
          </div>
        </div>`;
    })}

    <div class="section-head">
      <h2 class="section">규칙 설정</h2>
      <button class="btn small ghost" onClick=${() => setEditSettings(true)}>수정</button>
    </div>
    <div class="card list">
      <div class="row-item"><span class="emoji small">🔥</span>
        <div class="grow">기본 할 일 연속 완료 보너스</div><b>${settings.streakDays}일 연속이면 ${won(settings.streakBonus)}</b></div>
      <div class="row-item"><span class="emoji small">🤝</span>
        <div class="grow">중대 사안 (조치 확정 1건당)</div><b>집안일 봉사 ${settings.violencePerCase}회</b></div>
    </div>

    ${penaltyFor && html`
      <${PenaltyModal} fid=${fid} child=${members.find((m) => m.id === penaltyFor.id)} onClose=${() => setPenaltyFor(null)} />`}
    ${serviceFor && html`
      <${ServiceModal} fid=${fid} child=${members.find((m) => m.id === serviceFor.id)} settings=${settings}
        onClose=${() => setServiceFor(null)} />`}
    ${editSettings && html`<${SettingsModal} fid=${fid} settings=${settings} onClose=${() => setEditSettings(false)} />`}

    <h2 class="section">초대 코드</h2>
    ${[['child', '자녀용', family.childCode], ['parent', '부모용', family.parentCode]].map(([role, label, code]) => html`
      <div class="card invite" key=${role}>
        <div class="grow">
          <div class="muted small">${label}</div>
          <div class="code">${code}</div>
        </div>
        <button class="btn small" onClick=${() => copy(code)}>복사</button>
        <button class="btn small ghost" onClick=${() => regen(role)}>새로 만들기</button>
      </div>`)}

    <h2 class="section">부모</h2>
    <div class="card">${parents.map((p) => p.name).join(', ')}</div>

    ${store.mode === 'demo' && html`
      <button class="btn danger-ghost block" onClick=${() => confirm('체험 데이터를 모두 지울까요?') && store.resetDemo()}>
        체험 데이터 초기화
      </button>`}`;
}

function PenaltyModal({ fid, child, onClose }) {
  const balance = child.balance || 0;
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const submit = async () => {
    if (!reason.trim()) return toast('차감 이유를 적어 주세요.');
    const value = Number(amount);
    const ok = await run(() => store.addRecord(fid, child.id, (m) => penaltyRecord(m, value, reason.trim())),
      `${won(value)} 차감했어요.`);
    if (ok) onClose();
  };
  return html`
    <${Modal} title=${`${child.name} 차감`} onClose=${onClose}>
      <p class="muted">현재 잔액 <b>${won(balance)}</b> · 잔액보다 많이 뺄 수는 없어요.</p>
      <div class="chips">
        ${['맡은 일을 하지 않음', '대충 함', '약속을 어김'].map((q) => html`
          <button class=${`chip ${reason === q ? 'on' : ''}`} onClick=${() => setReason(q)}>${q}</button>`)}
      </div>
      <textarea rows="2" maxlength="100" placeholder="자녀에게 보여 줄 이유" value=${reason}
        onInput=${(e) => setReason(e.target.value)}></textarea>
      <label class="field">차감할 금액 (원)
        <input type="number" inputmode="numeric" min="1" step="100" value=${amount} onInput=${(e) => setAmount(e.target.value)} />
        <div class="chips">
          ${[500, 1000].filter((n) => n <= balance).map((n) => html`
            <button class="chip" onClick=${() => setAmount(String(n))}>${won(n)}</button>`)}
          ${balance > 0 && html`<button class="chip" onClick=${() => setAmount(String(balance))}>전액</button>`}
        </div>
      </label>
      <button class="btn danger block" disabled=${balance <= 0} onClick=${submit}>
        ${balance <= 0 ? '차감할 잔액이 없어요' : '차감하기'}
      </button>
    <//>`;
}

function ServiceModal({ fid, child, settings, onClose }) {
  const [mode, setMode] = useState('normal');
  const [reason, setReason] = useState('');
  const [count, setCount] = useState('1');
  const [cases, setCases] = useState('1');
  const remaining = child.serviceRemaining || 0;
  const total = mode === 'violence' ? (Number(cases) || 0) * settings.violencePerCase : Number(count);

  const submit = async () => {
    // 중대 사안(학교에서 조치가 확정된 일)은 사건 내용 없이 중립적인 표현으로만 기록한다.
    const why = mode === 'violence' ? `생활 약속 위반 (${cases}건)` : reason.trim();
    if (!why) return toast('이유를 적어 주세요.');
    if (!Number.isInteger(total) || total <= 0 || total > 100) return toast('횟수는 1~100 사이로 입력해 주세요.');
    const ok = await run(() => store.addRecord(fid, child.id, (m) => serviceRecord(m, total, why)),
      `집안일 봉사 ${total}회를 부여했어요.`);
    if (ok) onClose();
  };
  const clear = async () => {
    if (!confirm(`남은 집안일 봉사 ${remaining}회를 모두 없앨까요?`)) return;
    const ok = await run(() => store.addRecord(fid, child.id, (m) => serviceRecord(m, -(m.serviceRemaining || 0), '부모가 해제')),
      '집안일 봉사를 해제했어요.');
    if (ok) onClose();
  };

  return html`
    <${Modal} title=${`${child.name} 집안일 봉사`} onClose=${onClose}>
      <p class="muted">지금 남은 봉사: <b>${remaining}회</b></p>
      <p class="hint">봉사가 남아 있는 동안 승인되는 용돈 집안일은 무급으로 처리되고 1회씩 줄어요. 지급 요청도 할 수 없어요.</p>
      <div class="seg small">
        <button class=${mode === 'normal' ? 'on' : ''} onClick=${() => setMode('normal')}>일반</button>
        <button class=${mode === 'violence' ? 'on' : ''} onClick=${() => setMode('violence')}>중대 사안</button>
      </div>
      ${mode === 'normal' ? html`
        <div class="chips">
          ${['생활 약속 위반', '거짓말', '형제와 다툼'].map((q) => html`
            <button class=${`chip ${reason === q ? 'on' : ''}`} onClick=${() => setReason(q)}>${q}</button>`)}
        </div>
        <textarea rows="2" maxlength="100" placeholder="자녀에게 보여 줄 이유" value=${reason}
          onInput=${(e) => setReason(e.target.value)}></textarea>
        <label class="field">집안일 봉사 횟수
          <input type="number" inputmode="numeric" min="1" step="1" value=${count} onInput=${(e) => setCount(e.target.value)} />
        </label>` : html`
        <div class="banner">학교 등에서 <b>사실과 조치가 확정된 뒤</b>에만 적용하세요. 자녀 화면에는 사건 내용 없이 "생활 약속 위반"과 "집안일 봉사 n회"로만 보여요.</div>
        <label class="field">조치가 확정된 건수
          <input type="number" inputmode="numeric" min="1" step="1" value=${cases} onInput=${(e) => setCases(e.target.value)} />
        </label>
        <p class="muted">1건당 ${settings.violencePerCase}회 → <b>집안일 봉사 ${total}회</b></p>`}
      <button class="btn primary block" onClick=${submit}>집안일 봉사 ${total > 0 ? total : ''}회 부여</button>
      ${remaining > 0 && html`<button class="btn danger-ghost block" onClick=${clear}>남은 집안일 봉사 해제</button>`}
    <//>`;
}

function SettingsModal({ fid, settings, onClose }) {
  const [f, setF] = useState({ ...settings });
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const save = async () => {
    const next = {
      streakDays: Number(f.streakDays),
      streakBonus: Number(f.streakBonus),
      violencePerCase: Number(f.violencePerCase),
    };
    if (!Number.isInteger(next.streakDays) || next.streakDays < 2 || next.streakDays > 60) return toast('연속 일수는 2~60일로 정해 주세요.');
    if (!Number.isInteger(next.streakBonus) || next.streakBonus < 10) return toast('보너스는 10원 이상으로 정해 주세요.');
    if (!Number.isInteger(next.violencePerCase) || next.violencePerCase < 1 || next.violencePerCase > 20) return toast('1건당 봉사 횟수는 1~20회로 정해 주세요.');
    if (await run(() => store.updateFamily(fid, { settings: next }), '규칙을 저장했어요.')) onClose();
  };
  return html`
    <${Modal} title="규칙 설정" onClose=${onClose}>
      <label class="field">기본 할 일 연속 완료 일수 (이 일수마다 보너스)
        <input type="number" inputmode="numeric" min="2" value=${f.streakDays} onInput=${(e) => set('streakDays', e.target.value)} />
      </label>
      <label class="field">연속 완료 보너스 용돈 (원)
        <input type="number" inputmode="numeric" min="10" step="100" value=${f.streakBonus} onInput=${(e) => set('streakBonus', e.target.value)} />
      </label>
      <label class="field">중대 사안 1건당 집안일 봉사 횟수
        <input type="number" inputmode="numeric" min="1" value=${f.violencePerCase} onInput=${(e) => set('violencePerCase', e.target.value)} />
      </label>
      <p class="hint">그날의 '오늘의 기본 할 일'을 모두 체크하면 연속 일수가 1 늘어요. 하나라도 빠진 날이 있으면 0부터 다시 시작해요. 기본 할 일이 없는 요일은 세지 않고 넘어가요.</p>
      <button class="btn primary block" onClick=${save}>저장</button>
    <//>`;
}

/* ───────── 기록 · 달력 (부모 · 자녀 공용) ───────── */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 승인된 집안일 횟수를 날짜별로 보여 주는 월간 달력
function MonthCalendar({ month, perDay, selected, onSelect, onMonth }) {
  const today = startOfDay();
  const d = new Date(month);
  const isCurrent = month === startOfMonth();
  return html`
    <div class="card cal">
      <div class="cal-head">
        <button class="icon-btn" onClick=${() => onMonth(-1)} aria-label="이전 달">‹</button>
        <b>${d.getFullYear()}년 ${d.getMonth() + 1}월</b>
        <button class="icon-btn" disabled=${isCurrent} onClick=${() => onMonth(1)} aria-label="다음 달">›</button>
      </div>
      <div class="cal-grid">
        ${WEEKDAYS.map((w, i) => html`<div class=${`cal-w ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}>${w}</div>`)}
        ${monthCells(month).map((t) => {
          if (t === null) return html`<div></div>`;
          const n = perDay.get(t) || 0;
          const level = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3;
          const cls = `cal-day lv${level} ${t === today ? 'today' : ''} ${t === selected ? 'sel' : ''}`;
          return html`
            <button class=${cls} disabled=${t > today} onClick=${() => onSelect(t === selected ? null : t)}
              aria-label=${`${new Date(t).getDate()}일 집안일 ${n}회`}>
              <span class="cal-num">${new Date(t).getDate()}</span>
              <span class="cal-cnt">${n > 0 ? `${n}회` : ''}</span>
            </button>`;
        })}
      </div>
    </div>`;
}

function HistoryTab({ requests, members, onlyChild }) {
  const children = members.filter((m) => m.role === 'child');
  const [who, setWho] = useState('all');
  const [month, setMonth] = useState(startOfMonth());
  const [day, setDay] = useState(null);
  const childId = onlyChild || (who === 'all' ? null : who);

  const monthEnd = addMonths(month, 1);
  const list = requests.filter((r) => (!childId || r.childId === childId)
    && r.createdAt >= month && r.createdAt < monthEnd);
  const done = list.filter(isWork);
  const earned = list.reduce((s, r) => s + earnedAmount(r), 0);
  const paid = sum(list.filter((r) => r.type === 'payout' && r.status === 'approved'));
  const penalty = sum(list.filter((r) => r.type === 'penalty'));

  const perDay = new Map();
  const perChore = new Map();
  for (const r of done) {
    const k = startOfDay(r.createdAt);
    perDay.set(k, (perDay.get(k) || 0) + 1);
    const c = perChore.get(r.choreName) || { emoji: r.emoji, name: r.choreName, n: 0 };
    c.n += 1;
    perChore.set(r.choreName, c);
  }
  const top = [...perChore.values()].sort((a, b) => b.n - a.n).slice(0, 3);

  const shown = day === null ? list : list.filter((r) => startOfDay(r.createdAt) === day);
  const groups = [];
  for (const r of shown) {
    const label = fmtDate(r.createdAt);
    if (groups.at(-1)?.day !== label) groups.push({ day: label, items: [] });
    groups.at(-1).items.push(r);
  }

  const changeMonth = (n) => { setMonth(addMonths(month, n)); setDay(null); };
  const monthNum = new Date(month).getMonth() + 1;

  return html`
    ${!onlyChild && children.length > 1 && html`
      <div class="chips">
        <button class=${`chip ${who === 'all' ? 'on' : ''}`} onClick=${() => setWho('all')}>전체</button>
        ${children.map((c) => html`
          <button class=${`chip ${who === c.id ? 'on' : ''}`} onClick=${() => setWho(c.id)}>${c.name}</button>`)}
      </div>`}

    <${MonthCalendar} month=${month} perDay=${perDay} selected=${day} onSelect=${setDay} onMonth=${changeMonth} />

    <div class="stats four">
      <div class="stat"><div class="muted small">집안일</div><div>${done.length}회</div></div>
      <div class="stat"><div class="muted small">한 날</div><div>${perDay.size}일</div></div>
      <div class="stat"><div class="muted small">적립</div><div class="plus">${won(earned)}</div></div>
      <div class="stat"><div class="muted small">지급</div><div class="minus">${won(paid)}</div></div>
    </div>
    ${penalty > 0 && html`<p class="hint">이 달 차감 ${won(penalty)}</p>`}

    ${top.length > 0 && html`
      <h3 class="day">많이 한 집안일</h3>
      <div class="chips">
        ${top.map((c, i) => html`<span class="chip static">${['🥇', '🥈', '🥉'][i]} ${c.emoji} ${c.name} ${c.n}회</span>`)}
      </div>`}

    <div class="section-head">
      <h2 class="section">${day === null ? `${monthNum}월 기록` : `${fmtDate(day)} 기록`}</h2>
      ${day !== null && html`<button class="btn small ghost" onClick=${() => setDay(null)}>달 전체 보기</button>`}
    </div>
    ${!shown.length && html`<${Empty} icon="📒" text=${day === null ? '이 달에는 기록이 없어요.' : '이 날은 기록이 없어요.'} />`}
    ${groups.map((g) => html`
      <h3 class="day">${g.day}</h3>
      <div class="card list">
        ${g.items.map((r) => html`
          <div class="row-item" key=${r.id}>
            <span class="emoji small">${reqIcon(r)}</span>
            <div class="grow">
              <div class="title">${reqTitle(r)}</div>
              <div class="muted small">
                ${!onlyChild && `${r.childName} · `}${fmtTime(r.createdAt)}
                <span class=${`status ${r.status}`}>${statusText(r)}</span>
              </div>
              ${showReason(r) && html`<div class="reason">사유: ${r.reason}</div>`}
            </div>
            <${Amount} r=${r} />
          </div>`)}
      </div>`)}`;
}

/* ───────── 자녀: 홈 ───────── */

const GOAL_EMOJIS = ['🎯', '🎧', '🎮', '👟', '📱', '⌚', '🚲', '📚', '⚽', '🎁'];

function GoalCard({ me, requests, onEdit }) {
  const p = goalProgress(me, requests);
  if (!p) {
    return html`
      <button class="card goal-empty" onClick=${onEdit}>
        <span class="emoji">🎯</span>
        <div class="grow"><div class="title">저축 목표 정하기</div>
          <div class="muted small">사고 싶은 물건을 정하고 얼마나 모았는지 확인해요</div></div>
        <span class="muted">›</span>
      </button>`;
  }
  const { goal } = me;
  return html`
    <div class="card goal">
      <div class="row-item">
        <span class="emoji">${goal.emoji || '🎯'}</span>
        <div class="grow"><div class="muted small">저축 목표</div><div class="title">${goal.name}</div></div>
        <button class="btn small ghost" onClick=${onEdit}>수정</button>
      </div>
      <div class="bar"><div class="bar-fill" style=${`width:${p.pct}%`}></div></div>
      <div class="goal-foot">
        <span><b>${p.pct}%</b> · ${won(me.balance)} / ${won(goal.amount)}</span>
        <span>${p.remain === 0 ? '🎉 다 모았어요!' : `${won(p.remain)} 남음`}</span>
      </div>
      ${p.weeks && html`<div class="muted small">지금 속도라면 약 ${p.weeks}주 뒤에 모을 수 있어요.</div>`}
    </div>`;
}

function GoalModal({ fid, me, onClose }) {
  const g = me.goal || {};
  const [f, setF] = useState({ emoji: g.emoji || '🎯', name: g.name || '', amount: g.amount || '' });
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    const amount = Number(f.amount);
    if (!f.name.trim()) return toast('목표 이름을 입력해 주세요.');
    if (!Number.isInteger(amount) || amount < 100 || amount > 10000000) {
      return toast('금액은 100원~10,000,000원 사이로 입력해 주세요.');
    }
    const goal = { emoji: f.emoji, name: f.name.trim(), amount, setAt: Date.now() };
    if (await run(() => store.updateMember(fid, me.id, { goal }), '목표를 저장했어요.')) onClose();
  };
  const remove = async () => {
    if (!confirm('목표를 지울까요?')) return;
    if (await run(() => store.updateMember(fid, me.id, { goal: null }), '목표를 지웠어요.')) onClose();
  };

  return html`
    <${Modal} title="저축 목표" onClose=${onClose}>
      <div class="emoji-pick">
        ${GOAL_EMOJIS.map((e) => html`<button class=${f.emoji === e ? 'on' : ''} onClick=${() => set('emoji', e)}>${e}</button>`)}
      </div>
      <label class="field">무엇을 살까요?
        <input maxlength="20" placeholder="예: 무선 이어폰" value=${f.name} onInput=${(e) => set('name', e.target.value)} />
      </label>
      <label class="field">목표 금액 (원)
        <input type="number" inputmode="numeric" min="100" step="1000" value=${f.amount}
          onInput=${(e) => set('amount', e.target.value)} />
      </label>
      <button class="btn primary block" onClick=${save}>저장</button>
      ${g.name && html`<button class="btn danger-ghost block" onClick=${remove}>목표 지우기</button>`}
    <//>`;
}

// 오늘의 기본 할 일 연속 달성 현황과 보너스 받기 (기본 할 일 목록 바로 아래에 붙는다)
function StreakCard({ fid, me, chores, requests, settings }) {
  const s = streakInfo(requests, chores, me.id, settings.streakDays);
  const claim = () => run(() => store.createRequest(fid, {
    type: 'bonus', childId: me.id, childName: me.name, amount: settings.streakBonus,
    streakKey: s.unclaimed[0], streakDays: settings.streakDays, memo: '',
  }), '보너스를 요청했어요! 부모님이 확인하면 들어와요.');
  const todayText = {
    done: '오늘의 기본 할 일을 모두 했어요!',
    missed: s.count > 0 ? '오늘의 기본 할 일을 모두 하면 이어져요.' : '오늘의 기본 할 일을 모두 하면 1일째!',
    none: '오늘은 기본 할 일이 없는 날이에요.',
  }[s.todayState];

  return html`
    <div class="streak-strip">
      <span class="streak-fire">${s.count > 0 ? '🔥' : '🌱'}</span>
      <div class="grow">
        <div class="title">${s.count > 0 ? `${s.count}일 연속 달성 중` : '오늘부터 연속 달성 시작!'}</div>
        <div class="muted small">${todayText}</div>
        <div class="muted small">${settings.streakDays}일 연속이면 보너스 용돈 ${won(settings.streakBonus)} · 다음 보너스까지 ${s.toNext}일</div>
      </div>
      ${s.unclaimed.length > 0 && html`<button class="btn primary small" onClick=${claim}>보너스 받기</button>`}
    </div>`;
}

// 특별 미션 칸에 보이는 집안일 봉사 카드
function ServiceCard({ me, requests }) {
  const last = requests.find((r) => r.childId === me.id && r.type === 'service' && r.count > 0);
  return html`
    <div class="card service-card">
      <span class="emoji">🤝</span>
      <div class="grow">
        <div class="title">집안일 봉사 ${me.serviceRemaining}회</div>
        ${last?.reason && html`<div class="muted small">${last.reason}</div>`}
        <div class="small service-text">용돈 집안일을 하면 봉사로 채워져요 (무급)</div>
      </div>
      <div class="mission-side">
        <span class="tag service">남은 ${me.serviceRemaining}회</span>
      </div>
    </div>`;
}

function ChildHome({ fid, me, chores, requests, family }) {
  const [doing, setDoing] = useState(null);
  const [payout, setPayout] = useState(false);
  const [goalEdit, setGoalEdit] = useState(false);
  const settings = settingsOf(family);
  const mine = requests.filter((r) => r.childId === me.id);
  const pending = mine.filter((r) => r.status === 'pending');
  const pendingEarn = sum(pending.filter((r) => r.type === 'chore' || r.type === 'bonus'));
  const weekEarn = mine.filter((r) => r.createdAt >= startOfWeek()).reduce((s, r) => s + earnedAmount(r), 0);
  const pendingPay = pendingPayoutSum(requests, me.id);

  const visible = chores.filter((c) => choreVisibleTo(c, me.id));
  const duties = visible.filter((c) => choreKind(c) === 'duty');
  const paid = visible.filter((c) => choreKind(c) === 'paid');
  // 다른 자녀가 먼저 가져간 미션은 보이지 않는다.
  const missions = visible.filter((c) => {
    if (choreKind(c) !== 'mission') return false;
    const r = missionRequest(requests, c.id);
    return !r || r.childId === me.id;
  });
  const dutyDoneToday = (c) => mine.find((r) => r.type === 'duty' && r.choreId === c.id && r.createdAt >= startOfDay());
  const dutyDone = duties.filter(dutyDoneToday).length;

  // 기본 할 일은 승인 없이 체크/해제한다.
  const toggleDuty = (c) => {
    const r = dutyDoneToday(c);
    if (r) return run(() => store.cancelRequest(fid, r.id));
    return run(() => store.createRequest(fid, {
      type: 'duty', childId: me.id, childName: me.name, choreId: c.id, choreName: c.name,
      choreKind: 'duty', emoji: c.emoji, amount: 0, memo: '',
    }), dutyDone + 1 === duties.length ? '오늘 기본 할 일을 모두 끝냈어요! 👏' : null);
  };

  const serving = me.serviceRemaining > 0;

  return html`
    <div class="balance-card">
      <div class="small">모은 용돈</div>
      <div class="balance">${won(me.balance)}</div>
      <div class="balance-sub">
        <span>이번 주 +${won(weekEarn)}</span>
        ${pendingEarn > 0 && html`<span>승인 대기 +${won(pendingEarn)}</span>`}
        ${pendingPay > 0 && html`<span>지급 요청 중 ${won(pendingPay)}</span>`}
      </div>
      <button class="btn light block" onClick=${() => setPayout(true)}>용돈 지급 요청</button>
      ${serving && html`<div class="balance-note">🤝 집안일 봉사를 다 채우면 지급 요청을 할 수 있어요</div>`}
    </div>

    <${GoalCard} me=${me} requests=${requests} onEdit=${() => setGoalEdit(true)} />

    ${duties.length > 0 && html`
      <div class="section-head">
        <h2 class="section">오늘의 기본 할 일</h2>
        <span class=${dutyDone === duties.length ? 'plus' : 'muted'}>${dutyDone}/${duties.length}</span>
      </div>
      <div class="card list duty-card">
        ${duties.map((c) => {
          const done = !!dutyDoneToday(c);
          return html`
            <button class=${`row-item plain duty ${done ? 'done' : ''}`} onClick=${() => toggleDuty(c)} key=${c.id}
              aria-pressed=${done}>
              <span class="check">${done ? '✓' : ''}</span>
              <span class="emoji small">${c.emoji}</span>
              <div class="grow">
                <div class="title">${c.name}</div>
                ${c.desc && html`<div class="muted small">${c.desc}</div>`}
              </div>
            </button>`;
        })}
        <${StreakCard} fid=${fid} me=${me} chores=${chores} requests=${requests} settings=${settings} />
      </div>`}

    ${(serving || missions.length > 0) && html`
      <h2 class="section">특별 미션</h2>
      ${serving && html`<${ServiceCard} me=${me} requests=${requests} />`}
      ${missions.map((c) => {
        const taken = !!missionRequest(requests, c.id);
        const overdue = isOverdue(c);
        return html`
          <button class="card mission" disabled=${taken || overdue} onClick=${() => setDoing(c)} key=${c.id}>
            <span class="emoji">${c.emoji}</span>
            <div class="grow">
              <div class="title">${c.name}</div>
              ${c.desc && html`<div class="muted small">${c.desc}</div>`}
            </div>
            <div class="mission-side">
              <div class="price">${won(c.price)}</div>
              <span class=${`tag ${overdue ? 'warn' : 'due'}`}>${taken ? '확인 대기' : dueLabel(c.dueAt)}</span>
            </div>
          </button>`;
      })}`}

    <h2 class="section">용돈 집안일</h2>
    ${!paid.length && html`<${Empty} icon="🧽" text="오늘 할 수 있는 용돈 집안일이 없어요." />`}
    <div class="chore-grid">
      ${paid.map((c) => {
        const n = todayCount(requests, me.id, c.id);
        const full = c.dailyLimit > 0 && n >= c.dailyLimit;
        return html`
          <button class="chore-tile" disabled=${full} onClick=${() => setDoing(c)} key=${c.id}>
            <span class="emoji big">${c.emoji}</span>
            <span class="title">${c.name}</span>
            ${serving ? html`<span class="tag service">봉사</span>` : html`<span class="price">${won(c.price)}</span>`}
            ${c.dailyLimit > 0 && html`<span class="muted small">${full ? '오늘 완료' : `오늘 ${n}/${c.dailyLimit}`}</span>`}
          </button>`;
      })}
    </div>

    ${pending.length > 0 && html`
      <h2 class="section">부모님 확인 기다리는 중</h2>
      <div class="card list">
        ${pending.map((r) => html`
          <div class="row-item" key=${r.id}>
            <span class="emoji small">${reqIcon(r)}</span>
            <div class="grow">
              <div class="title">${reqTitle(r)}</div>
              <div class="muted small">${fmtTime(r.createdAt)}</div>
            </div>
            <${Amount} r=${r} />
            <button class="btn small ghost" onClick=${() => confirm('요청을 취소할까요?')
              && run(() => store.cancelRequest(fid, r.id), '요청을 취소했어요.')}>취소</button>
          </div>`)}
      </div>`}

    ${doing && html`<${DoneModal} fid=${fid} me=${me} chore=${doing} requests=${requests} onClose=${() => setDoing(null)} />`}
    ${payout && html`<${PayoutModal} fid=${fid} me=${me} requests=${requests} onClose=${() => setPayout(false)} />`}
    ${goalEdit && html`<${GoalModal} fid=${fid} me=${me} onClose=${() => setGoalEdit(false)} />`}`;
}

function DoneModal({ fid, me, chore, requests, onClose }) {
  const [memo, setMemo] = useState('');
  const submit = async () => {
    if (chore.dailyLimit > 0 && todayCount(requests, me.id, chore.id) >= chore.dailyLimit) {
      toast('오늘은 이미 최대 횟수만큼 했어요.');
      return onClose();
    }
    const ok = await run(() => store.createRequest(fid, {
      type: 'chore',
      childId: me.id,
      childName: me.name,
      choreId: chore.id,
      choreName: chore.name,
      choreKind: choreKind(chore),
      emoji: chore.emoji,
      amount: chore.price,
      memo: memo.trim(),
    }), '부모님께 완료 요청을 보냈어요!');
    if (ok) onClose();
  };
  return html`
    <${Modal} title=${choreKind(chore) === 'mission' ? '특별 미션 완료' : '집안일 완료'} onClose=${onClose}>
      <div class="done-head">
        <span class="emoji big">${chore.emoji}</span>
        <div><div class="title">${chore.name}</div><div class="plus">+${won(chore.price)}</div></div>
      </div>
      ${chore.desc && html`<p class="muted">${chore.desc}</p>`}
      ${me.serviceRemaining > 0 && choreKind(chore) === 'paid' && html`
        <p class="hint service-hint">🤝 집안일 봉사가 ${me.serviceRemaining}회 남아 있어서 이번 집안일은 봉사로 처리돼요 (무급).</p>`}
      <textarea rows="2" maxlength="100" placeholder="부모님께 한마디 (선택)"
        value=${memo} onInput=${(e) => setMemo(e.target.value)}></textarea>
      <button class="btn primary block" onClick=${submit}>다 했어요!</button>
    <//>`;
}

function PayoutModal({ fid, me, requests, onClose }) {
  const available = Math.max(0, (me.balance || 0) - pendingPayoutSum(requests, me.id));
  const [amount, setAmount] = useState(String(available));
  const [memo, setMemo] = useState('');
  const value = Number(amount);
  const error = checkPayout(me, requests, value);

  const submit = async () => {
    if (error) return toast(error);
    const ok = await run(() => store.createRequest(fid, {
      type: 'payout', childId: me.id, childName: me.name, amount: value, memo: memo.trim(),
    }), '지급 요청을 보냈어요.');
    if (ok) onClose();
  };

  return html`
    <${Modal} title="용돈 지급 요청" onClose=${onClose}>
      <p class="muted">요청할 수 있는 금액: <b>${won(available)}</b></p>
      <label class="field">받고 싶은 금액 (원)
        <input type="number" inputmode="numeric" min="1" step="100" value=${amount}
          onInput=${(e) => setAmount(e.target.value)} />
        <div class="chips"><button class="chip" onClick=${() => setAmount(String(available))}>전액</button></div>
      </label>
      <textarea rows="2" maxlength="100" placeholder="어디에 쓸지 (선택)"
        value=${memo} onInput=${(e) => setMemo(e.target.value)}></textarea>
      ${error && html`<p class="error">${error}</p>`}
      <button class="btn primary block" disabled=${!!error} onClick=${submit}>요청 보내기</button>
    <//>`;
}

/* ───────── 앱 ───────── */

function ParentApp(ctx) {
  const [tab, setTab] = useState('approve');
  const pendingCount = ctx.requests.filter((r) => r.status === 'pending').length;
  const tabs = [
    ['approve', '승인', '📥', pendingCount],
    ['chores', '집안일', '🧽', 0],
    ['family', '가족', '👪', 0],
    ['history', '달력', '📅', 0],
  ];
  return html`
    <${Shell} family=${ctx.family} me=${ctx.me} tabs=${tabs} tab=${tab} setTab=${setTab}>
      ${tab === 'approve' && html`<${ApproveTab} ...${ctx} />`}
      ${tab === 'chores' && html`<${ChoresTab} ...${ctx} />`}
      ${tab === 'family' && html`<${FamilyTab} ...${ctx} />`}
      ${tab === 'history' && html`<${HistoryTab} ...${ctx} />`}
    <//>`;
}

function ChildApp(ctx) {
  const [tab, setTab] = useState('home');
  const tabs = [['home', '홈', '🏠', 0], ['history', '달력', '📅', 0]];
  return html`
    <${Shell} family=${ctx.family} me=${ctx.me} tabs=${tabs} tab=${tab} setTab=${setTab}>
      ${tab === 'home' && html`<${ChildHome} ...${ctx} />`}
      ${tab === 'history' && html`<${HistoryTab} ...${ctx} onlyChild=${ctx.me.id} />`}
    <//>`;
}

function FamilyApp({ user, fid }) {
  const family = useWatch((cb) => store.watchFamily(fid, cb), [fid]);
  const members = useWatch((cb) => store.watchMembers(fid, cb), [fid]);
  const chores = useWatch((cb) => store.watchChores(fid, cb), [fid]);
  const requests = useWatch((cb) => store.watchRequests(fid, cb), [fid]);

  if (!family || !members || !chores || !requests) return html`<${Loading} />`;
  const me = members.find((m) => m.id === user.uid);
  if (!me) {
    return html`<div class="auth"><p>가족 정보를 찾을 수 없어요.</p>
      <button class="btn" onClick=${() => store.signOut()}>나가기</button></div>`;
  }
  const ctx = { fid, family, members, chores, requests, me };
  return me.role === 'parent' ? html`<${ParentApp} ...${ctx} />` : html`<${ChildApp} ...${ctx} />`;
}

function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => store.onAuth(setUser), []);
  const profile = useWatch((cb) => {
    if (!user) { cb(null); return () => {}; }
    return store.watchUser(user.uid, cb);
  }, [user?.uid]);

  let page;
  if (user === undefined) page = html`<${Loading} />`;
  else if (!user) page = store.mode === 'demo' ? html`<${DemoLogin} />` : html`<${FirebaseLogin} />`;
  else if (profile === undefined) page = html`<${Loading} />`;
  else if (!profile?.familyId) page = html`<${Onboarding} user=${user} />`;
  else page = html`<${FamilyApp} user=${user} fid=${profile.familyId} />`;

  return html`${page}<${Toast} />`;
}

render(html`<${App} />`, document.getElementById('app'));
