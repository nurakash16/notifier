'use client';

import { useEffect, useState, useRef } from 'react';

// 🔥 Firestore realtime imports
import { db } from '../../lib/firebaseClient'; // <-- change this path to your firebase config
import {
  collection,
  query,
  where,
  orderBy,
  limitToLast,
  onSnapshot,
} from 'firebase/firestore';

/**
 * Parse our "reply-encoded" message bodies.
 * Format (when it's a reply):
 *   "↪ alice: some preview text\n\nactual message text"
 */
function parseReplyBody(rawBody) {
  if (typeof rawBody !== 'string') {
    return {
      isReply: false,
      replyAuthor: '',
      replySnippet: '',
      mainText: '',
    };
  }

  if (rawBody.startsWith('↪ ') && rawBody.includes('\n\n')) {
    const [header, main] = rawBody.split('\n\n', 2);
    const headerStripped = header.slice(2).trim(); // remove "↪ "
    let replyAuthor = '';
    let replySnippet = headerStripped;

    const idx = headerStripped.indexOf(':');
    if (idx !== -1) {
      replyAuthor = headerStripped.slice(0, idx).trim();
      replySnippet = headerStripped.slice(idx + 1).trim();
    }

    return {
      isReply: true,
      replyAuthor,
      replySnippet,
      mainText: main,
    };
  }

  return {
    isReply: false,
    replyAuthor: '',
    replySnippet: '',
    mainText: rawBody,
  };
}

// ---------- Message bubble ----------
function MessageBubble({ me, msg, onReply }) {
  const isMe = msg.from === me;
  const { isReply, replyAuthor, replySnippet, mainText } = parseReplyBody(msg.body || '');

  return (
    <div
      className={`flex mb-1 ${isMe ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[72%] px-3 py-2 text-sm leading-snug whitespace-pre-wrap rounded-2xl shadow-sm cursor-pointer
        ${
          isMe
            ? 'bg-blue-500 text-white rounded-br-sm shadow-blue-500/30'
            : 'bg-slate-200 text-slate-900 rounded-bl-sm'
        }`}
        // click a message to start replying to it
        onClick={() => onReply && onReply(msg)}
      >
        {!isMe && (
          <div className="mb-0.5 text-[9px] uppercase tracking-wide text-slate-500">
            {msg.from}
          </div>
        )}

        {isReply && (
          <div
            className={`mb-1 px-2 py-1 rounded-md border-l-2 text-[10px] ${
              isMe
                ? 'bg-green-700 border-blue-200 text-blue-50'
                : 'bg-blue-200 border-slate-400 text-slate-700'
            }`}
          >
            <div className="font-semibold">
              {replyAuthor || msg.from}
            </div>
            <div className="truncate">{replySnippet}</div>
          </div>
        )}

        <div>{mainText}</div>
      </div>
    </div>
  );
}

