// app/api/send/route.js
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { initFirebaseAdmin } from '../../../lib/firebaseAdmin'; // same helper you use in login/register

initFirebaseAdmin();
const db = getFirestore();
const messaging = getMessaging();

/**
 * POST /api/send
 * body: { username, password, to, body }
 */
export async function POST(req) {
  try {
    const { username, password, to, body } = await req.json();

    if (!username || !password || !to || !body) {
      return NextResponse.json(
        { ok: false, error: 'missing fields' },
        { status: 400 }
      );
    }

    // 1) Check sender credentials
    const senderRef = db.collection('users').doc(username);
    const senderSnap = await senderRef.get();

    if (!senderSnap.exists) {
      console.error('send: sender not found', username);
      return NextResponse.json(
        { ok: false, error: 'invalid username or password' },
        { status: 401 }
      );
    }

    const sender = senderSnap.data();
    if (!sender || sender.password !== password) {
      console.error('send: bad password for', username);
      return NextResponse.json(
        { ok: false, error: 'invalid username or password' },
        { status: 401 }
      );
    }

    // 2) Check receiver exists
    const receiverRef = db.collection('users').doc(to);
    const receiverSnap = await receiverRef.get();

    if (!receiverSnap.exists) {
      console.error('send: receiver not found', to);
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404 }
      );
    }

    // 3) Store the message
    const now = Date.now();
    const msgRef = await db.collection('messages').add({
      from: username,
      to,
      body,
      ts: now,
      createdAt: new Date(now),
    });

    // 4) Send FCM push to the receiver's topic
    const topic = `user_${to}`;
    const fcmPayload = {
      notification: {
        title: username, // sender name
        body,
      },
      data: {
        from: username,
        to,
        body,
        ts: String(now),
      },
      topic,
    };

    try {
      const fcmRes = await messaging.send(fcmPayload);
      console.log('send: FCM ok', fcmRes);
    } catch (err) {
      console.error('send: FCM error', err);
      // we still consider the message "sent" even if push fails
    }

    return NextResponse.json({
      ok: true,
      id: msgRef.id,
    });
  } catch (err) {
    console.error('send: server error', err);
    return NextResponse.json(
      { ok: false, error: 'server error' },
      { status: 500 }
    );
  }
}
