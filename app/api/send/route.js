// app/api/send/route.js
import { db, fcm } from '../../../lib/firebaseAdmin';
import bcrypt from 'bcryptjs';

function threadId(a, b) {
  return [a, b].sort().join('__');
}

export async function POST(req) {
  try {
    const { fromUser, password, toUser, text } = await req.json();

    if (!fromUser || !password || !toUser || !text) {
      return new Response(
        JSON.stringify({ ok: false, error: 'fromUser, password, toUser, text required' }),
        { status: 400 }
      );
    }

    // 1) check sender credentials
    const fromRef = db.collection('users').doc(fromUser);
    const fromSnap = await fromRef.get();
    if (!fromSnap.exists) {
      return new Response(
        JSON.stringify({ ok: false, error: 'invalid credentials' }),
        { status: 401 }
      );
    }
    const fromData = fromSnap.data();
    const ok = await bcrypt.compare(password, fromData.passwordHash);
    if (!ok) {
      return new Response(
        JSON.stringify({ ok: false, error: 'invalid credentials' }),
        { status: 401 }
      );
    }

    // 2) check recipient exists
    const toRef = db.collection('users').doc(toUser);
    const toSnap = await toRef.get();
    if (!toSnap.exists) {
      return new Response(
        JSON.stringify({ ok: false, error: 'recipient not found' }),
        { status: 404 }
      );
    }

    const tid = threadId(fromUser, toUser);
    const threadRef = db.collection('threads').doc(tid);
    await threadRef.set(
      {
        users: [fromUser, toUser],
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    const msgRef = threadRef.collection('messages').doc();
    const msg = {
      from: fromUser,
      to: toUser,
      text,
      createdAt: Date.now(),
    };
    await msgRef.set(msg);

    // OPTIONAL: send FCM push to "toUser" device topic, if you want
    // e.g. topic = `user_${toUser}` and devices subscribe to it.

    return new Response(JSON.stringify({ ok: true, message: msg }), {
      status: 201,
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: 'server error' }),
      { status: 500 }
    );
  }
}
