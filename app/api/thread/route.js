export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const me    = url.searchParams.get('me');
    const peer  = url.searchParams.get('peer');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const before = parseInt(url.searchParams.get('before') || `${Date.now()}`, 10);

    if (!me || !peer) {
      return NextResponse.json({ ok:false, error:'me/peer required' }, { status:400 });
    }

    const q1 = db.collection('messages')
      .where('from','==',me).where('to','==',peer).where('ts','<', before)
      .orderBy('ts','desc').limit(limit);
    const q2 = db.collection('messages')
      .where('from','==',peer).where('to','==',me).where('ts','<', before)
      .orderBy('ts','desc').limit(limit);

    const [s1, s2] = await Promise.all([q1.get(), q2.get()]);
    const items = [...s1.docs, ...s2.docs].map(d => d.data())
      .sort((a,b)=>a.ts - b.ts);

    return NextResponse.json({ ok:true, items });
  } catch (e) {
    // If Firestore asks for an index, follow the console link once.
    return NextResponse.json({ ok:false, error: e.message || 'Error' }, { status:500 });
  }
}
