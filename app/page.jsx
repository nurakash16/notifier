'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Radio, 
  MessageSquare, 
  Send, 
  Lock, 
  Type, 
  FileText, 
  ArrowRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function BroadcastPage() {
  const [title, setTitle] = useState('Ping to everyone!');
  const [body, setBody] = useState('This goes to all installs.');
  const [password, setPassword] = useState('');
  
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const [ok, setOk] = useState(false);

  async function send() {
    if (!password) {
      setOk(false);
      setMsg("Admin password is required");
      return;
    }
    
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
      setMsg('Broadcast sent successfully to all users!');
    } catch (e) {
      setOk(false);
      setMsg(e?.message || 'Error sending message');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 relative overflow-hidden font-sans selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      
      {/* --- Animated Background Decoration --- */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-300/30 rounded-full blur-[100px] mix-blend-multiply animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-violet-300/30 rounded-full blur-[100px] mix-blend-multiply" />
      </div>

      {/* --- Responsive Header --- */}
      <header className="relative z-20 w-full p-4 md:p-6 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-slate-900 rounded-lg text-white">
            <Radio size={20} />
          </div>
          <span className="font-bold text-slate-900 tracking-tight hidden sm:block">Notify<span className="text-indigo-600">Admin</span></span>
        </div>

        <Link 
          href="/chat"
          className="group flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md border border-white/50 rounded-full shadow-sm hover:shadow-md hover:bg-white transition-all duration-300 text-sm font-semibold text-slate-700 hover:text-indigo-600"
        >
          <MessageSquare size={16} className="group-hover:-rotate-12 transition-transform" />
          <span>Open Web Chat</span>
          <ArrowRight size={14} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all hidden sm:block" />
        </Link>
      </header>

      {/* --- Main Content --- */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white/70 backdrop-blur-xl border border-white/60 rounded-3xl shadow-2xl p-6 md:p-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="mb-8 text-center">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">Broadcast Console</h1>
              <p className="text-slate-500 text-sm">
                Send push notifications to the <code className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono text-xs">/topics/broadcast</code> channel.
              </p>
            </div>

            <div className="space-y-5">
              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Type size={12} /> Notification Title
                </label>
                <input 
                  value={title} 
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium text-slate-800 placeholder:text-slate-300"
                  placeholder="e.g. System Update"
                />
              </div>

              {/* Body Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={12} /> Message Content
                </label>
                <textarea 
                  rows={4}
                  value={body} 
                  onChange={e => setBody(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-600 placeholder:text-slate-300 resize-none leading-relaxed"
                  placeholder="Type your message here..."
                />
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock size={12} /> Admin Key
                </label>
                <div className="relative group">
                  <input 
                    type="password"
                    value={password} 
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono text-slate-800"
                    placeholder="••••••••"
                  />
                  <div className="absolute left-3.5 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                    <Lock size={18} />
                  </div>
                </div>
              </div>

              {/* Feedback Message */}
              {msg && (
                <div className={`p-4 rounded-xl flex items-start gap-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300 ${ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                  <div className="mt-0.5 shrink-0">
                    {ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  </div>
                  <div>
                    <span className="font-bold block">{ok ? 'Success!' : 'Error'}</span>
                    <span className="opacity-90">{msg}</span>
                  </div>
                </div>
              )}

              {/* Send Button */}
              <button 
                onClick={send} 
                disabled={sending}
                className="w-full mt-2 relative overflow-hidden group py-4 rounded-xl bg-slate-900 text-white font-bold text-base shadow-xl shadow-slate-200 hover:shadow-2xl hover:bg-black hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                <span className="flex items-center justify-center gap-2">
                  {sending ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Broadcasting...
                    </>
                  ) : (
                    <>
                      <Send size={18} /> Send Notification
                    </>
                  )}
                </span>
              </button>
            </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        .group-hover\:animate-shimmer:hover {
          animation: shimmer 1.5s infinite;
        }
      `}</style>
    </main>
  );
}