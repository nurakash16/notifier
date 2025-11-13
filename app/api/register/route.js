// app/api/register/route.js
import { db } from '../../../lib/firebaseAdmin';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ ok: false, error: 'username and password required' }),
        { status: 400 }
      );
    }

    const userRef = db.collection('users').doc(username);
    const snap = await userRef.get();
    if (snap.exists) {
      return new Response(
        JSON.stringify({ ok: false, error: 'username already taken' }),
        { status: 409 }
      );
    }

    const hash = await bcrypt.hash(password, 10);

    await userRef.set({
      username,
      passwordHash: hash,
      createdAt: Date.now(),
    });

    return new Response(JSON.stringify({ ok: true }), { status: 201 });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: 'server error' }),
      { status: 500 }
    );
  }
}
