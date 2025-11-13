export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import bcrypt from 'bcryptjs';

const db = admin.firestore();
export async function POST(req) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ ok:false, error:'username/password required' }, { status:400 });
    }

    const doc = db.collection('users').doc(username);
    const snap = await doc.get();
    if (snap.exists) return NextResponse.json({ ok:false, error:'Username taken' }, { status:409 });

    const passwordHash = await bcrypt.hash(password, 10);
    await doc.set({ passwordHash });
    return NextResponse.json({ ok:true });
  } catch (e) {
    return NextResponse.json({ ok:false, error: e.message || 'Error' }, { status:500 });
  }
}
