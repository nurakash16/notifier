'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { 
  Send, LogOut, MessageSquare, Search, 
  ChevronLeft, X, Radio, ArrowLeft 
} from 'lucide-react';

// 🔥 Firestore imports
import { db } from '../../lib/firebaseClient'; 
import {
  collection, query, where, orderBy, limitToLast, onSnapshot
} from 'firebase/firestore';

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

const Avatar = ({ name, size = "md", className = "" }) => {
  const sizeClasses = {
    sm: "w-8 h-8 text-[10px]",
    md: "w-10 h-10 text-xs",
  };
  
  // Generate consistent pastel color based on name
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
      {getInitials(name)}
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

// --- MAIN CHAT COMPONENT ---

export default function ChatPage() {
  // Auth State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState('login'); 
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // App State
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null); 
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [status, setStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Refs
  const scrollRef = useRef(null);

  // 1. Check LocalStorage
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
    const participantsKey = [username, activeChat].sort().join('_');
    
    const q = query(
      collection(db, 'messages'),
      where('participants', '==', participantsKey),
      orderBy('ts', 'asc'),
      limitToLast(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(docs);
    }, (err) => console.error(err));

    return () => unsubscribe();
  }, [isLoggedIn, username, activeChat]);

  // 4. Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, replyTo]);

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
    setActiveChat(null);
    window.localStorage.removeItem('notifierWebAuth');
  };

  const handleSend = async () => {
    if (!activeChat || !inputText.trim()) return;
    
    const rawText = inputText.trim();
    let body = rawText;

    if (replyTo) {
      const parsed = parseReplyBody(replyTo.body || '');
      const cleanSnippet = (parsed.mainText || replyTo.body || '').replace(/\s+/g, ' ').slice(0, 60);
      body = `↪ ${replyTo.from}: ${cleanSnippet}\n\n${rawText}`;
    }

    const tempId = 'local-' + Date.now();
    const newMsg = { id: tempId, from: username, to: activeChat, body, ts: Date.now() };
    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    setReplyTo(null);

    try {
      await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, to: activeChat, body }),
      });
    } catch (e) { console.error(e); }
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
               className="w-full px-4 py-3 rounded-xl bg-zinc-100 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
               placeholder="Username"
             />
             <input 
               type="password"
               value={password} onChange={e => setPassword(e.target.value)}
               className="w-full px-4 py-3 rounded-xl bg-zinc-100 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
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
    <div className="flex h-[100dvh] bg-zinc-50 overflow-hidden font-sans">
      
      {/* SIDEBAR */}
      <aside className={`
        flex flex-col bg-white border-r border-zinc-200 w-full md:w-80 lg:w-96
        fixed inset-y-0 z-30 transition-transform duration-300
        ${activeChat ? '-translate-x-full md:translate-x-0' : 'translate-x-0'} 
        md:relative
      `}>
        {/* Sidebar Header */}
        <div className="h-16 px-4 border-b border-zinc-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Avatar name={username} size="sm" />
            <div>
              <div className="font-bold text-zinc-800 text-sm">{username}</div>
              <div className="text-[10px] text-green-600 flex items-center gap-1">● Online</div>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition">
            <LogOut size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-zinc-400" size={16} />
            <input 
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:bg-white focus:border-indigo-400 outline-none transition"
            />
          </div>
          {/* BroadCast Page Button (Mobile Sidebar) */}
          <Link href="/" className="flex items-center justify-center gap-2 w-full py-2 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-xl hover:bg-indigo-100 transition md:hidden">
            <Radio size={14} /> Go to Broadcast
          </Link>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {filteredConversations.map(c => (
            <button
              key={c.other}
              onClick={() => setActiveChat(c.other)}
              className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${activeChat === c.other ? 'bg-indigo-600 shadow-md shadow-indigo-200' : 'hover:bg-zinc-50'}`}
            >
              <Avatar name={c.other} className={activeChat === c.other ? 'bg-white text-indigo-700' : ''} />
              <div className="flex-1 text-left min-w-0">
                <div className={`text-sm font-semibold truncate ${activeChat === c.other ? 'text-white' : 'text-zinc-800'}`}>{c.other}</div>
                <div className={`text-xs truncate ${activeChat === c.other ? 'text-indigo-100' : 'text-zinc-500'}`}>{c.lastBody}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* CHAT AREA */}
      <main className={`
        flex-1 flex flex-col bg-slate-50 h-full relative z-10 
        transition-transform duration-300 absolute inset-0 md:static md:translate-x-0
        ${activeChat ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        
        {/* Chat Header */}
        <header className="h-16 px-4 bg-white/90 backdrop-blur border-b border-zinc-200 flex items-center justify-between shrink-0 shadow-sm z-20">
          <div className="flex items-center gap-2">
            <button onClick={() => setActiveChat(null)} className="md:hidden p-2 -ml-2 text-zinc-600 hover:bg-slate-200 rounded-full">
              <ChevronLeft size={24} />
            </button>
            {activeChat ? (
              <div className="flex items-center gap-3">
                <Avatar name={activeChat} size="sm" />
                <span className="font-bold text-zinc-800 text-sm">{activeChat}</span>
              </div>
            ) : <span className="text-zinc-400 text-sm">Select a chat</span>}
          </div>

          {/* 🔥 RIGHT SIDE HEADER ICONS */}
          <div className="flex items-center gap-2">
             <Link 
               href="/" 
               title="Go to Broadcast Page"
               className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-semibold hover:bg-indigo-100 transition"
             >
               <Radio size={14} /> Broadcast
             </Link>
          </div>
        </header>

        {/* Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-1 bg-[#f0f4f8]"
          style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        >
          {activeChat && groupedMessages.map((item) => {
            if (item.type === 'date') return (
              <div key={item.id} className="flex justify-center py-4">
                <span className="bg-zinc-200/80 px-3 py-1 rounded-full text-[10px] font-bold text-zinc-600">{item.label}</span>
              </div>
            );
            
            const { isMe, data, isLastInSequence } = item;
            const { isReply, replyAuthor, replySnippet, mainText } = parseReplyBody(data.body);

            return (
              <div key={item.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
                <div className={`flex max-w-[85%] md:max-w-[70%] items-end gap-2`}>
                  
                  {/* Left Avatar (Other) */}
                  {!isMe && (
                    <div className="w-8 shrink-0">
                      {isLastInSequence && <Avatar name={data.from} size="sm" className="w-8 h-8 text-[10px]" />}
                    </div>
                  )}

                  {/* Bubble */}
                  <div className={`flex flex-col min-w-0 ${isMe ? 'items-end' : 'items-start'}`}>
                    <div 
                      onClick={() => setReplyTo(data)}
                      className={`
                        relative px-4 py-2 text-sm shadow-sm cursor-pointer transition-transform active:scale-[0.98]
                        whitespace-pre-wrap break-words
                        ${isMe 
                          ? `bg-indigo-500 text-white rounded-2xl ${isLastInSequence ? 'rounded-br-sm' : ''}` 
                          : `bg-white text-zinc-800 rounded-2xl ${isLastInSequence ? 'rounded-bl-sm' : ''}`
                        }
                      `}
                    >
                      {isReply && (
                        <div className={`mb-2 rounded-lg p-2 text-xs border-l-4 overflow-hidden ${isMe ? 'bg-black/20 border-indigo-200 text-indigo-50' : 'bg-zinc-100 border-indigo-500 text-zinc-600'}`}>
                          <div className="font-bold mb-0.5 opacity-90">{replyAuthor}</div>
                          <div className="truncate opacity-80">{replySnippet}</div>
                        </div>
                      )}
                      {mainText}
                      <div className={`text-[9px] mt-1 flex justify-end gap-1 ${isMe ? 'text-indigo-200' : 'text-zinc-400'}`}>
                        {formatTime(data.ts)} {isMe && '✓'}
                      </div>
                    </div>
                  </div>

                  {/* Right Avatar (Me) */}
                  {isMe && (
                    <div className="w-8 shrink-0">
                      {isLastInSequence && <Avatar name={username} size="sm" className="w-8 h-8 text-[10px]" />}
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        {activeChat && (
          <div className="bg-white px-4 py-3 border-t border-zinc-200 shrink-0">
            {replyTo && (
              <div className="flex items-center justify-between bg-indigo-50 p-2 mb-2 rounded-lg border border-indigo-100">
                <div className="text-xs text-indigo-800 truncate px-2 border-l-2 border-indigo-500">
                  Replying to <span className="font-bold">{replyTo.from}</span>
                </div>
                <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-indigo-200 rounded-full text-indigo-600"><X size={14} /></button>
              </div>
            )}
            <div className="flex items-end gap-2 max-w-4xl mx-auto">
              <input
                className="flex-1 py-3 px-4 rounded-full bg-zinc-100 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 border border-transparent outline-none transition text-sm"
                placeholder="Type a message..."
                value={inputText} onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              />
              <button onClick={handleSend} disabled={!inputText.trim()} className="p-3 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition disabled:opacity-50">
                <Send size={18} className={inputText.trim() ? "translate-x-0.5" : ""} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}