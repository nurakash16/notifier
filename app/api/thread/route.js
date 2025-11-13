// app/api/thread/route.js
import { db } from '../../../lib/firebaseAdmin';
import bcrypt from 'bcryptjs';

function threadId(a, b) {
  return [a, b].sort().join('__');
}

export async function POST(req) {
  try {
    const { user, password, withUser } = await req.json();

    if (!user || !password || !withUser) {
      return new Response(
        JSON.stringify({ ok: false, error: 'user, password, withUser required' }),
        { status: 400 }
      );
    }

    // auth
    const userRef = db.collection('users').doc(user);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return new Response(
        JSON.stringify({ ok: false, error: 'invalid credentials' }),
        { status: 401 }
      );
    }
    const userData = userSnap.data();
    const ok = await bcrypt.compare(password, userData.passwordHash);
    if (!ok) {
      return new Response(
        JSON.stringify({ ok: false, error: 'invalid credentials' }),
        { status: 401 }
      );
    }

    const tid = threadId(user, withUser);
    const threadRef = db.collection('threads').doc(tid);
    const msgsSnap = await threadRef
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limit(200) // last 200 messages
      .get();

    const messages = msgsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return new Response(JSON.stringify({ ok: true, messages }), {
      status: 200,
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: 'server error' }),
      { status: 500 }
    );
  }
}
