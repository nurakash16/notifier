// app/api/send/route.js
import { NextResponse } from 'next/server';
import { db, messaging } from '../../../lib/firebaseAdmin';

/**
 * POST /api/send
 * body: { username, password, to, body }
 * (password is accepted but NOT re-checked; we trust that login already did it)
 */
export async function POST(req) {
  try {
    const { username, password, to, body } = await req.json();

    if (!username || !to || !body) {
      return NextResponse.json(
        { ok: false, error: 'missing fields' },
        { status: 400 }
      );
    }

    // 1) Make sure sender exists (no extra password check)
    const senderRef = db.collection('users').doc(username);
    const senderSnap = await senderRef.get();

    if (!senderSnap.exists) {
      console.error('send: sender not found', username);
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404 }
      );
    }

    // 2) Make sure receiver exists
    const receiverRef = db.collection('users').doc(to);
    const receiverSnap = await receiverRef.get();

    if (!receiverSnap.exists) {
      console.error('send: receiver not found', to);
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404 }
      );
    }

    // 3) Save the message (IMPORTANT: add `participants`)
    const now = Date.now();
    const participants = [username, to].sort().join('_'); // e.g. "alice_bob"

    const msgRef = await db.collection('messages').add({
      from: username,
      to,
      body,
      ts: now,
      participants,
      createdAt: new Date(now),
    });

    // 4) Send FCM notification to per-user topic
    const topic = `user_${to}`;
    const fcmPayload = {
      notification: {
        title: username,
        body,
      },
      data: {
        sender: username,   // 👈 was: from
        toUser: to,         // 👈 was: to
        msg: body,          // 👈 was: body
        ts: String(now),
      },
      topic,
    };

    try {
      const fcmRes = await messaging.send(fcmPayload);
      console.log('send: FCM ok', fcmRes);
    } catch (err) {
      console.error('send: FCM error', err);
      // still treat as ok: message is stored in Firestore
    }

    return NextResponse.json({ ok: true, id: msgRef.id, ts: now });
  } catch (err) {
    console.error('send: server error', err);
    return NextResponse.json(
      { ok: false, error: 'server error' },
      { status: 500 }
    );
  }
}
