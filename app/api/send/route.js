// app/api/send/route.js
import { NextResponse } from 'next/server';
import { db, messaging } from '../../../lib/firebaseAdmin';

export async function POST(req) {
  try {
    const { username, password, to, body, encrypted } = await req.json();

    const hasEncrypted =
      encrypted &&
      typeof encrypted.ciphertext === 'string' &&
      typeof encrypted.iv === 'string' &&
      typeof encrypted.senderPubKeyJwk === 'string';
    const hasText = typeof body === 'string' && body.trim().length > 0;

    if (!username || !to || (!hasEncrypted && !hasText)) {
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

    // 3) Save the message
    const now = Date.now();
    const participants = [username, to].sort().join('_'); // "alice_bob"
    const participantsArr = [username, to];

    const msgData = {
      from: username,
      to,
      body: hasEncrypted ? '' : (hasText ? body : ''),
      type: hasEncrypted ? 'encrypted' : 'text',
      encrypted: hasEncrypted
        ? {
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            senderPubKeyJwk: encrypted.senderPubKeyJwk,
            v: 1,
          }
        : null,
      ts: now,
      participants,
      participantsArr,
      createdAt: new Date(now),
    };

    const msgRef = await db.collection('messages').add(msgData);

    // 4) Upsert conversation summary (1 doc per pair)
    const convRef = db.collection('conversations').doc(participants);
    const lastBody = hasEncrypted ? '[Encrypted]' : body;

    await convRef.set(
      {
        participants,
        participantsArr,
        lastBody,
        lastTs: now,
        lastFrom: username,
        updatedAt: new Date(now),
      },
      { merge: true }
    );

    // 5) Send FCM notification to per-user topic
    const topic = `user_${to}`;
    const fcmPayload = {
      notification: {
        title: username,
        body: lastBody,
      },
      data: {
        sender: username,
        toUser: to,
        msg: lastBody,
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
