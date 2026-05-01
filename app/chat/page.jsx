'use client';

import { useEffect, useState, useRef, useMemo, Suspense } from 'react'; // Added Suspense
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation'; // 🔥 NEW IMPORTS
import {
  Send, LogOut, MessageSquare, Search,
  ChevronLeft, X, Radio, ImagePlus, Phone, Video, Mic, MicOff, VideoOff, PhoneOff, RefreshCcw
} from 'lucide-react';

// 🔥 Firestore imports
import { db } from '../../lib/firebaseClient'; 
import {
  collection, query, where, orderBy, limitToLast, onSnapshot,
  doc, setDoc, getDoc, addDoc, updateDoc, limit, runTransaction
} from 'firebase/firestore';
import {
  CALL_PHASE,
  CALL_STATUS,
  buildInitialCallDoc,
  callDocRef,
  callerCandidatesRef,
  createCallId,
  receiverCandidatesRef,
} from '../../lib/calls';

// --- UTILITIES ---

const getInitials = (name) => (name ? name.substring(0, 2).toUpperCase() : '?');

const formatTime = (ts) => {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const getDateLabel = (ts) => {
  const date = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

// --- COMPONENTS ---

const Avatar = ({ name, size = "md", className = "", src }) => {
  const sizeClasses = {
    sm: "w-8 h-8 text-[10px]",
    md: "w-10 h-10 text-xs",
  };
  
  const colors = [
    'bg-blue-100 text-blue-600',
    'bg-indigo-100 text-indigo-600',
    'bg-emerald-100 text-emerald-600',
    'bg-rose-100 text-rose-600',
    'bg-amber-100 text-amber-600',
    'bg-violet-100 text-violet-600',
  ];
  const colorIndex = name ? name.length % colors.length : 0;

  return (
    <div className={`${sizeClasses[size]} ${colors[colorIndex]} ${className} flex items-center justify-center rounded-full font-bold border-2 border-white shadow-sm shrink-0`}>
      {src ? (
        <img src={src} alt={name ? `${name} avatar` : 'User avatar'} className="h-full w-full rounded-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </div>
  );
};

function parseReplyBody(rawBody) {
  if (typeof rawBody !== 'string') return { isReply: false, mainText: '' };
  if (rawBody.startsWith('↪ ') && rawBody.includes('\n\n')) {
    const [header, main] = rawBody.split('\n\n', 2);
    const headerStripped = header.slice(2).trim();
    const idx = headerStripped.indexOf(':');
    return {
      isReply: true,
      replyAuthor: idx !== -1 ? headerStripped.slice(0, idx).trim() : '',
      replySnippet: idx !== -1 ? headerStripped.slice(idx + 1).trim() : headerStripped,
      mainText: main,
    };
  }
  return { isReply: false, mainText: rawBody };
}

function getReplySnippet(msg, decrypted) {
  if (!msg) return '';
  const text = decrypted?.text || msg.body || '';
  const image = decrypted?.image || msg.image;
  if (msg.type === 'image' || image?.url || image?.dataUrl) {
    return text ? text : '[Image]';
  }
  const parsed = parseReplyBody(text);
  return parsed.mainText || text || '';
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const bytesToBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const formatLastSeen = (ts) => {
  if (!ts) return 'Last seen unknown';
  const diffMs = Date.now() - ts;
  if (diffMs < 60 * 1000) return 'Last seen just now';
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const date = new Date(ts);
  return `Last seen ${date.toLocaleDateString()}`;
};

const getPreviewText = (payload, fallbackText) => {
  const text = payload?.text || fallbackText || '';
  if (payload?.image) {
    return text ? `Image: ${text}` : '[Image]';
  }
  return text || '';
};

const initialCallUiState = {
  phase: CALL_PHASE.IDLE,
  callId: null,
  direction: null,
  callType: null,
  peer: null,
  error: '',
  startedAt: null,
  endedAt: null,
};
const RING_TIMEOUT_MS = 45 * 1000;

// --- MAIN CHAT CONTENT ---

function ChatContent() {
  // 🔥 Navigation Hooks
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Auth State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState('login'); 
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // App State
  const [conversations, setConversations] = useState([]);
  // REMOVED useState for activeChat, getting it from URL instead:
  const activeChat = searchParams.get('chat'); 
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [status, setStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [imageDraft, setImageDraft] = useState(null);
  const [cryptoReady, setCryptoReady] = useState(false);
  const [publicKeyJwk, setPublicKeyJwk] = useState(null);
  const [decryptedById, setDecryptedById] = useState({});
  const [activeChatLastSeen, setActiveChatLastSeen] = useState(null);
  const [userProfiles, setUserProfiles] = useState({});
  const [reactionPickerId, setReactionPickerId] = useState(null);
  const [recipientKeyMissing, setRecipientKeyMissing] = useState(false);
  const [callUi, setCallUi] = useState(initialCallUiState);
  const [localMediaStream, setLocalMediaStream] = useState(null);
  const [remoteMediaStream, setRemoteMediaStream] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [cameraFacingMode, setCameraFacingMode] = useState('user');
  const [callLogs, setCallLogs] = useState([]);

  // Refs
  const scrollRef = useRef(null);
  const privateKeyRef = useRef(null);
  const publicKeyCacheRef = useRef(new Map());
  const decryptedRef = useRef({});
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const callUnsubRef = useRef(null);
  const candidateUnsubRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callFinalizeRef = useRef({ callId: null, saved: false });
  const ringTimeoutRef = useRef(null);
  const tabIdRef = useRef(null);
  const networkStateRef = useRef('new');

  const rtcConfig = useMemo(() => ({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  }), []);

  // 🔥 Helper to set URL param instead of local state
  const handleSetActiveChat = (name) => {
    const params = new URLSearchParams(searchParams);
    if (name) {
      params.set('chat', name);
    } else {
      params.delete('chat');
    }
    // Update URL without refreshing page
    router.push(`${pathname}?${params.toString()}`);
  };

  // 1. Check LocalStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && !tabIdRef.current) {
      tabIdRef.current = window.sessionStorage.getItem('notifierWebTabId') || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      window.sessionStorage.setItem('notifierWebTabId', tabIdRef.current);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('notifierWebAuth');
      if (raw) {
        const { username: u, password: p } = JSON.parse(raw);
        if (u && p) {
          setUsername(u);
          setPassword(p);
          setIsLoggedIn(true);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    decryptedRef.current = decryptedById;
  }, [decryptedById]);

  // 1.5 Setup E2E keys
  useEffect(() => {
    if (!isLoggedIn || !username || typeof window === 'undefined') return;
    let cancelled = false;

    (async () => {
      try {
        const storageKey = `notifierWebKeys_${username}`;
        const saved = window.localStorage.getItem(storageKey);
        let privateJwk;
        let publicJwk;

        if (saved) {
          const parsed = JSON.parse(saved);
          privateJwk = parsed?.privateJwk;
          publicJwk = parsed?.publicJwk;
        }

        if (!privateJwk || !publicJwk) {
          const keyPair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveKey']
          );
          privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
          publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
          window.localStorage.setItem(storageKey, JSON.stringify({ privateJwk, publicJwk }));
        }

        const privateKey = await crypto.subtle.importKey(
          'jwk',
          privateJwk,
          { name: 'ECDH', namedCurve: 'P-256' },
          true,
          ['deriveKey']
        );
        if (cancelled) return;
        privateKeyRef.current = privateKey;
        setPublicKeyJwk(publicJwk);
        setCryptoReady(true);

        await setDoc(
          doc(db, 'users', username),
          { publicKeyJwk: publicJwk, lastSeen: Date.now() },
          { merge: true }
        );
      } catch (err) {
        console.error('crypto setup failed', err);
        setStatus('Encryption setup failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, username]);

  // 2. Load Conversations
  useEffect(() => {
    if (!isLoggedIn) return;
    (async () => {
      try {
        const params = new URLSearchParams({ username, password });
        const res = await fetch(`/api/conversations?${params.toString()}`);
        const data = await res.json();
        if (data.ok) setConversations(data.conversations || []);
      } catch (e) { console.error(e); }
    })();
  }, [isLoggedIn, username, password]);

  // 3. Realtime Messages
  useEffect(() => {
    if (!isLoggedIn || !activeChat || !username) return;

    setMessages([]); 
    setDecryptedById({});
    decryptedRef.current = {};
    const participantsKey = [username, activeChat].sort().join('_');
    
    const q = query(
      collection(db, 'messages'),
      where('participants', '==', participantsKey),
      orderBy('ts', 'asc'),
      limitToLast(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(docs);
    }, (err) => console.error(err));

    return () => unsubscribe();
  }, [isLoggedIn, username, activeChat]);

  // 3.1 Last seen updates for current user
  useEffect(() => {
    if (!isLoggedIn || !username) return;
    const userRef = doc(db, 'users', username);

    const updateLastSeen = async () => {
      try {
        await setDoc(userRef, { lastSeen: Date.now() }, { merge: true });
      } catch (err) {
        console.error('last seen update failed', err);
      }
    };

    updateLastSeen();
    const intervalId = setInterval(updateLastSeen, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateLastSeen();
      }
    };

    window.addEventListener('beforeunload', updateLastSeen);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('beforeunload', updateLastSeen);
      document.removeEventListener('visibilitychange', handleVisibility);
      updateLastSeen();
    };
  }, [isLoggedIn, username]);

  useEffect(() => {
    if (!callUi.callId) return;
    if (callUi.phase === CALL_PHASE.IDLE || callUi.phase === CALL_PHASE.ENDED) return;
    const handleBeforeUnload = () => {
      updateDoc(callDocRef(db, callUi.callId), {
        status: CALL_STATUS.ENDED,
        endedAt: Date.now(),
        endedBy: username,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [callUi.callId, callUi.phase, username]);

  // 3.2 Track active chat last seen
  useEffect(() => {
    if (!activeChat) {
      setActiveChatLastSeen(null);
      setRecipientKeyMissing(false);
      return;
    }

    const unsub = onSnapshot(doc(db, 'users', activeChat), (snap) => {
      const data = snap.data();
      setActiveChatLastSeen(data?.lastSeen || null);
      if (data?.avatarUrl) {
        setUserProfiles((prev) => ({
          ...prev,
          [activeChat]: { ...(prev[activeChat] || {}), avatarUrl: data.avatarUrl },
        }));
      }
    });

    return () => unsub();
  }, [activeChat]);

  useEffect(() => {
    if (!conversations.length && !activeChat && !username) return;
    let cancelled = false;
    const names = new Set([username, activeChat, ...conversations.map((c) => c.other)].filter(Boolean));
    const fetchMissing = async () => {
      const updates = {};
      for (const name of names) {
        if (userProfiles[name]) continue;
        try {
          const snap = await getDoc(doc(db, 'users', name));
          const data = snap.data();
          if (data?.avatarUrl) {
            updates[name] = { avatarUrl: data.avatarUrl };
          }
        } catch (err) {
          console.error('profile fetch failed', err);
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setUserProfiles((prev) => ({ ...prev, ...updates }));
      }
    };

    fetchMissing();

    return () => {
      cancelled = true;
    };
  }, [conversations, activeChat, username, userProfiles]);

  // 4. Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, replyTo]);

  useEffect(() => {
    return () => {
      cleanupCallSession();
    };
  }, []);

  useEffect(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = localMediaStream || null;
  }, [localMediaStream]);

  useEffect(() => {
    if (!remoteVideoRef.current) return;
    remoteVideoRef.current.srcObject = remoteMediaStream || null;
  }, [remoteMediaStream]);

  useEffect(() => {
    if (!isLoggedIn || !username) return;

    const q = query(
      collection(db, 'calls'),
      where('to', '==', username),
      where('status', '==', CALL_STATUS.RINGING),
      orderBy('startedAt', 'desc'),
      limitToLast(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      const hit = snap.docs[0];
      if (!hit) {
        setIncomingCall(null);
        return;
      }
      const data = hit.data();
      const tabId = tabIdRef.current;
      if (data?.handledBy && tabId && data.handledBy !== tabId) {
        setIncomingCall(null);
        return;
      }
      if (callUi.phase === CALL_PHASE.IDLE || callUi.phase === CALL_PHASE.ENDED) {
        setIncomingCall({ id: hit.id, ...data });
      }
    });

    return () => unsub();
  }, [isLoggedIn, username, callUi.phase]);

  useEffect(() => {
    if (!incomingCall?.callId) return;
    const startedAt = incomingCall.startedAt || Date.now();
    const elapsed = Date.now() - startedAt;
    const waitMs = Math.max(0, RING_TIMEOUT_MS - elapsed);
    const timer = setTimeout(async () => {
      try {
        const callRef = callDocRef(db, incomingCall.callId);
        await updateDoc(callRef, {
          status: CALL_STATUS.MISSED,
          endedAt: Date.now(),
        });
        await saveCallLog({
          callId: incomingCall.callId,
          callType: incomingCall.callType || 'voice',
          direction: 'incoming',
          peer: incomingCall.from,
          status: CALL_STATUS.MISSED,
          endReason: 'ring_timeout',
          networkState: networkStateRef.current,
          startedAt,
          endedAt: Date.now(),
        });
      } catch (err) {
        console.error('incoming ring timeout failed', err);
      } finally {
        setIncomingCall(null);
      }
    }, waitMs);
    return () => clearTimeout(timer);
  }, [incomingCall?.callId]);

  useEffect(() => {
    if (!isLoggedIn || !username) return;
    if (callUi.phase !== CALL_PHASE.IDLE && callUi.phase !== CALL_PHASE.ENDED) return;

    const qFrom = query(
      collection(db, 'calls'),
      where('from', '==', username),
      where('status', '==', CALL_STATUS.ACCEPTED),
      orderBy('startedAt', 'desc'),
      limitToLast(1)
    );
    const qTo = query(
      collection(db, 'calls'),
      where('to', '==', username),
      where('status', '==', CALL_STATUS.ACCEPTED),
      orderBy('startedAt', 'desc'),
      limitToLast(1)
    );

    const applyRecovered = (snap, direction) => {
      const hit = snap.docs[0];
      if (!hit) return;
      const data = hit.data();
      setCallUi((prev) => ({
        ...prev,
        phase: CALL_PHASE.ACTIVE,
        callId: data.callId || hit.id,
        callType: data.callType || 'voice',
        direction,
        peer: direction === 'outgoing' ? data.to : data.from,
        startedAt: data.startedAt || Date.now(),
      }));
    };

    const unsubFrom = onSnapshot(qFrom, (snap) => applyRecovered(snap, 'outgoing'));
    const unsubTo = onSnapshot(qTo, (snap) => applyRecovered(snap, 'incoming'));
    return () => {
      unsubFrom();
      unsubTo();
    };
  }, [isLoggedIn, username, callUi.phase]);

  useEffect(() => {
    if (!isLoggedIn || !username) return;
    const q = query(
      collection(db, 'callLogs'),
      where('owner', '==', username),
      orderBy('endedAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCallLogs(rows);
    }, (err) => console.error('call log listen failed', err));
    return () => unsub();
  }, [isLoggedIn, username]);

  const getUserPublicKeyJwk = async (name) => {
    const cache = publicKeyCacheRef.current;
    if (cache.has(name)) return cache.get(name);
    const snap = await getDoc(doc(db, 'users', name));
    const data = snap.data();
    if (!data?.publicKeyJwk) {
      setRecipientKeyMissing(true);
      throw new Error('Recipient has no public key');
    }
    cache.set(name, data.publicKeyJwk);
    setRecipientKeyMissing(false);
    return data.publicKeyJwk;
  };

  const importPublicKey = async (jwk) => (
    crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  );

  const clearCallRealtimeListeners = () => {
    if (callUnsubRef.current) {
      callUnsubRef.current();
      callUnsubRef.current = null;
    }
    if (candidateUnsubRef.current.length) {
      candidateUnsubRef.current.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
      candidateUnsubRef.current = [];
    }
  };

  const clearRingTimeout = () => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  };

  const cleanupCallMedia = () => {
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch {}
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      remoteStreamRef.current = null;
    }

    setLocalMediaStream(null);
    setRemoteMediaStream(null);
  };

  const cleanupCallSession = () => {
    clearRingTimeout();
    clearCallRealtimeListeners();
    cleanupCallMedia();
    networkStateRef.current = 'closed';
  };

  const ensureLocalMedia = async (callType) => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video' ? { facingMode: cameraFacingMode } : false,
    });
    localStreamRef.current = stream;
    setLocalMediaStream(stream);
    setIsMicMuted(false);
    setIsCameraEnabled(callType === 'video');
    return stream;
  };

  const saveCallLog = async ({
    callId, callType, direction, peer, status, startedAt, endedAt, endReason, networkState,
  }) => {
    if (!username || !callId) return;
    if (callFinalizeRef.current.callId === callId && callFinalizeRef.current.saved) return;
    const durationSec = startedAt && endedAt ? Math.max(0, Math.floor((endedAt - startedAt) / 1000)) : 0;
    try {
      await setDoc(doc(db, 'callLogs', callId), {
        callId,
        owner: username,
        peer: peer || null,
        callType: callType || 'voice',
        direction: direction || 'outgoing',
        status: status || 'ended',
        endReason: endReason || status || 'ended',
        networkState: networkState || networkStateRef.current || 'unknown',
        startedAt: startedAt || Date.now(),
        endedAt: endedAt || Date.now(),
        durationSec,
        updatedAt: Date.now(),
      }, { merge: true });
      callFinalizeRef.current = { callId, saved: true };
    } catch (err) {
      console.error('save call log failed', err);
    }
  };

  const setupPeerConnection = async ({ callId, role, callType }) => {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;
    networkStateRef.current = pc.connectionState || 'new';

    const local = await ensureLocalMedia(callType);
    local.getTracks().forEach((track) => pc.addTrack(track, local));

    const remote = new MediaStream();
    remoteStreamRef.current = remote;
    setRemoteMediaStream(remote);

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remote.addTrack(track));
      setRemoteMediaStream(new MediaStream(remote.getTracks()));
    };

    pc.onicecandidate = async (event) => {
      if (!event.candidate) return;
      const targetRef = role === 'caller'
        ? callerCandidatesRef(db, callId)
        : receiverCandidatesRef(db, callId);
      try {
        await addDoc(targetRef, event.candidate.toJSON());
      } catch (err) {
        console.error('candidate write failed', err);
      }
    };

    pc.onconnectionstatechange = () => {
      networkStateRef.current = pc.connectionState || networkStateRef.current || 'unknown';
    };

    return pc;
  };

  const attachCallDocListener = (callId, handler) => {
    if (callUnsubRef.current) {
      callUnsubRef.current();
      callUnsubRef.current = null;
    }
    callUnsubRef.current = onSnapshot(doc(db, 'calls', callId), handler);
  };

  const claimCallOwnership = async (callId) => {
    const owner = tabIdRef.current || 'unknown_tab';
    const ref = callDocRef(db, callId);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() || {};
      if (data.handledBy && data.handledBy !== owner) {
        throw new Error('Call already handled in another tab');
      }
      tx.update(ref, { handledBy: owner, handledAt: Date.now() });
      return true;
    });
  };

  const endCurrentCall = async (endedBy = username) => {
    const endedAt = Date.now();
    const finalStatus = CALL_STATUS.ENDED;
    if (callUi.callId) {
      try {
        await updateDoc(callDocRef(db, callUi.callId), {
          status: finalStatus,
          endedBy,
          endedAt,
        });
      } catch (err) {
        console.error('end call update failed', err);
      }
      await saveCallLog({
        callId: callUi.callId,
        callType: callUi.callType,
        direction: callUi.direction,
        peer: callUi.peer,
        status: finalStatus,
        endReason: endedBy === username ? 'local_hangup' : 'remote_end',
        networkState: networkStateRef.current,
        startedAt: callUi.startedAt,
        endedAt,
      });
    }
    cleanupCallSession();
    setCallUi({
      ...initialCallUiState,
      phase: CALL_PHASE.ENDED,
      endedAt: Date.now(),
    });
  };

  const startOutgoingCall = async (callType = 'voice') => {
    if (!activeChat || !username) return;
    if (callUi.phase !== CALL_PHASE.IDLE && callUi.phase !== CALL_PHASE.ENDED) return;
    setStatus('');
    cleanupCallSession();

    const callId = createCallId(username, activeChat);
    callFinalizeRef.current = { callId, saved: false };
    setCallUi({
      ...initialCallUiState,
      phase: CALL_PHASE.OUTGOING,
      callId,
      direction: 'outgoing',
      callType,
      peer: activeChat,
      startedAt: Date.now(),
    });

    try {
      const pc = await setupPeerConnection({ callId, role: 'caller', callType });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await setDoc(callDocRef(db, callId), {
        ...buildInitialCallDoc({ callId, from: username, to: activeChat, callType }),
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
        handledBy: tabIdRef.current || null,
        handledAt: Date.now(),
      });
      clearRingTimeout();
      ringTimeoutRef.current = setTimeout(async () => {
        try {
          await updateDoc(callDocRef(db, callId), {
            status: CALL_STATUS.MISSED,
            endedAt: Date.now(),
            endedBy: username,
          });
          await saveCallLog({
            callId,
            callType,
            direction: 'outgoing',
            peer: activeChat,
            status: CALL_STATUS.MISSED,
            endReason: 'ring_timeout',
            networkState: networkStateRef.current,
            startedAt: Date.now(),
            endedAt: Date.now(),
          });
        } catch (err) {
          console.error('ring timeout update failed', err);
        }
      }, RING_TIMEOUT_MS);

      attachCallDocListener(callId, async (snap) => {
        const data = snap.data();
        if (!data) return;

        if (data.answer?.sdp && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          clearRingTimeout();
          setCallUi((prev) => ({ ...prev, phase: CALL_PHASE.ACTIVE }));
        }

        if ([CALL_STATUS.REJECTED, CALL_STATUS.ENDED, CALL_STATUS.MISSED].includes(data.status)) {
          const endedAt = Date.now();
          saveCallLog({
            callId,
            callType,
            direction: 'outgoing',
            peer: activeChat,
            status: data.status,
            endReason: data.status === CALL_STATUS.REJECTED ? 'remote_rejected' : (data.status === CALL_STATUS.MISSED ? 'timeout' : 'remote_end'),
            networkState: networkStateRef.current,
            startedAt: callUi.startedAt || Date.now(),
            endedAt,
          });
          cleanupCallSession();
          setCallUi((prev) => ({ ...prev, phase: CALL_PHASE.ENDED, endedAt }));
        }
      });

      const receiverUnsub = onSnapshot(receiverCandidatesRef(db, callId), (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          try {
            await pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
          } catch (err) {
            console.error('add remote candidate failed', err);
          }
        });
      });
      candidateUnsubRef.current.push(receiverUnsub);

      const inviteRes = await fetch('/api/callInvite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          to: activeChat,
          callId,
          callType,
        }),
      });
      const inviteData = await inviteRes.json();
      if (!inviteRes.ok || !inviteData.ok) {
        throw new Error(inviteData?.error || 'Call invite failed');
      }

      setCallUi((prev) => ({ ...prev, phase: CALL_PHASE.CONNECTING }));
    } catch (err) {
      console.error('start call failed', err);
      setStatus(err?.message || 'Call start failed');
      cleanupCallSession();
      setCallUi({
        ...initialCallUiState,
        phase: CALL_PHASE.ENDED,
        error: err?.message || 'Call start failed',
        endedAt: Date.now(),
      });
    }
  };

  const rejectIncomingCall = async () => {
    if (!incomingCall?.callId) return;
    clearRingTimeout();
    const endedAt = Date.now();
    try {
      await updateDoc(callDocRef(db, incomingCall.callId), {
        status: CALL_STATUS.REJECTED,
        endedAt,
        endedBy: username,
      });
      await saveCallLog({
        callId: incomingCall.callId,
        callType: incomingCall.callType || 'voice',
        direction: 'incoming',
        peer: incomingCall.from,
        status: CALL_STATUS.REJECTED,
        endReason: 'local_reject',
        networkState: networkStateRef.current,
        startedAt: incomingCall.startedAt || Date.now(),
        endedAt,
      });
    } catch (err) {
      console.error('reject call failed', err);
    }
    setIncomingCall(null);
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall?.callId) return;
    const callId = incomingCall.callId;
    const callType = incomingCall.callType || 'voice';
    callFinalizeRef.current = { callId, saved: false };

    setCallUi({
      ...initialCallUiState,
      phase: CALL_PHASE.CONNECTING,
      callId,
      direction: 'incoming',
      callType,
      peer: incomingCall.from,
      startedAt: Date.now(),
    });

    try {
      await claimCallOwnership(callId);
      cleanupCallSession();
      const pc = await setupPeerConnection({ callId, role: 'receiver', callType });
      if (!incomingCall.offer?.sdp) throw new Error('Missing offer');

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await updateDoc(callDocRef(db, callId), {
        answer: { type: answer.type, sdp: answer.sdp },
        status: CALL_STATUS.ACCEPTED,
        acceptedAt: Date.now(),
      });
      clearRingTimeout();

      attachCallDocListener(callId, (snap) => {
        const data = snap.data();
        if (!data) return;
        if ([CALL_STATUS.ENDED, CALL_STATUS.MISSED].includes(data.status)) {
          const endedAt = Date.now();
          saveCallLog({
            callId,
            callType,
            direction: 'incoming',
            peer: incomingCall.from,
            status: data.status,
            endReason: data.status === CALL_STATUS.MISSED ? 'timeout' : 'remote_end',
            networkState: networkStateRef.current,
            startedAt: callUi.startedAt || Date.now(),
            endedAt,
          });
          cleanupCallSession();
          setCallUi((prev) => ({ ...prev, phase: CALL_PHASE.ENDED, endedAt }));
        } else if (data.status === CALL_STATUS.ACCEPTED) {
          setCallUi((prev) => ({ ...prev, phase: CALL_PHASE.ACTIVE }));
        }
      });

      const callerUnsub = onSnapshot(callerCandidatesRef(db, callId), (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          try {
            await pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
          } catch (err) {
            console.error('add caller candidate failed', err);
          }
        });
      });
      candidateUnsubRef.current.push(callerUnsub);
      setIncomingCall(null);
    } catch (err) {
      console.error('accept call failed', err);
      setStatus(err?.message || 'Accept call failed');
      cleanupCallSession();
      setCallUi({
        ...initialCallUiState,
        phase: CALL_PHASE.ENDED,
        error: err?.message || 'Accept call failed',
        endedAt: Date.now(),
      });
    }
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !isMicMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMicMuted(nextMuted);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (!videoTracks.length) return;
    const nextEnabled = !isCameraEnabled;
    videoTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setIsCameraEnabled(nextEnabled);
  };

  const switchCamera = async () => {
    if (callUi.callType !== 'video') return;
    const pc = peerConnectionRef.current;
    const currentStream = localStreamRef.current;
    if (!pc || !currentStream) return;

    const nextMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    try {
      const switched = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: nextMode },
      });
      const newVideoTrack = switched.getVideoTracks()[0];
      if (!newVideoTrack) return;

      const oldVideoTrack = currentStream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }
      if (oldVideoTrack) {
        currentStream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      currentStream.addTrack(newVideoTrack);
      setLocalMediaStream(new MediaStream(currentStream.getTracks()));
      localStreamRef.current = currentStream;
      setCameraFacingMode(nextMode);
      setIsCameraEnabled(true);
    } catch (err) {
      console.error('switch camera failed', err);
      setStatus('Camera switch not available on this device/browser');
    }
  };

  const encryptPayloadFor = async (recipient, payload) => {
    if (!privateKeyRef.current || !publicKeyJwk) {
      throw new Error('Encryption not ready');
    }
    const recipientJwk = await getUserPublicKeyJwk(recipient);
    const recipientKey = await importPublicKey(recipientJwk);
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: recipientKey },
      privateKeyRef.current,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = textEncoder.encode(JSON.stringify(payload));
    const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
    return {
      ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
      iv: bytesToBase64(iv),
      senderPubKeyJwk: JSON.stringify(publicKeyJwk),
    };
  };

  const decryptPayload = async (msg) => {
    if (!privateKeyRef.current || !msg?.encrypted) return null;
    const encrypted = msg.encrypted;
    if (!encrypted.ciphertext || !encrypted.iv) return null;

    let publicJwk;
    if (msg.from === username) {
      publicJwk = await getUserPublicKeyJwk(msg.to);
    } else {
      publicJwk = JSON.parse(encrypted.senderPubKeyJwk || '{}');
    }
    if (!publicJwk || !publicJwk.kty) return null;

    const senderKey = await importPublicKey(publicJwk);
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: senderKey },
      privateKeyRef.current,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const iv = base64ToBytes(encrypted.iv);
    const cipherBytes = base64ToBytes(encrypted.ciphertext);
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipherBytes);
    const decoded = textDecoder.decode(plainBuffer);
    return JSON.parse(decoded);
  };

  useEffect(() => {
    if (!cryptoReady || !messages.length) return;
    let cancelled = false;

    const decryptMissing = async () => {
      const pending = messages.filter((msg) => msg.encrypted && !decryptedRef.current[msg.id]);
      if (!pending.length) return;
      const results = await Promise.all(
        pending.map(async (msg) => {
          try {
            const payload = await decryptPayload(msg);
            return payload ? { id: msg.id, payload } : null;
          } catch (err) {
            console.error('decrypt failed', err);
            return null;
          }
        })
      );
      if (cancelled) return;
      setDecryptedById((prev) => {
        const next = { ...prev };
        results.forEach((entry) => {
          if (entry) next[entry.id] = entry.payload;
        });
        return next;
      });
    };

    decryptMissing();

    return () => {
      cancelled = true;
    };
  }, [cryptoReady, messages, username, activeChat]);

  useEffect(() => {
    if (!activeChat || !messages.length) return;
    const lastMsg = messages[messages.length - 1];
    const payload = lastMsg.encrypted ? decryptedById[lastMsg.id] : null;
    const preview = lastMsg.encrypted
      ? (payload ? getPreviewText(payload, '') : '[Encrypted]')
      : getPreviewText(null, lastMsg.body || '');
    const lastTs = lastMsg.ts || Date.now();

    setConversations((prev) => {
      const existing = prev.find((c) => c.other === activeChat);
      if (!existing) {
        return [{ other: activeChat, lastBody: preview, lastTs }, ...prev];
      }
      return prev.map((c) => (
        c.other === activeChat ? { ...c, lastBody: preview, lastTs } : c
      ));
    });
  }, [messages, decryptedById, activeChat]);

  // --- HANDLERS ---

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!username || !password) return setStatus('Please fill in all fields');
    setLoadingAuth(true); setStatus('');
    try {
      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error || 'Authentication failed');
      } else {
        setIsLoggedIn(true);
        if (rememberMe) {
          window.localStorage.setItem('notifierWebAuth', JSON.stringify({ username, password }));
        }
      }
    } catch (err) { setStatus('Network error'); }
    finally { setLoadingAuth(false); }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    handleSetActiveChat(null); // Clear the URL param
    window.localStorage.removeItem('notifierWebAuth');
    setCryptoReady(false);
    setPublicKeyJwk(null);
    privateKeyRef.current = null;
    publicKeyCacheRef.current = new Map();
    setDecryptedById({});
    setActiveChatLastSeen(null);
  };

  const handleSend = async () => {
    if (!activeChat || (!inputText.trim() && !imageDraft)) return;
    if (!cryptoReady) {
      setStatus('Encryption not ready');
      return;
    }
    setStatus('');
    
    const rawText = inputText.trim();
    let body = rawText;

    if (replyTo) {
      const replyPayload = decryptedById[replyTo.id];
      const replySnippet = getReplySnippet(replyTo, replyPayload);
      const cleanSnippet = replySnippet.replace(/\s+/g, ' ').slice(0, 60);
      body = `↪ ${replyTo.from}: ${cleanSnippet}\n\n${rawText}`;
    }

    const payload = {
      text: body,
      image: imageDraft ? { url: imageDraft.url, width: imageDraft.width, height: imageDraft.height } : null,
    };

    const tempId = 'local-' + Date.now();
    let encrypted;
    try {
      encrypted = await encryptPayloadFor(activeChat, payload);
    } catch (err) {
      console.error(err);
      setStatus('Encryption failed');
      return;
    }
    const newMsg = {
      id: tempId,
      from: username,
      to: activeChat,
      body: '',
      ts: Date.now(),
      type: 'encrypted',
      encrypted,
    };
    setMessages(prev => [...prev, newMsg]);
    setDecryptedById((prev) => ({ ...prev, [tempId]: payload }));
    setConversations((prev) => {
      const preview = getPreviewText(payload, '');
      const lastTs = newMsg.ts;
      const existing = prev.find((c) => c.other === activeChat);
      if (!existing) {
        return [{ other: activeChat, lastBody: preview, lastTs }, ...prev];
      }
      return prev.map((c) => (
        c.other === activeChat ? { ...c, lastBody: preview, lastTs } : c
      ));
    });
    setInputText('');
    setReplyTo(null);
    setImageDraft(null);

    try {
      await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          to: activeChat,
          body: '',
          encrypted,
        }),
      });
    } catch (e) { console.error(e); }
  };

  const dataUrlToBlob = (dataUrl) => {
    const [header, data] = dataUrl.split(',', 2);
    const match = /data:(.*?);base64/.exec(header || '');
    const contentType = match ? match[1] : 'image/jpeg';
    const binary = atob(data || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: contentType });
  };

  const compressImageFile = async (file, maxSize, quality) => {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });

    let { width, height } = img;
    if (width > maxSize || height > maxSize) {
      const ratio = Math.min(maxSize / width, maxSize / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Image processing failed');
    }
    ctx.drawImage(img, 0, 0, width, height);

    const compressed = canvas.toDataURL('image/jpeg', quality);
    return { compressed, width, height };
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('Please select an image file');
      return;
    }

    try {
      const { compressed, width, height } = await compressImageFile(file, 1280, 0.7);
      if (compressed.length > 900000) {
        setStatus('Image is too large after compression');
        return;
      }

      setStatus('Uploading image...');
      const blob = dataUrlToBlob(compressed);
      const uploadForm = new FormData();
      uploadForm.append('file', blob, 'upload.jpg');
      uploadForm.append('folder', 'chat-images');

      const res = await fetch('/api/upload', { method: 'POST', body: uploadForm });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error || 'Upload failed');
      }
      setImageDraft({
        url: data.url,
        previewUrl: compressed,
        width: data.width || width,
        height: data.height || height,
      });
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus('Image upload failed');
    }
  };

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('Please select an image file');
      return;
    }

    try {
      const { compressed, width, height } = await compressImageFile(file, 512, 0.8);
      if (compressed.length > 400000) {
        setStatus('Avatar is too large after compression');
        return;
      }

      setStatus('Uploading avatar...');
      const blob = dataUrlToBlob(compressed);
      const uploadForm = new FormData();
      uploadForm.append('file', blob, 'avatar.jpg');
      uploadForm.append('folder', 'avatars');
      uploadForm.append('publicId', `avatar_${username}`);
      uploadForm.append('overwrite', 'true');

      const res = await fetch('/api/upload', { method: 'POST', body: uploadForm });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error || 'Upload failed');
      }

      await setDoc(
        doc(db, 'users', username),
        { avatarUrl: data.url, avatarUpdatedAt: Date.now() },
        { merge: true }
      );

      setUserProfiles((prev) => ({
        ...prev,
        [username]: { ...(prev[username] || {}), avatarUrl: data.url },
      }));
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus('Avatar upload failed');
    }
  };

  const toggleReactionLocal = (messageId, emoji, actor) => {
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== messageId) return msg;
      const reactions = { ...(msg.reactions || {}) };
      const current = { ...((reactions[emoji] || {})) };
      if (current[actor]) {
        delete current[actor];
      } else {
        current[actor] = true;
      }
      if (Object.keys(current).length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = current;
      }
      return { ...msg, reactions };
    }));
  };

  const handleReact = async (messageId, emoji) => {
    if (!username) return;
    toggleReactionLocal(messageId, emoji, username);
    try {
      await fetch('/api/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, messageId, emoji }),
      });
    } catch (err) {
      console.error('react failed', err);
    }
  };

  const startLongPress = (messageId) => {
    clearTimeout(longPressTimerRef.current);
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setReactionPickerId(messageId);
    }, 500);
  };

  const endLongPress = () => {
    clearTimeout(longPressTimerRef.current);
  };

  const groupedMessages = useMemo(() => {
    const groups = [];
    let lastDate = null;

    messages.forEach((msg, index) => {
      const dateLabel = getDateLabel(msg.ts);
      if (dateLabel !== lastDate) {
        groups.push({ type: 'date', label: dateLabel, id: `date-${dateLabel}-${index}` });
        lastDate = dateLabel;
      }
      const isMe = msg.from === username;
      const nextMsg = messages[index + 1];
      const isLastInSequence = !nextMsg || nextMsg.from !== msg.from || (getDateLabel(nextMsg.ts) !== dateLabel);
      groups.push({ type: 'message', data: msg, isMe, isLastInSequence, id: msg.id });
    });
    return groups;
  }, [messages, username]);

  const filteredConversations = conversations.filter(c => 
    c.other.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const isCallOngoing = [CALL_PHASE.OUTGOING, CALL_PHASE.INCOMING, CALL_PHASE.CONNECTING, CALL_PHASE.ACTIVE].includes(callUi.phase);
  const callPeerName = callUi.peer || (callUi.direction === 'incoming' ? incomingCall?.from : activeChat);

  // --- LOGIN UI ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-50 p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#e0e7ff_1px,transparent_1px)] [background-size:20px_20px] opacity-60"></div>
        <div className="w-full max-w-sm bg-white/90 backdrop-blur rounded-3xl shadow-2xl border border-white z-10 p-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-indigo-300 mb-4">
              <MessageSquare className="text-white" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900">Welcome Back</h1>
            <p className="text-zinc-500 text-sm">Sign in to start chatting</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
             <input 
               value={username} onChange={e => setUsername(e.target.value)}
               className="w-full px-4 py-3 rounded-xl bg-zinc-100 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition text-base md:text-sm"
               placeholder="Username"
             />
             <input 
               type="password"
               value={password} onChange={e => setPassword(e.target.value)}
               className="w-full px-4 py-3 rounded-xl bg-zinc-100 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition text-base md:text-sm"
               placeholder="Password"
             />
             <button disabled={loadingAuth} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 transition">
               {loadingAuth ? 'Loading...' : (authMode === 'login' ? 'Sign In' : 'Create Account')}
             </button>
             {status && <p className="text-red-500 text-xs text-center">{status}</p>}
          </form>
          <div className="mt-6 text-center">
             <button type="button" onClick={() => setAuthMode(m => m === 'login' ? 'register' : 'login')} className="text-xs text-zinc-500 hover:text-indigo-600">
                {authMode === 'login' ? "Need an account? Register" : "Have an account? Login"}
             </button>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN CHAT UI ---
  return (
    <div className="relative flex w-full h-[100dvh] bg-zinc-50 overflow-hidden font-sans">
      
      {/* SIDEBAR */}
      <aside className={`
        absolute inset-0 md:relative z-20
        flex flex-col bg-white border-r border-zinc-200 
        w-full md:w-80 lg:w-96
        transform transition-transform duration-300 ease-in-out
        ${activeChat ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}
      `}>
        {/* Sidebar Header */}
        <div className="h-16 px-4 border-b border-zinc-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar name={username} size="sm" src={userProfiles[username]?.avatarUrl} />
              <label className="absolute -bottom-1 -right-1 rounded-full bg-white p-0.5 shadow cursor-pointer">
                <input type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
                <ImagePlus size={12} className="text-zinc-500" />
              </label>
            </div>
            <div>
              <div className="font-bold text-zinc-800 text-sm">{username}</div>
              <div className="text-[10px] text-green-600 flex items-center gap-1">● Online</div>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition">
            <LogOut size={18} />
          </button>
        </div>

        {/* Search & Actions */}
        <div className="p-4 shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-zinc-400" size={16} />
            <input 
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-base md:text-sm focus:bg-white focus:border-indigo-400 outline-none transition"
            />
          </div>
          <Link href="/" className="flex items-center justify-center gap-2 w-full py-2 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-xl hover:bg-indigo-100 transition md:hidden">
            <Radio size={14} /> Go to Broadcast
          </Link>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-4">
          {filteredConversations.map(c => (
            <button
              key={c.other}
              onClick={() => handleSetActiveChat(c.other)}
              className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${activeChat === c.other ? 'bg-indigo-600 shadow-md shadow-indigo-200' : 'hover:bg-zinc-50 active:bg-zinc-100'}`}
            >
              <Avatar name={c.other} src={userProfiles[c.other]?.avatarUrl} className={activeChat === c.other ? 'bg-white text-indigo-700' : ''} />
              <div className="flex-1 text-left min-w-0">
                <div className={`text-sm font-semibold truncate ${activeChat === c.other ? 'text-white' : 'text-zinc-800'}`}>{c.other}</div>
                <div className={`text-xs truncate ${activeChat === c.other ? 'text-indigo-100' : 'text-zinc-500'}`}>{c.lastBody}</div>
              </div>
            </button>
          ))}
          {!!callLogs.length && (
            <div className="mt-3 pt-3 border-t border-zinc-200">
              <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Recent Calls</div>
              <div className="space-y-1">
                {callLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="px-2 py-2 rounded-lg bg-zinc-50 border border-zinc-200">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-zinc-700 truncate">{log.peer || 'Unknown'}</div>
                      <div className="text-[10px] text-zinc-500">{log.callType === 'video' ? 'Video' : 'Voice'}</div>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {log.direction} • {log.status} • {Math.floor((log.durationSec || 0) / 60)}m {(log.durationSec || 0) % 60}s
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* CHAT AREA */}
      <main className={`
        absolute inset-0 md:static z-30
        flex-1 flex flex-col bg-slate-50 w-full h-full
        transform transition-transform duration-300 ease-in-out
        ${activeChat ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        
        {/* Chat Header */}
        <header className="h-16 px-3 md:px-4 bg-white/90 backdrop-blur border-b border-zinc-200 flex items-center justify-between shrink-0 shadow-sm z-40">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleSetActiveChat(null)} 
              className="md:hidden p-2 -ml-2 text-zinc-600 hover:bg-slate-100 rounded-full active:scale-95 transition"
            >
              <ChevronLeft size={24} />
            </button>
            {activeChat ? (
              <div className="flex items-center gap-3">
                <Avatar name={activeChat} size="sm" src={userProfiles[activeChat]?.avatarUrl} />
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-zinc-800 text-sm truncate max-w-[150px] md:max-w-xs">{activeChat}</span>
                  <span className="text-[10px] text-zinc-500">{formatLastSeen(activeChatLastSeen)}</span>
                </div>
              </div>
            ) : <span className="text-zinc-400 text-sm hidden md:block">Select a chat</span>}
          </div>

          <div className="flex items-center gap-2">
             {activeChat && (
               <>
                 <button
                   onClick={() => startOutgoingCall('voice')}
                   disabled={isCallOngoing}
                   className="p-2 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition disabled:opacity-50"
                   title="Voice call"
                 >
                   <Phone size={14} />
                 </button>
                 <button
                   onClick={() => startOutgoingCall('video')}
                   disabled={isCallOngoing}
                   className="p-2 rounded-full bg-sky-50 text-sky-600 hover:bg-sky-100 transition disabled:opacity-50"
                   title="Video call"
                 >
                   <Video size={14} />
                 </button>
               </>
             )}
             <Link 
               href="/" 
               className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-semibold hover:bg-indigo-100 transition"
             >
               <Radio size={14} /> Broadcast
             </Link>
          </div>
        </header>

        {callUi.phase !== CALL_PHASE.IDLE && (
          <div className="px-3 md:px-4 py-2 border-b border-zinc-200 bg-amber-50 flex items-center justify-between gap-2 text-xs">
            <div className="text-amber-800">
              {callUi.callType === 'video' ? 'Video' : 'Voice'} call {callUi.phase}
              {callUi.direction === 'outgoing' && activeChat ? ` with ${activeChat}` : ''}
            </div>
            {callUi.phase !== CALL_PHASE.ENDED && (
              <button
                onClick={() => endCurrentCall(username)}
                className="px-3 py-1 rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 transition"
              >
                End
              </button>
            )}
          </div>
        )}

        {incomingCall && (
          <div className="px-3 md:px-4 py-2 border-b border-zinc-200 bg-emerald-50 flex items-center justify-between gap-2 text-xs">
            <div className="text-emerald-800">
              Incoming {incomingCall.callType === 'video' ? 'video' : 'voice'} call from {incomingCall.from}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={rejectIncomingCall}
                className="px-3 py-1 rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 transition"
              >
                Reject
              </button>
              <button
                onClick={acceptIncomingCall}
                className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition"
              >
                Accept
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 md:p-4 space-y-1 bg-[#f0f4f8]"
          style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        >
          {activeChat && groupedMessages.map((item) => {
            if (item.type === 'date') return (
              <div key={item.id} className="flex justify-center py-4">
                <span className="bg-zinc-200/80 px-3 py-1 rounded-full text-[10px] font-bold text-zinc-600">{item.label}</span>
              </div>
            );
            
            const { isMe, data, isLastInSequence } = item;
            const decrypted = decryptedById[item.id];
            const displayText = decrypted?.text || data.body || '';
            const imageUrl = decrypted?.image?.url || data?.image?.url || data?.image?.dataUrl;
            const isImageMessage = !!imageUrl;
            const { isReply, replyAuthor, replySnippet, mainText } = parseReplyBody(displayText);

            return (
              <div key={item.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
                <div className={`flex max-w-[85%] md:max-w-[70%] min-w-0 items-end gap-2`}>
                  
                  {!isMe && (
                    <div className="w-8 shrink-0">
                      {isLastInSequence && <Avatar name={data.from} size="sm" src={userProfiles[data.from]?.avatarUrl} className="w-8 h-8 text-[10px]" />}
                    </div>
                  )}

                  <div className={`flex flex-col min-w-0 ${isMe ? 'items-end' : 'items-start'}`}>
                    <div 
                      onClick={() => {
                        if (longPressTriggeredRef.current) {
                          longPressTriggeredRef.current = false;
                          return;
                        }
                        setReplyTo(data);
                        setReactionPickerId(null);
                      }}
                      onTouchStart={() => startLongPress(item.id)}
                      onTouchEnd={endLongPress}
                      onTouchCancel={endLongPress}
                      className={`
                        group relative px-3 py-2 md:px-4 text-sm shadow-sm cursor-pointer transition-transform active:scale-[0.98] min-w-0 max-w-full
                        whitespace-pre-wrap break-words
                        ${isMe 
                          ? `bg-indigo-500 text-white rounded-2xl ${isLastInSequence ? 'rounded-br-sm' : ''}` 
                          : `bg-white text-zinc-800 rounded-2xl ${isLastInSequence ? 'rounded-bl-sm' : ''}`
                        }
                      `}
                    >
                      {isReply && (
                        <div className={`mb-2 w-full max-w-full rounded-lg p-2 text-xs border-l-4 overflow-hidden ${isMe ? 'bg-black/20 border-indigo-200 text-indigo-50' : 'bg-zinc-100 border-indigo-500 text-zinc-600'}`}>
                          <div className="font-bold mb-0.5 opacity-90">{replyAuthor}</div>
                          <div className="opacity-80 break-words whitespace-normal">{replySnippet}</div>
                        </div>
                      )}
                      {imageUrl && (
                        <img
                          src={imageUrl}
                          alt="Shared image"
                          className="block max-h-64 w-auto rounded-lg border border-black/10 object-cover"
                        />
                      )}
                      {mainText && (
                        <div className={isImageMessage ? 'mt-2' : ''}>
                          {mainText}
                        </div>
                      )}
                      <div className={`mt-2 flex items-center gap-1 transition-opacity ${reactionPickerId === item.id ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {['👍', '❤️', '😂', '🔥'].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReact(item.id, emoji);
                              setReactionPickerId(null);
                            }}
                            className={`text-xs px-2 py-0.5 rounded-full border ${isMe ? 'border-white/30 text-white/90' : 'border-zinc-200 text-zinc-600'} hover:scale-105 transition`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div className={`text-[9px] mt-1 flex justify-end gap-1 ${isMe ? 'text-indigo-200' : 'text-zinc-400'}`}>
                        {formatTime(data.ts)} {isMe && '✓'}
                      </div>
                    </div>
                    {!!data.reactions && Object.keys(data.reactions).length > 0 && (
                      <div className={`mt-1 flex flex-wrap gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {Object.entries(data.reactions).map(([emoji, users]) => {
                          const count = Object.keys(users || {}).length;
                          const reacted = !!users?.[username];
                          return (
                            <button
                              key={emoji}
                              onClick={(e) => { e.stopPropagation(); handleReact(item.id, emoji); }}
                              className={`text-[10px] px-2 py-0.5 rounded-full border ${reacted ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-white border-zinc-200 text-zinc-600'} hover:scale-105 transition`}
                            >
                              {emoji} {count}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {isMe && (
                    <div className="w-8 shrink-0">
                      {isLastInSequence && <Avatar name={username} size="sm" src={userProfiles[username]?.avatarUrl} className="w-8 h-8 text-[10px]" />}
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        {activeChat && (
          <div className="bg-white px-2 py-2 md:px-4 md:py-3 border-t border-zinc-200 shrink-0 safe-area-bottom">
            {replyTo && (
              <div className="flex items-center justify-between bg-indigo-50 p-2 mb-2 rounded-lg border border-indigo-100 mx-1 md:mx-0">
                <div className="text-xs text-indigo-800 truncate px-2 border-l-2 border-indigo-500">
                  Replying to <span className="font-bold">{replyTo.from}</span>
                </div>
                <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-indigo-200 rounded-full text-indigo-600"><X size={14} /></button>
              </div>
            )}
            {recipientKeyMissing && (
              <div className="text-xs text-amber-600 mb-2 mx-1 md:mx-0">
                This user has not set up encryption yet. Ask them to open the app once.
              </div>
            )}
            {status && (
              <div className="text-xs text-red-500 mb-2 mx-1 md:mx-0">{status}</div>
            )}
            {imageDraft && (
              <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-xl p-2 mb-2 mx-1 md:mx-0">
                <img
                  src={imageDraft.previewUrl || imageDraft.url}
                  alt="Image preview"
                  className="h-12 w-12 rounded-lg object-cover border border-black/10"
                />
                <div className="text-xs text-zinc-600 flex-1">Image ready to send</div>
                <button
                  onClick={() => setImageDraft(null)}
                  className="p-1 rounded-full hover:bg-zinc-200 text-zinc-500"
                  aria-label="Remove image"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2 max-w-4xl mx-auto">
              <label className="p-3 rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition cursor-pointer">
                <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                <ImagePlus size={18} />
              </label>
              <input
                className="flex-1 py-3 px-4 rounded-full bg-zinc-100 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 border border-transparent outline-none transition text-base md:text-sm"
                placeholder="Type a message..."
                value={inputText} onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                disabled={recipientKeyMissing}
              />
              <button onClick={handleSend} disabled={recipientKeyMissing || !cryptoReady || (!inputText.trim() && !imageDraft)} className="p-3 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition disabled:opacity-50">
                <Send size={18} className={inputText.trim() ? "translate-x-0.5" : ""} />
              </button>
            </div>
          </div>
        )}
      </main>

      {isCallOngoing && (
        <div className="absolute inset-0 z-50 bg-zinc-950/95 text-white flex flex-col">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{callUi.callType === 'video' ? 'Video call' : 'Voice call'}</div>
              <div className="text-xs text-zinc-300">{callUi.phase} {callPeerName ? `with ${callPeerName}` : ''}</div>
            </div>
            <button
              onClick={() => endCurrentCall(username)}
              className="p-2 rounded-full bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
              title="End call"
            >
              <PhoneOff size={16} />
            </button>
          </div>

          <div className="flex-1 p-4 md:p-6 flex flex-col gap-4">
            {callUi.callType === 'video' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                <div className="rounded-2xl bg-black/60 border border-white/10 overflow-hidden relative min-h-[220px]">
                  <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
                  {!remoteMediaStream && (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-300 text-sm">
                      Waiting for remote video...
                    </div>
                  )}
                </div>
                <div className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden relative min-h-[220px]">
                  <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                  {!isCameraEnabled && (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-300 text-sm">
                      Camera off
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-white/10 mx-auto mb-3 flex items-center justify-center">
                    <Phone size={28} />
                  </div>
                  <div className="font-semibold">{callPeerName || 'In call'}</div>
                  <div className="text-xs text-zinc-300 mt-1">{callUi.phase}</div>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-white/10 flex items-center justify-center gap-3">
            <button
              onClick={toggleMute}
              className={`p-3 rounded-full transition ${isMicMuted ? 'bg-amber-500/25 text-amber-300' : 'bg-white/10 hover:bg-white/20 text-white'}`}
              title={isMicMuted ? 'Unmute' : 'Mute'}
            >
              {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            {callUi.callType === 'video' && (
              <button
                onClick={toggleCamera}
                className={`p-3 rounded-full transition ${isCameraEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-amber-500/25 text-amber-300'}`}
                title={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              >
                {isCameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
            )}
            {callUi.callType === 'video' && (
              <button
                onClick={switchCamera}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
                title="Switch camera"
              >
                <RefreshCcw size={18} />
              </button>
            )}
            <button
              onClick={() => endCurrentCall(username)}
              className="p-3 rounded-full bg-rose-500/25 text-rose-300 hover:bg-rose-500/40 transition"
              title="End call"
            >
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 🔥 Wrapper to ensure useSearchParams works correctly in production
export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-zinc-500">Loading...</div>}>
      <ChatContent />
    </Suspense>
  );
}
