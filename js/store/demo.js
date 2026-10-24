// 체험 모드 저장소: Firebase 없이 이 브라우저의 localStorage에 저장한다.
// 탭마다 다른 사람으로 로그인할 수 있어서, 탭 두 개로 부모와 자녀 흐름을 함께 확인할 수 있다.
import {
  DEFAULT_CHORES, newChore, approvalEffect, initialStatus, choreKind, isOverdue, settingsOf,
} from '../logic.js';

const KEY = 'chore-demo-v1';
const UID_KEY = 'chore-demo-uid';
const FID = 'demo-family';

const newId = () => Math.random().toString(36).slice(2, 10);

function seed() {
  const chores = {};
  DEFAULT_CHORES.forEach((c, i) => {
    const id = newId();
    chores[id] = { id, ...newChore(c, i) };
  });
  // 체험용 특별 미션 하나 (7일 뒤 마감)
  const mid = newId();
  const due = new Date();
  due.setDate(due.getDate() + 7);
  due.setHours(23, 59, 59, 999);
  chores[mid] = {
    id: mid,
    ...newChore({ kind: 'mission', emoji: '🧽', name: '베란다 대청소', price: 5000, desc: '창틀까지 닦기' }, DEFAULT_CHORES.length),
    dueAt: due.getTime(),
  };
  const member = (id, name, role) => ({ id, name, role, balance: 0, serviceRemaining: 0, joinedAt: Date.now() });
  return {
    users: { 'demo-parent': { familyId: FID }, 'demo-child': { familyId: FID } },
    families: {
      [FID]: {
        id: FID,
        name: '우리 가족 (체험)',
        createdBy: 'demo-parent',
        parentCode: 'DEMO-P',
        childCode: 'DEMO-C',
        members: { 'demo-parent': member('demo-parent', '부모', 'parent'), 'demo-child': member('demo-child', '자녀', 'child') },
        chores,
        requests: {},
      },
    },
  };
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

let data = load() || seed();
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn(e); }
  emit();
}

addEventListener('storage', (e) => {
  if (e.key === KEY) { data = load() || seed(); emit(); }
});

function watch(select, cb) {
  const run = () => cb(structuredClone(select() ?? null));
  listeners.add(run);
  queueMicrotask(run);
  return () => listeners.delete(run);
}

const fam = (fid) => data.families[fid];

// 체험용 로그인 (탭마다 sessionStorage에 저장)
const authListeners = new Set();
const accounts = { 'demo-parent': '부모', 'demo-child': '자녀' };
function currentUser() {
  let uid = null;
  try { uid = sessionStorage.getItem(UID_KEY); } catch { /* 저장 불가 환경 */ }
  return uid && accounts[uid] ? { uid, name: accounts[uid], email: '' } : null;
}
function setUid(uid) {
  try { uid ? sessionStorage.setItem(UID_KEY, uid) : sessionStorage.removeItem(UID_KEY); } catch { /* 무시 */ }
  authListeners.forEach((f) => f(currentUser()));
}

const unsupported = async () => { throw new Error('체험 모드에서는 쓸 수 없는 기능이에요.'); };

