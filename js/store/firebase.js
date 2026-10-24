// Firebase(로그인 + Firestore) 저장소. 체험용 store/demo.js와 같은 함수를 제공한다.
//
// 한 기기(예: 가족 태블릿)를 여러 사람이 같이 쓸 수 있게 계정마다 Firebase 앱 인스턴스(슬롯)를 따로 만든다.
// 슬롯마다 로그인 상태가 따로 저장되므로, 한 번 로그인한 계정은 비밀번호 없이 바로 바꿔 쓸 수 있다.
// 다른 사람이 바꿔 들어가지 못하게 계정마다 4자리 PIN(이 기기에만 저장)을 둔다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, doc, collection, query, orderBy, limit,
  onSnapshot, getDoc, setDoc, addDoc, updateDoc, deleteDoc, writeBatch, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from '../config.js';
import { DEFAULT_CHORES, newChore, genCode, approvalEffect, initialStatus } from '../logic.js';

/* ───────── 계정 슬롯 ───────── */

const DEFAULT_SLOT = '[DEFAULT]';
const ACCOUNTS_KEY = 'chore-accounts-v1'; // [{ slot, uid, name, email, role, pinHash }]
const ACTIVE_KEY = 'chore-active-slot';    // 탭(앱 실행)마다 지금 쓰는 슬롯

const instances = new Map();
function inst(slot) {
  if (!instances.has(slot)) {
    const app = slot === DEFAULT_SLOT ? initializeApp(firebaseConfig) : initializeApp(firebaseConfig, slot);
    instances.set(slot, { auth: getAuth(app), db: initializeFirestore(app, { localCache: persistentLocalCache() }) });
  }
  return instances.get(slot);
}

