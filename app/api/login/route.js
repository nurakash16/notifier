export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebaseAdmin';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  try {
    const { username, password } = await req.json();
    const snap = await db.collection('users').doc(username).get();
    if (!snap.exists) return NextResponse.json({ ok:false, error:'Invalid creds' }, { status:401 });

    const ok = await bcrypt.compare(password, snap.data().passwordHash);
    return ok
      ? NextResponse.json({ ok:true })
      : NextResponse.json({ ok:false, error:'Invalid creds' }, { status:401 });
  } catch (e) {
    return NextResponse.json({ ok:false, error: e.message || 'Error' }, { status:500 });
  }
}
