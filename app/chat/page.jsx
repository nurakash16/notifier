'use client';

import { useEffect, useState, useRef } from 'react';

// ---------- Message bubble ----------
function MessageBubble({ me, msg }) {
  const isMe = msg.from === me;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isMe ? 'flex-end' : 'flex-start',
        marginBottom: 6,
      }}
    >
      <div
        style={{
          maxWidth: '72%',
          padding: '8px 12px',
          borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          backgroundColor: isMe ? '#2563EB' : '#F3F4F6',
          color: isMe ? '#FFFFFF' : '#111827',
          fontSize: 14,
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
          boxShadow: isMe ? '0 4px 18px rgba(37,99,235,0.25)' : 'none',
        }}
      >
        {!isMe && (
          <div
            style={{
              fontSize: 8,
              opacity: 0.5,
              marginBottom: 2,
            }}
          >
            {msg.from}
          </div>
        )}
        {msg.body}
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
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  // chat state
  const [other, setOther] = useState('');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');

  // conversations
  const [conversations, setConversations] = useState([]);

  // misc UI
  const [status, setStatus] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(false);

  const threadPollRef = useRef(null);
  const convPollRef = useRef(null);
  const listRef = useRef(null);

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

  // auto-scroll chat
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // ---- poll thread ----
  useEffect(() => {
    if (!isLoggedIn || !other) return;

    const loadThread = async () => {
      try {
        const params = new URLSearchParams({
          username,
          password,
          with: other,
        });
        const res = await fetch(`/api/thread?${params.toString()}`);
        const data = await res.json();
        if (!data.ok) {
          console.error('thread error', data.error);
          return;
        }
        setMessages(data.messages || []);
      } catch (e) {
        console.error('thread fetch error', e);
      }
    };

    loadThread();
    threadPollRef.current = setInterval(loadThread, 3000);

    return () => {
      if (threadPollRef.current) {
        clearInterval(threadPollRef.current);
        threadPollRef.current = null;
      }
    };
  }, [isLoggedIn, other, username, password]);

  // ---- poll conversations ----
  useEffect(() => {
    if (!isLoggedIn) return;

    const loadConversations = async () => {
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
        setConversations(data.conversations || []);
      } catch (e) {
        console.error('conversations fetch error', e);
      }
    };

    loadConversations();
    convPollRef.current = setInterval(loadConversations, 5000);

    return () => {
      if (convPollRef.current) {
        clearInterval(convPollRef.current);
        convPollRef.current = null;
      }
    };
  }, [isLoggedIn, username, password]);

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
    setMessages([]);
    setConversations([]);
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
    const body = text.trim();
    if (!body) return;
    setText('');

    const localMsg = {
      id: `local-${Date.now()}`,
      from: username,
      to: other,
      body,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, localMsg]);

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
      }
    } catch (e) {
      setStatus(e.message || 'Send failed');
    }
  }

  // ---------------- UI ----------------
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F3F4F6',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px 12px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 980,
          borderRadius: 24,
          background: '#FFFFFF',
          boxShadow:
            '0 18px 45px rgba(15,23,42,0.16), 0 0 0 1px rgba(209,213,219,0.8)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 700,
                color: '#0051ffff',
              }}
            >
              Notifier Web Chat
            </h1>
            <div
              style={{
                fontSize: 13,
                color: '#6B7280',
                marginTop: 4,
              }}
            >
              Talk between registered users
            </div>
          </div>

          {isLoggedIn && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 4,
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  color: '#4B5563',
                }}
              >
                Signed in as <b>{username}</b>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  borderRadius: 999,
                  border: '1px solid #062c7aff',
                  background: '#fcb7b7ff',
                  color: '#000000ff',
                  fontSize: 12,
                  padding: '4px 12px',
                  cursor: 'pointer',
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>

        {/* auth panel */}
        {!isLoggedIn && (
          <div
            style={{
              borderRadius: 16,
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setMode('login')}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  background:
                    mode === 'login' ? '#2563EB' : 'rgba(37,99,235,0.04)',
                  color: mode === 'login' ? '#FFFFFF' : '#111827',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  background:
                    mode === 'register' ? '#2563EB' : 'rgba(37,99,235,0.04)',
                  color: mode === 'register' ? '#FFFFFF' : '#111827',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Register
              </button>
            </div>

            <input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 11px',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                background: '#FFFFFF',
                color: '#111827',
                fontSize: 14,
              }}
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 11px',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                background: '#FFFFFF',
                color: '#111827',
                fontSize: 14,
              }}
            />

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: '#4B5563',
                marginTop: 2,
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Stay logged in on this browser</span>
            </label>

            <button
              type="button"
              onClick={handleAuth}
              disabled={loadingAuth}
              style={{
                marginTop: 4,
                padding: '9px 0',
                borderRadius: 999,
                border: 'none',
                background: loadingAuth ? '#93C5FD' : '#2563EB',
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: 500,
                cursor: loadingAuth ? 'default' : 'pointer',
                boxShadow: '0 10px 24px rgba(37,99,235,0.35)',
              }}
            >
              {loadingAuth
                ? 'Please wait...'
                : mode === 'login'
                ? 'Login'
                : 'Register'}
            </button>
          </div>
        )}

        {/* main two-column area */}
        {isLoggedIn && (
          <div
            style={{
              display: 'flex',
              gap: 14,
              minHeight: 320,
            }}
          >
            {/* LEFT: conversations */}
            <div
              style={{
                width: 260,
                borderRadius: 16,
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  color: '#6B7280',
                  padding: '2px 2px 4px',
                  fontWeight: 500,
                }}
              >
                Conversations
              </div>
              <div
                style={{
                  maxHeight: 360,
                  overflowY: 'auto',
                  paddingRight: 2,
                }}
              >
                {conversations.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#9CA3AF',
                      marginTop: 10,
                      textAlign: 'center',
                    }}
                  >
                    No conversations yet
                  </div>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.other}
                      type="button"
                      onClick={() => setOther(c.other)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        cursor: 'pointer',
                        background:
                          c.other === other
                            ? 'rgba(37,99,235,0.08)'
                            : 'transparent',
                        borderRadius: 12,
                        padding: '6px 8px',
                        marginBottom: 4,
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '999px',
                          background: '#E5E7EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#374151',
                        }}
                      >
                        {c.other.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: '#111827',
                          }}
                        >
                          {c.other}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#6B7280',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {c.lastBody}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* RIGHT: chat thread */}
            <div
              style={{
                flex: 1,
                borderRadius: 16,
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* partner selector */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <input
                  placeholder="Chat with (username)"
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: 999,
                    border: '1px solid #E5E7EB',
                    background: '#FFFFFF',
                    color: '#111827',
                    fontSize: 14,
                  }}
                />
              </div>

              {/* messages */}
              <div
                ref={listRef}
                style={{
                  flex: 1,
                  minHeight: 210,
                  maxHeight: 380,
                  overflowY: 'auto',
                  padding: '6px 4px 8px',
                }}
              >
                {!other ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: '#9CA3AF',
                      marginTop: 20,
                      textAlign: 'center',
                    }}
                  >
                    Choose someone on the left or type a username above.
                  </div>
                ) : messages.length === 0 ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: '#9CA3AF',
                      marginTop: 20,
                      textAlign: 'center',
                    }}
                  >
                    No messages yet. Say hi 👋
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble key={m.id} me={username} msg={m} />
                  ))
                )}
              </div>

              {/* input row */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <input
                  placeholder="Type a message"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 999,
                    border: '1px solid #E5E7EB',
                    background: '#FFFFFF',
                    color: '#111827',
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  style={{
                    padding: '0 18px',
                    borderRadius: 999,
                    border: 'none',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    height: 40,
                    boxShadow: '0 8px 20px rgba(37,99,235,0.3)',
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {status && (
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: status.toLowerCase().includes('error')
                ? '#DC2626'
                : '#2563EB',
            }}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