function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || []; } catch { return []; }
}
function saveAccounts(list) {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); } catch { /* 저장 불가 환경 */ }
}
function setActiveSlot(slot) {
  try { slot ? sessionStorage.setItem(ACTIVE_KEY, slot) : sessionStorage.removeItem(ACTIVE_KEY); } catch { /* 무시 */ }
}
function getActiveSlot() {
  try { return sessionStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

const findAccount = (slot) => loadAccounts().find((a) => a.slot === slot);
function upsertAccount(acc) {
  const list = loadAccounts().filter((a) => a.slot !== acc.slot);
  saveAccounts([...list, acc]);
}
const removeAccount = (slot) => saveAccounts(loadAccounts().filter((a) => a.slot !== slot));

function newSlot() {
  const used = new Set(loadAccounts().map((a) => a.slot));
  return used.has(DEFAULT_SLOT) ? `acc-${Math.random().toString(36).slice(2, 10)}` : DEFAULT_SLOT;
}

async function pinHash(uid, pin) {
  const bytes = new TextEncoder().encode(`chore:${uid}:${pin}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ───────── 지금 쓰는 계정 ───────── */

let activeSlot = null;
let unsubAuth = null;
const authListeners = new Set();
let lastUser;
const emit = (user) => { lastUser = user; authListeners.forEach((cb) => cb(user)); };
const toUser = (u) => ({ uid: u.uid, name: u.displayName || '', email: u.email || '' });

// slot이 null이면 '누가 사용하나요?' 화면(또는 로그인 화면)으로 간다.
function activate(slot) {
  unsubAuth?.();
  unsubAuth = null;
  activeSlot = slot;
  setActiveSlot(slot);
  if (!slot) { emit(null); return; }
  emit(undefined);
  unsubAuth = onAuthStateChanged(inst(slot).auth, (u) => {
    if (!u) {
      // 이 기기에서 로그인 상태가 사라진 계정은 목록에서 지운다.
      removeAccount(slot);
      if (activeSlot === slot) { activeSlot = null; setActiveSlot(null); }
      emit(null);
      return;
    }
    const dup = loadAccounts().find((a) => a.uid === u.uid && a.slot !== slot);
    if (dup) {
      // 이미 저장된 계정으로 다시 로그인했으면 원래 슬롯을 쓴다.
      signOut(inst(slot).auth);
      activate(dup.slot);
      return;
    }
    if (!findAccount(slot)) {
      upsertAccount({ slot, uid: u.uid, name: u.displayName || u.email || '', email: u.email || '', role: null, pinHash: null });
    }
    emit(toUser(u));
  });
}

// 앱 시작: 이 탭에서 쓰던 계정 → 저장된 계정이 하나면 그 계정 → 여러 개면 고르기 화면
function start() {
  const accounts = loadAccounts();
  const remembered = getActiveSlot();
  if (remembered && accounts.some((a) => a.slot === remembered)) activate(remembered);
  else if (accounts.length === 1) activate(accounts[0].slot);
  else if (accounts.length === 0) activate(DEFAULT_SLOT); // 예전 버전에서 로그인해 둔 계정이 있으면 이어서 쓴다
  else activate(null);
}
start();

// 새 계정으로 로그인: 빈 슬롯에서 로그인한 뒤 그 슬롯으로 바꾼다.
async function signInNew(fn) {
  const slot = activeSlot && !findAccount(activeSlot) ? activeSlot : newSlot();
  await fn(inst(slot).auth);
  activate(slot);
}

const A = () => inst(activeSlot).auth;
const D = () => inst(activeSlot).db;
const famRef = (fid, ...path) => doc(D(), 'families', fid, ...path);
const famCol = (fid, name) => collection(D(), 'families', fid, name);

/* ───────── 문서 읽기 도우미 ───────── */

// Firestore 문서를 화면에서 쓰기 쉬운 평범한 객체로 바꾼다 (시간은 밀리초 숫자로).
function plain(snap) {
  const d = snap.data({ serverTimestamps: 'estimate' });
  for (const k of Object.keys(d)) if (d[k]?.toMillis) d[k] = d[k].toMillis();
  return { id: snap.id, ...d };
}

const logErr = (e) => console.error(e);
const watchDoc = (ref, cb) => onSnapshot(ref, (s) => cb(s.exists() ? plain(s) : null), logErr);
const watchList = (q, cb) => onSnapshot(q, (s) => cb(s.docs.map(plain)), logErr);

export default {
  mode: 'firebase',

  onAuth(cb) {
    authListeners.add(cb);
    if (lastUser !== undefined) queueMicrotask(() => cb(lastUser));
    return () => authListeners.delete(cb);
  },
  signInGoogle: () => signInNew((auth) => signInWithPopup(auth, new GoogleAuthProvider())),
  signInEmail: (email, pw) => signInNew((auth) => signInWithEmailAndPassword(auth, email, pw)),
  signUpEmail: (email, pw) => signInNew((auth) => createUserWithEmailAndPassword(auth, email, pw)),

  // 이 기기에서 지금 계정을 완전히 로그아웃한다 (다시 쓰려면 비밀번호 필요).
  async signOut() {
    const slot = activeSlot;
    if (!slot) return;
    removeAccount(slot);
    activate(null);
    await signOut(inst(slot).auth);
  },

  /* 여러 계정 */
  listAccounts: () => loadAccounts().map(({ pinHash: h, ...a }) => ({ ...a, hasPin: Boolean(h) })),
  currentAccount() {
    const a = findAccount(activeSlot);
    return a && { ...a, hasPin: Boolean(a.pinHash), pinHash: undefined };
  },
  showPicker: () => activate(null),
  switchTo: (slot) => activate(slot),
  rememberProfile(patch) {
    const a = findAccount(activeSlot);
    if (a && Object.keys(patch).some((k) => a[k] !== patch[k])) upsertAccount({ ...a, ...patch });
  },
  async setPin(pin) {
    const a = findAccount(activeSlot);
    if (a) upsertAccount({ ...a, pinHash: await pinHash(a.uid, pin) });
  },
  async checkPin(slot, pin) {
    const a = findAccount(slot);
    return Boolean(a?.pinHash) && a.pinHash === await pinHash(a.uid, pin);
  },
  // 저장된 계정을 이 기기에서 지운다 (그 계정은 로그아웃된다).
  async forget(slot) {
    removeAccount(slot);
    if (activeSlot === slot) activate(null);
    await signOut(inst(slot).auth);
  },

  watchUser: (uid, cb) => watchDoc(doc(D(), 'users', uid), cb),
  watchFamily: (fid, cb) => watchDoc(famRef(fid), cb),
  watchMembers: (fid, cb) => watchList(famCol(fid, 'members'), cb),
  watchChores: (fid, cb) => watchList(query(famCol(fid, 'chores'), orderBy('order')), cb),
  watchRequests: (fid, cb) => watchList(query(famCol(fid, 'requests'), orderBy('createdAt', 'desc'), limit(500)), cb),

  async createFamily({ familyName, myName }) {
    const db = D();
    const uid = A().currentUser.uid;
    const fRef = doc(collection(db, 'families'));
    const parentCode = genCode();
    const childCode = genCode();
    // 순서가 중요하다: 가족 → 나(부모) → 초대 코드와 기본 집안일 (보안 규칙이 앞 단계를 확인함)
    await setDoc(fRef, { name: familyName, createdBy: uid, parentCode, childCode, createdAt: serverTimestamp() });
    await setDoc(doc(fRef, 'members', uid), {
      name: myName, role: 'parent', balance: 0, serviceRemaining: 0, joinedAt: serverTimestamp(),
    });
    const b = writeBatch(db);
    b.set(doc(db, 'inviteCodes', parentCode), { familyId: fRef.id, role: 'parent', familyName });
    b.set(doc(db, 'inviteCodes', childCode), { familyId: fRef.id, role: 'child', familyName });
    DEFAULT_CHORES.forEach((c, i) => b.set(doc(collection(fRef, 'chores')), newChore(c, i)));
    await b.commit();
    await setDoc(doc(db, 'users', uid), { familyId: fRef.id });
  },

  async joinFamily({ code, myName }) {
    const db = D();
    const uid = A().currentUser.uid;
    const inv = await getDoc(doc(db, 'inviteCodes', code));
    if (!inv.exists()) throw new Error('초대 코드를 찾을 수 없어요. 다시 확인해 주세요.');
    const { familyId, role } = inv.data();
    await setDoc(famRef(familyId, 'members', uid), {
      name: myName, role, balance: 0, serviceRemaining: 0, joinCode: code, joinedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'users', uid), { familyId });
  },

  async regenerateCode(family, role) {
    const db = D();
    const field = role === 'parent' ? 'parentCode' : 'childCode';
    const code = genCode();
    const b = writeBatch(db);
    b.set(doc(db, 'inviteCodes', code), { familyId: family.id, role, familyName: family.name });
    if (family[field]) b.delete(doc(db, 'inviteCodes', family[field]));
    b.update(famRef(family.id), { [field]: code });
    await b.commit();
  },

  updateMember: (fid, uid, patch) => updateDoc(famRef(fid, 'members', uid), patch),
  updateFamily: (fid, patch) => updateDoc(famRef(fid), patch),

  // 부모가 차감·집안일 봉사 같은 기록을 남긴다. make(member)가 { patch, record }를 돌려준다.
  async addRecord(fid, childId, make) {
    const uid = A().currentUser.uid;
    const mRef = famRef(fid, 'members', childId);
    const rRef = doc(famCol(fid, 'requests'));
    await runTransaction(D(), async (tx) => {
      const mSnap = await tx.get(mRef);
      const member = { id: childId, ...mSnap.data() };
      const { patch, record } = make(member);
      tx.update(mRef, patch);
      tx.set(rRef, {
        ...record, childId, childName: member.name, status: 'approved',
        createdAt: serverTimestamp(), decidedAt: serverTimestamp(), decidedBy: uid,
      });
    });
  },

  async saveChore(fid, { id, ...data }) {
    if (id) await updateDoc(famRef(fid, 'chores', id), data);
    else await addDoc(famCol(fid, 'chores'), data);
  },
  deleteChore: (fid, id) => deleteDoc(famRef(fid, 'chores', id)),
  async reorderChores(fid, ids) {
    const b = writeBatch(D());
    ids.forEach((id, i) => b.update(famRef(fid, 'chores', id), { order: i }));
    await b.commit();
  },

  createRequest: (fid, data) => addDoc(famCol(fid, 'requests'), {
    ...data, status: initialStatus(data.type), createdAt: serverTimestamp(),
  }),
  cancelRequest: (fid, id) => deleteDoc(famRef(fid, 'requests', id)),

  async decide(fid, reqId, approve, reason = '') {
    const uid = A().currentUser.uid;
    const rRef = famRef(fid, 'requests', reqId);
    await runTransaction(D(), async (tx) => {
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists()) throw new Error('요청을 찾을 수 없어요.');
      const req = rSnap.data();
      if (req.status !== 'pending') throw new Error('이미 처리된 요청이에요.');
      const decided = { decidedAt: serverTimestamp(), decidedBy: uid };
      if (!approve) {
        tx.update(rRef, { ...decided, status: 'rejected', reason });
        return;
      }
      const mRef = famRef(fid, 'members', req.childId);
      const mSnap = await tx.get(mRef);
      const { balance, serviceRemaining, serviceUsed } = approvalEffect(req, mSnap.data());
      tx.update(mRef, { balance, serviceRemaining });
      tx.update(rRef, { ...decided, status: 'approved', balanceAfter: balance, serviceUsed });
      // 특별 미션은 한 번 승인되면 끝난다.
      if (req.choreKind === 'mission') {
        tx.update(famRef(fid, 'chores', req.choreId), { done: true, doneBy: req.childId, doneAt: serverTimestamp() });
      }
    });
  },
};
