// app/chat/page.jsx
'use client';

import { useEffect, useState, useRef } from 'react';

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
          maxWidth: '70%',
          padding: '8px 12px',
          borderRadius: 16,
          backgroundColor: isMe ? '#4F46E5' : '#27272F',
          color: '#fff',
          fontSize: 14,
          alignSelf: 'flex-start',
          whiteSpace: 'pre-wrap',
        }}
      >
        {!isMe && (
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
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

export default function ChatPage() {
  // auth
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // chat
  const [other, setOther] = useState('');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');

  // ui state
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const pollRef = useRef(null);
  const listRef = useRef(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Poll /api/thread when logged in + other chosen
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

    // initial load
    loadThread();

    // start polling
    pollRef.current = setInterval(loadThread, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isLoggedIn, other, username, password]);

  async function handleAuth() {
    if (!username || !password) {
      setStatus('Please enter username & password');
      return;
    }

    setLoading(true);
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
          mode === 'login' ? 'Logged in successfully' : 'Registered successfully'
        );
      }
    } catch (e) {
      setStatus(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!isLoggedIn) {
      setStatus('Login first');
      return;
    }
    if (!other) {
      setStatus('Enter the username you want to chat with');
      return;
    }
    const body = text.trim();
    if (!body) return;

    setText('');

    // optimistic add
    const tmp = {
      id: `local-${Date.now()}`,
      from: username,
      to: other,
      body,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, tmp]);

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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#101114',
        color: '#fff',
        display: 'flex',
        justifyContent: 'center',
        padding: '24px 12px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 20,
          background: '#181920',
          padding: 16,
          boxShadow: '0 12px 25px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20 }}>Notifier Web Chat</h2>
          {isLoggedIn && (
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              Signed in as <b>{username}</b>
            </span>
          )}
        </div>

        {/* Auth box */}
        {!isLoggedIn && (
          <div
            style={{
              borderRadius: 12,
              padding: 12,
              background: '#20212A',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setMode('login')}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  background:
                    mode === 'login' ? '#4F46E5' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 13,
                }}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  background:
                    mode === 'register' ? '#4F46E5' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 13,
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
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #333',
                background: '#15151B',
                color: '#fff',
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
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #333',
                background: '#15151B',
                color: '#fff',
                fontSize: 14,
              }}
            />

            <button
              type="button"
              onClick={handleAuth}
              disabled={loading}
              style={{
                marginTop: 4,
                padding: '8px 0',
                borderRadius: 10,
                border: 'none',
                background: loading ? '#4F46E588' : '#4F46E5',
                color: '#fff',
                fontSize: 14,
                cursor: loading ? 'default' : 'pointer',
              }}
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                ? 'Login'
                : 'Register'}
            </button>
          </div>
        )}

        {/* Chat section (only when logged in) */}
        {isLoggedIn && (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <label style={{ fontSize: 12, opacity: 0.75 }}>
                Chat with (username)
              </label>
              <input
                placeholder="e.g. bob"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #333',
                  background: '#15151B',
                  color: '#fff',
                  fontSize: 14,
                }}
              />
            </div>

            <div
              ref={listRef}
              style={{
                flex: 1,
                minHeight: 220,
                maxHeight: 360,
                overflowY: 'auto',
                padding: '8px 4px',
                borderRadius: 12,
                background: '#111119',
                border: '1px solid #222',
              }}
            >
              {messages.length === 0 ? (
                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.6,
                    textAlign: 'center',
                    marginTop: 20,
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
                  border: '1px solid #333',
                  background: '#15151B',
                  color: '#fff',
                  fontSize: 14,
                }}
              />
              <button
                type="button"
                onClick={handleSend}
                style={{
                  padding: '0 16px',
                  borderRadius: 999,
                  border: 'none',
                  background: '#4F46E5',
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                  height: 38,
                }}
              >
                Send
              </button>
            </div>
          </>
        )}

        {status && (
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: status.toLowerCase().includes('error') ? '#F97373' : '#A5B4FC',
            }}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
