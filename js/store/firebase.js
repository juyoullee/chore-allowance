// Firebase(로그인 + Firestore) 저장소. 체험용 store/demo.js와 같은 함수를 제공한다.
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });

const famRef = (fid, ...path) => doc(db, 'families', fid, ...path);
const famCol = (fid, name) => collection(db, 'families', fid, name);

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
    return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, name: u.displayName || '', email: u.email || '' } : null));
  },
  signInGoogle: () => signInWithPopup(auth, new GoogleAuthProvider()),
  signInEmail: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
  signUpEmail: (email, pw) => createUserWithEmailAndPassword(auth, email, pw),
  signOut: () => signOut(auth),

  watchUser: (uid, cb) => watchDoc(doc(db, 'users', uid), cb),
  watchFamily: (fid, cb) => watchDoc(famRef(fid), cb),
  watchMembers: (fid, cb) => watchList(famCol(fid, 'members'), cb),
  watchChores: (fid, cb) => watchList(query(famCol(fid, 'chores'), orderBy('order')), cb),
  watchRequests: (fid, cb) => watchList(query(famCol(fid, 'requests'), orderBy('createdAt', 'desc'), limit(500)), cb),

  async createFamily({ familyName, myName }) {
    const uid = auth.currentUser.uid;
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
    const uid = auth.currentUser.uid;
    const inv = await getDoc(doc(db, 'inviteCodes', code));
    if (!inv.exists()) throw new Error('초대 코드를 찾을 수 없어요. 다시 확인해 주세요.');
    const { familyId, role } = inv.data();
    await setDoc(famRef(familyId, 'members', uid), {
      name: myName, role, balance: 0, serviceRemaining: 0, joinCode: code, joinedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'users', uid), { familyId });
  },

  async regenerateCode(family, role) {
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
    const uid = auth.currentUser.uid;
    const mRef = famRef(fid, 'members', childId);
    const rRef = doc(famCol(fid, 'requests'));
    await runTransaction(db, async (tx) => {
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
    const b = writeBatch(db);
    ids.forEach((id, i) => b.update(famRef(fid, 'chores', id), { order: i }));
    await b.commit();
  },

  createRequest: (fid, data) => addDoc(famCol(fid, 'requests'), {
    ...data, status: initialStatus(data.type), createdAt: serverTimestamp(),
  }),
  cancelRequest: (fid, id) => deleteDoc(famRef(fid, 'requests', id)),

  async decide(fid, reqId, approve, reason = '') {
    const uid = auth.currentUser.uid;
    const rRef = famRef(fid, 'requests', reqId);
    await runTransaction(db, async (tx) => {
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
