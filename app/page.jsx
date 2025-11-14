'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const [title, setTitle] = useState('Ping to everyone!');
  const [body, setBody] = useState('This goes to all installs.');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const [ok, setOk] = useState(false);

  async function send() {
    setSending(true);
    setMsg(null);
    setOk(false);
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed');
      setOk(true);
      setMsg('Sent to /topics/broadcast');
    } catch (e) {
      setOk(false);
      setMsg(e?.message || 'Error');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="wrap">
      {/* prettier background */}
      <div className="bg a" />
      <div className="bg b" />

      <section className="card">
        <h1 className="title">Notification Sender</h1>
        <p className="sub">Broadcast to <code>/topics/broadcast</code></p>

        <div className="field">
          <label htmlFor="t">Title</label>
          <input id="t" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="b">Body</label>
          <textarea id="b" rows={3} value={body} onChange={e => setBody(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="p">Password (must)</label>
          <input id="p" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>

        <button className="btn" onClick={send} disabled={sending}>
          {sending ? 'Sending…' : 'Send'}
        </button>

        {msg && <div className={`toast ${ok ? 'ok' : 'err'}`}>{ok ? '✅' : '⚠️'} {msg}</div>}
        
        <div style={{ marginTop: 24 }}>
          <Link
            href="/chat"
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              borderRadius: 999,
              background: '#4F46E5',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Open Web Chat
          </Link>
        </div>

      </section>

      {/* Global + component styles */}
      <style jsx global>{`
        /* Google Font */
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
        html, body { height: 100%; }
        body { margin: 0; font-family: 'Poppins', ui-sans-serif, system-ui, Arial; }
      `}</style>

      <style jsx>{`
        :root{
          --ink:#0f172a;         /* text */
          --muted:#6b7280;       /* secondary text */
          --ring:#6d78ff;        /* focus ring */
          --ok:#16a34a;          /* success */
          --err:#ef4444;         /* error */
          --p1:#7c8cff;          /* brand gradient 1 */
          --p2:#38d0c7;          /* brand gradient 2 */
        }
        *{box-sizing:border-box}
        .wrap{
          min-height:100vh;
          display:grid;
          place-items:center;
          padding:16px;
          color:var(--ink);
          background:
            radial-gradient(700px 500px at 10% -10%, #d6e4ff55, transparent),
            radial-gradient(600px 480px at 110% 0%, #c2fff455, transparent),
            linear-gradient(180deg,#f7fbff,#f4f6ff);
          position:relative;
          overflow:hidden;
        }
        /* soft blobs */
        .bg{
          position:absolute; border-radius:999px; filter:blur(50px); opacity:.55; pointer-events:none;
        }
        .bg.a{ width:320px; height:320px; top:-90px; left:-70px; background:#b8c5ff; }
        .bg.b{ width:260px; height:260px; bottom:-80px; right:-60px; background:#baffef; }

        /* glass card (tinted, not full white) */
        .card{
          width:100%;
          max-width:560px;
          background: rgba(255,255,255,.78);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border:1px solid rgba(15, 23, 42, .08);
          border-radius:20px;
          padding:22px;
          box-shadow: 0 10px 36px rgba(30, 41, 59, .12);
        }
        .title{
          margin:0 0 4px;
          font-size: clamp(22px, 4.6vw, 30px);
          background: linear-gradient(90deg,var(--p1),var(--p2));
          -webkit-background-clip:text; background-clip:text; color:rgba(0, 21, 246, 1);
          cursor:pointer;;
          letter-spacing:.2px;
        }
        .sub{ margin:0 0 14px; color:var(--muted); }
        code{ background:#eef2ff; padding:2px 6px; border-radius:6px }

        .field{ margin: 14px 0; }
        label{ display:block; font-weight:600; margin-bottom:6px; }
        input, textarea{
          width:100%;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid #dbe2f1;
          background: rgba(255,255,255,.9);
          font-size: 16px;
          outline: none;
          transition: box-shadow .15s, border-color .15s, transform .05s;
        }
        textarea{ resize: vertical; }
        input:focus, textarea:focus{
          border-color: var(--ring);
          box-shadow: 0 0 0 4px rgba(109,120,255,.22);
          transform: translateY(-1px);
        }

        /* modern pill button with soft sheen */
        .btn{
          width:100%;
          margin-top: 10px;
          padding: 13px 18px;
          border:0;
          border-radius: 999px;
          font-weight:700;
          font-size:16px;
          color:rgba(0, 21, 246, 1);
          cursor:pointer;
          background:
            linear-gradient(180deg, #ffffff55, #00000022) top/100% 180% no-repeat,
            linear-gradient(90deg, var(--p1), var(--p2));
          box-shadow: 0 10px 24px rgba(109,120,255,.35);
          transition: transform .06s ease, box-shadow .2s ease, opacity .2s ease, background-position .25s ease;
          background-position: top;
        }
        .btn:hover{
          transform: translateY(-1px);
          background-position: bottom; /* reveal the sheen */
          box-shadow: 0 14px 30px rgba(109,120,255,.42);
        }
        .btn:active{ transform: translateY(0) }
        .btn:disabled{ opacity:.7; cursor:not-allowed }

        .toast{
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          font-weight: 600;
          border: 1px solid;
        }
        .toast.ok{ color:#065f46; background:#ecfdf5; border-color:#a7f3d0 }
        .toast.err{ color:#7f1d1d; background:#fef2f2; border-color:#fecaca }

        /* desktop tweak: narrower button */
        @media (min-width: 768px){
          .btn{ width: fit-content; min-width: 200px }
        }
      `}</style>
    </main>
  );
}