export default {
  mode: 'demo',
  demoAccounts: [
    { uid: 'demo-parent', label: '부모로 체험하기' },
    { uid: 'demo-child', label: '자녀로 체험하기' },
  ],
  signInDemo: (uid) => setUid(uid),
  resetDemo() { data = seed(); save(); },

  onAuth(cb) {
    authListeners.add(cb);
    queueMicrotask(() => cb(currentUser()));
    return () => authListeners.delete(cb);
  },
  signOut: async () => setUid(null),
  // 체험 모드에는 저장된 계정 목록이 없다 (부모/자녀 버튼으로 바로 바꾼다).
  listAccounts: () => [],
  currentAccount: () => null,
  showPicker: async () => setUid(null),
  signInGoogle: unsupported,
  signInEmail: unsupported,
  signUpEmail: unsupported,
  createFamily: unsupported,
  joinFamily: unsupported,

  watchUser: (uid, cb) => watch(() => data.users[uid], cb),
  watchFamily: (fid, cb) => watch(() => {
    const { members, chores, requests, ...f } = fam(fid);
    return f;
  }, cb),
  watchMembers: (fid, cb) => watch(() => Object.values(fam(fid).members), cb),
  watchChores: (fid, cb) => watch(() => Object.values(fam(fid).chores).sort((a, b) => a.order - b.order), cb),
  watchRequests: (fid, cb) => watch(() => Object.values(fam(fid).requests).sort((a, b) => b.createdAt - a.createdAt), cb),

  async regenerateCode(family, role) {
    const field = role === 'parent' ? 'parentCode' : 'childCode';
    fam(family.id)[field] = `DEMO-${newId().slice(0, 4).toUpperCase()}`;
    save();
  },

  async updateMember(fid, uid, patch) {
    Object.assign(fam(fid).members[uid], patch);
    save();
  },
  async updateFamily(fid, patch) {
    Object.assign(fam(fid), patch);
    save();
  },

  async addRecord(fid, childId, make) {
    const f = fam(fid);
    const member = f.members[childId];
    const { patch, record } = make(structuredClone(member));
    Object.assign(member, patch);
    const id = newId();
    const now = Date.now();
    f.requests[id] = {
      id, ...record, childId, childName: member.name, status: 'approved',
      createdAt: now, decidedAt: now, decidedBy: currentUser()?.uid,
    };
    save();
  },

  async saveChore(fid, { id, ...rest }) {
    const chores = fam(fid).chores;
    if (id) Object.assign(chores[id], rest);
    else { const nid = newId(); chores[nid] = { id: nid, ...rest }; }
    save();
  },
  async deleteChore(fid, id) {
    delete fam(fid).chores[id];
    save();
  },
  async reorderChores(fid, ids) {
    ids.forEach((id, i) => { fam(fid).chores[id].order = i; });
    save();
  },

  async createRequest(fid, req) {
    const f = fam(fid);
    // firestore.rules와 같은 검사를 흉내 낸다.
    if (req.type === 'bonus') {
      if (req.amount !== settingsOf(f).streakBonus) throw new Error('보너스 금액이 바뀌었어요. 다시 시도해 주세요.');
    } else if (req.type !== 'payout') {
      const chore = f.chores[req.choreId];
      const kind = chore && choreKind(chore);
      const ok = chore && !chore.hidden && (req.type === 'duty'
        ? kind === 'duty' && req.amount === 0
        : kind !== 'duty' && chore.price === req.amount && !(kind === 'mission' && (chore.done || isOverdue(chore))));
      if (!ok) throw new Error('집안일 정보가 바뀌었어요. 다시 시도해 주세요.');
    }
    const id = newId();
    f.requests[id] = { id, ...req, status: initialStatus(req.type), createdAt: Date.now() };
    save();
  },
  async cancelRequest(fid, id) {
    delete fam(fid).requests[id];
    save();
  },

  async decide(fid, reqId, approve, reason = '') {
    const f = fam(fid);
    const req = f.requests[reqId];
    if (!req) throw new Error('요청을 찾을 수 없어요.');
    if (req.status !== 'pending') throw new Error('이미 처리된 요청이에요.');
    const decided = { decidedAt: Date.now(), decidedBy: currentUser()?.uid };
    if (!approve) {
      Object.assign(req, decided, { status: 'rejected', reason });
    } else {
      const member = f.members[req.childId];
      const { balance, serviceRemaining, serviceUsed } = approvalEffect(req, member);
      Object.assign(member, { balance, serviceRemaining });
      Object.assign(req, decided, { status: 'approved', balanceAfter: balance, serviceUsed });
      const chore = f.chores[req.choreId];
      if (req.choreKind === 'mission' && chore) Object.assign(chore, { done: true, doneBy: req.childId, doneAt: Date.now() });
    }
    save();
  },
};
