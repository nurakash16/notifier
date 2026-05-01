import { NextResponse } from 'next/server';
import { db, messaging } from '../../../lib/firebaseAdmin';

export async function POST(req) {
  try {
    const { username, to, callId, callType = 'voice' } = await req.json();

    if (!username || !to || !callId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'missing fields',
          received: { username, to, callId, callType }
        },
        { status: 400 }
      );
    }

    const senderSnap = await db.collection('users').doc(username).get();
    if (!senderSnap.exists) {
      return NextResponse.json(
        { ok: false, error: 'caller not found' },
        { status: 404 }
      );
    }

    const receiverSnap = await db.collection('users').doc(to).get();
    if (!receiverSnap.exists) {
      return NextResponse.json(
        { ok: false, error: 'receiver not found' },
        { status: 404 }
      );
    }

    const now = Date.now();
    const topic = `user_${to}`;
    const isVideo = callType === 'video';

    const fcmPayload = {
      data: {
        type: 'call',
        callType: isVideo ? 'video' : 'voice',
        sender: username,
        toUser: to,
        callId,
        ts: String(now),

        // optional text for Android service
        title: isVideo ? 'Incoming video call' : 'Incoming voice call',
        body: isVideo
          ? `${username} is video calling you`
          : `${username} is calling you`,
      },
      topic,
      android: {
        priority: 'high',
      },
    };

    try {
      const fcmRes = await messaging.send(fcmPayload);
      console.log('callInvite: FCM ok', fcmRes);
    } catch (err) {
      console.error('callInvite: FCM error', err);
      return NextResponse.json(
        { ok: false, error: 'FCM send failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ts: now });
  } catch (err) {
    console.error('callInvite: server error', err);
    return NextResponse.json(
      { ok: false, error: 'server error' },
      { status: 500 }
    );
  }
}