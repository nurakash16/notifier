// app/api/login/route.js
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
    if (!snap.exists) {
      return new Response(
        JSON.stringify({ ok: false, error: 'invalid credentials' }),
        { status: 401 }
      );
    }

    const user = snap.data();
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return new Response(
        JSON.stringify({ ok: false, error: 'invalid credentials' }),
        { status: 401 }
      );
    }

    // no token, just confirm login
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: 'server error' }),
      { status: 500 }
    );
  }
}