// ---------- Page ----------
export default function ChatPage() {
  // auth
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mode, setMode] = useState('login');

  // chat state
  const [other, setOther] = useState(''); // active conversation
  const [otherInput, setOtherInput] = useState(''); // textbox
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');

  // reply state
  const [replyTo, setReplyTo] = useState(null); // Chat message we're replying to

  // conversations
  const [conversations, setConversations] = useState([]);

  // misc UI
  const [status, setStatus] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(false);

  const listRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ---- load saved auth (stay logged in) ----
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
    } catch {
      // ignore
    }
  }, []);

  // ---- ask for Notification permission when logged in ----
  useEffect(() => {
    if (!isLoggedIn || !username) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    (async () => {
      try {
        const perm = await Notification.requestPermission();
        console.log('Notifications permission:', perm);
      } catch (e) {
        console.error('Notification permission error', e);
      }
    })();
  }, [isLoggedIn, username]);

  // auto-scroll to bottom on messages change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // ⭐ REALTIME THREAD (Firestore onSnapshot, scoped to a single pair)
  useEffect(() => {
    if (!isLoggedIn || !other || !username) return;

    // clear old messages when switching conversation
    setMessages([]);

    // This must match how you build `participants` in /api/send:
    // const participants = [username, to].sort().join('_');
    const participantsKey = [username, other].sort().join('_');

    const q = query(
      collection(db, 'messages'),
      where('participants', '==', participantsKey),
      orderBy('ts', 'asc'),
      limitToLast(30) // only last 30 for THIS pair
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setMessages(docs);
      },
      (err) => {
        console.error('onSnapshot error', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isLoggedIn, username, other]);

  // ---- conversations: load once after login (no polling) ----
  useEffect(() => {
    if (!isLoggedIn) return;

    let cancelled = false;

    (async () => {
      try {
        const params = new URLSearchParams({
          username,
          password,
        });
        const res = await fetch(`/api/conversations?${params.toString()}`);
        const data = await res.json();
        if (!data.ok) {
          console.error('conversations error', data.error);
          return;
        }
        if (!cancelled) {
          setConversations(data.conversations || []);
        }
      } catch (e) {
        console.error('conversations fetch error', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, username]);

  // ---- open conversation helper ----
  function openConversation(rawName) {
    const name = rawName.trim();
    if (!name) return;

    setOther(name); // triggers realtime listener via useEffect
    setOtherInput(name);
    setSidebarOpen(false);
    setReplyTo(null); // clear reply when switching chats
  }

  // ---- auth handlers ----
  async function handleAuth() {
    if (!username || !password) {
      setStatus('Please enter username & password');
      return;
    }
    setLoadingAuth(true);
    setStatus('');
    try {
      const res = await fetch(
        mode === 'login' ? '/api/login' : '/api/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        }
      );
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error || 'Error');
      } else {
        setIsLoggedIn(true);
        setStatus(
          mode === 'login' ? 'Logged in' : 'Registered successfully'
        );

        if (typeof window !== 'undefined') {
          if (rememberMe) {
            window.localStorage.setItem(
              'notifierWebAuth',
              JSON.stringify({ username, password })
            );
          } else {
            window.localStorage.removeItem('notifierWebAuth');
          }
        }
      }
    } catch (e) {
      setStatus(e.message || 'Network error');
    } finally {
      setLoadingAuth(false);
    }
  }

  function handleLogout() {
    setIsLoggedIn(false);
    setOther('');
    setOtherInput('');
    setMessages([]);
    setConversations([]);
    setReplyTo(null);
    setStatus('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('notifierWebAuth');
    }
  }

  // ---- send message ----
  async function handleSend() {
    if (!isLoggedIn) {
      setStatus('Login first');
      return;
    }
    if (!other) {
      setStatus('Choose someone to chat with');
      return;
    }
    const rawText = text.trim();
    if (!rawText) return;

    let body = rawText;

    // If replying, encode the reply header at the top of the body
    if (replyTo) {
      const parsed = parseReplyBody(replyTo.body || '');
      const snippetSource = parsed.mainText || replyTo.body || '';
      const preview = snippetSource.replace(/\s+/g, ' ').slice(0, 80);
      body = `↪ ${replyTo.from}: ${preview}\n\n${rawText}`;
    }

    setText('');
    setReplyTo(null);

    const now = Date.now();
    const localMsg = {
      id: `local-${now}`,
      from: username,
      to: other,
      body,
      ts: now,
    };

    // optimistic update; will be replaced by realtime data from Firestore
    setMessages((prev) => {
      let combined = [...prev, localMsg];
      if (combined.length > 100) {
        combined = combined.slice(combined.length - 100);
      }
      return combined;
    });

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          to: other,
          body,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error || 'Send failed');
      } else {
        setStatus('');
        // Realtime listener will pull the actual saved message
      }
    } catch (e) {
      setStatus(e.message || 'Send failed');
    }
  }

  // ---------- AUTH UI ----------
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-slate-50 to-indigo-100 px-4">
        <div className="w-full max-w-md bg-white/90 backdrop-blur rounded-2xl shadow-2xl shadow-slate-900/10 border border-white/60 p-6">
          <h1 className="text-xl font-semibold text-slate-900 mb-1">
            {mode === 'login' ? 'Welcome back 👋' : 'Create your account'}
          </h1>
          <p className="text-xs text-slate-500 mb-4">
            Simple demo chat — choose any username and password.
          </p>

          <div className="space-y-2">
            <input
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-3 w-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Remember me on this device</span>
          </label>

          {status && (
            <div className="mt-2 text-xs text-red-500">
              {status}
            </div>
          )}

          <button
            onClick={handleAuth}
            disabled={loadingAuth}
            className="mt-4 w-full py-2 text-sm font-medium rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-md shadow-blue-500/30 hover:shadow-lg hover:-translate-y-[1px] active:translate-y-[1px] transition disabled:opacity-60 disabled:translate-y-0 disabled:shadow-none"
          >
            {loadingAuth
              ? 'Please wait...'
              : mode === 'login'
              ? 'Login'
              : 'Register'}
          </button>

          <button
            type="button"
            onClick={() =>
              setMode((m) => (m === 'login' ? 'register' : 'login'))
            }
            className="mt-2 w-full py-2 text-xs rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          >
            {mode === 'login'
              ? "Don't have an account? Register"
              : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    );
  }

  // ---------- MAIN CHAT UI ----------
  return (
    <div className="h-screen bg-slate-100">
      <div className="mx-auto h-full max-w-6xl bg-white shadow-xl shadow-slate-900/10 md:rounded-2xl md:overflow-hidden flex">
        {/* SIDEBAR (mobile = slide-in) */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-50 bg-white border-r border-slate-200
            transform transition-transform duration-300 ease-out
            md:static md:translate-x-0 md:w-80
            ${
              sidebarOpen
                ? 'translate-x-0'
                : '-translate-x-full md:translate-x-0'
            }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50/80">
            <div className="flex flex-col">
              <span className="text-xs text-slate-500">Signed in as</span>
              <span className="text-sm font-semibold text-slate-900">
                {username}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-[11px] text-slate-600 rounded-full px-3 py-1 border border-slate-200 hover:bg-slate-100 transition"
            >
              Logout
            </button>
          </div>

          {/* Start chat input */}
          <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
            <input
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="Start chat with username..."
              value={otherInput}
              onChange={(e) => setOtherInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  openConversation(otherInput);
                }
              }}
            />
            <button
              type="button"
              onClick={() => openConversation(otherInput)}
              className="px-2 py-1 text-[11px] rounded-full bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              Start
            </button>
          </div>

          {/* Conversations list */}
          <div className="h-[calc(100%-88px)] overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={c.other}
                onClick={() => openConversation(c.other)}
                className={`w-full text-left px-3 py-2 border-b border-slate-50 hover:bg-slate-50 transition flex flex-col ${
                  c.other === other ? 'bg-blue-50/80' : ''
                }`}
              >
                <div className="text-sm font-semibold text-slate-900">
                  {c.other || '(unknown)'}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 truncate">
                  {c.lastBody && c.lastBody.length > 40
                    ? c.lastBody.slice(0, 40) + '…'
                    : c.lastBody || ''}
                </div>
              </button>
            ))}
            {conversations.length === 0 && (
              <div className="px-3 py-4 text-[11px] text-slate-400">
                No recent conversations yet.
              </div>
            )}
          </div>
        </aside>

        {/* Mobile overlay when sidebar open */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* MAIN CHAT AREA */}
        <main className="flex-1 flex flex-col">
          {/* Header */}
          <header className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50/60">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="md:hidden inline-flex flex-col items-center justify-center h-8 w-8 rounded-full hover:bg-slate-200 text-slate-700 transition"
            >
              <span className="block w-4 h-0.5 bg-slate-700 rounded-full mb-[3px]" />
              <span className="block w-4 h-0.5 bg-slate-700 rounded-full mb-[3px]" />
              <span className="block w-4 h-0.5 bg-slate-700 rounded-full" />
            </button>

            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {other ? 'Conversation' : 'No conversation selected'}
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {other ? other : 'Choose someone to chat with'}
              </span>
            </div>
          </header>

          {/* Messages (bottom-anchored) */}
          <section
            ref={listRef}
            className="flex-1 overflow-y-auto bg-slate-50"
          >
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center px-3 py-2">
                <p className="text-xs text-slate-400">
                  {other
                    ? 'No messages yet — say hi!'
                    : 'Pick or type a username to start chatting.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col justify-end min-h-full px-3 py-2">
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    me={username}
                    msg={m}
                    onReply={setReplyTo}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Input row + reply preview */}
          <footer className="border-t border-slate-200 bg-white px-3 py-2">
            {replyTo && (
              <div className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]">
                <div className="border-l-4 border-blue-500 pl-2">
                  <div className="font-semibold text-slate-700">
                    Replying to {replyTo.from}
                  </div>
                  <div className="text-slate-500 line-clamp-1">
                    {parseReplyBody(replyTo.body || '').mainText}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="ml-2 text-slate-400 hover:text-slate-600 px-1"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                className="flex-1 px-3 py-2 text-sm rounded-full border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition disabled:bg-slate-100 disabled:text-slate-400"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  other ? 'Type a message and press Enter…' : 'Choose someone first'
                }
                disabled={!other}
              />
              <button
                onClick={handleSend}
                disabled={!other}
                className="px-4 py-2 text-sm font-medium rounded-full bg-blue-600 text-white shadow-sm shadow-blue-500/30 hover:bg-blue-700 active:bg-blue-800 active:shadow-none disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none disabled:cursor-not-allowed transition"
              >
                Send
              </button>
            </div>

            {status && (
              <div className="mt-1 text-[11px] text-red-500 text-center">
                {status}
              </div>
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}
