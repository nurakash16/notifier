// app/api/register/route.js
import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebaseAdmin';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: 'username and password required' },
        { status: 400 }
      );
    }

    const userRef = db.collection('users').doc(username);
    const snap = await userRef.get();
    if (snap.exists) {
      return NextResponse.json(
        { ok: false, error: 'username already exists' },
        { status: 400 }
      );
    }

    // ✅ hash the password and store as passwordHash
    const passwordHash = await bcrypt.hash(password, 10);

    await userRef.set({
      username,
      passwordHash, // 👈 matches login's user.passwordHash
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('REGISTER ERROR:', err);
    return NextResponse.json(
      { ok: false, error: `server error: ${err.message}` },
      { status: 500 }
    );
  }
}
