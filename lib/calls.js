import { collection, doc, serverTimestamp } from 'firebase/firestore';

export const CALL_STATUS = {
  RINGING: 'ringing',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  ENDED: 'ended',
  MISSED: 'missed',
};

export const CALL_PHASE = {
  IDLE: 'idle',
  OUTGOING: 'outgoing',
  INCOMING: 'incoming',
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  ENDED: 'ended',
};

export function createCallId(fromUser, toUser) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${fromUser}_${toUser}_${Date.now()}_${rand}`;
}

export function callDocRef(db, callId) {
  return doc(db, 'calls', callId);
}

export function callerCandidatesRef(db, callId) {
  return collection(db, 'calls', callId, 'callerCandidates');
}

export function receiverCandidatesRef(db, callId) {
  return collection(db, 'calls', callId, 'receiverCandidates');
}

export function buildInitialCallDoc({ callId, from, to, callType = 'voice' }) {
  return {
    callId,
    from,
    to,
    callType,
    status: CALL_STATUS.RINGING,
    createdAt: serverTimestamp(),
    startedAt: Date.now(),
    acceptedAt: null,
    endedAt: null,
    endedBy: null,
  };
}
