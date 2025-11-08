'use client';
import { useState } from 'react';

export default function Home() {
  const [title, setTitle] = useState('Ping to everyone!');
  const [body, setBody] = useState('This goes to all installs.');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);

  async function send() {
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed');
      setMsg('✅ Sent to /topics/broadcast');
    } catch (e) {
      setMsg(`❌ ${e.message || 'Error'}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: '60px auto', fontFamily: 'Inter, system-ui, Arial' }}>
      <h1>Broadcast Notification</h1>
      <p>Sends a push to everyone subscribed to <code>/topics/broadcast</code>.</p>

      <label style={{ display: 'block', marginTop: 16 }}>Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', padding: 8 }} />

      <label style={{ display: 'block', marginTop: 12 }}>Body</label>
      <input value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%', padding: 8 }} />

      <label style={{ display: 'block', marginTop: 12 }}>Password (optional)</label>
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: '100%', padding: 8 }}
        placeholder="Set SENDER_PASSWORD in env to require this"
        type="password"
      />

      <button onClick={send} disabled={sending} style={{ padding: '10px 16px', marginTop: 16 }}>
        {sending ? 'Sending…' : 'Send to Everyone'}
      </button>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
