// app/api/react/route.js
import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebaseAdmin';

export async function POST(req) {
  try {
    const { username, password, messageId, emoji } = await req.json();

    if (!username || !messageId || !emoji) {
      return NextResponse.json(
        { ok: false, error: 'missing fields' },
        { status: 400 }
      );
    }

    const msgRef = db.collection('messages').doc(messageId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) {
      return NextResponse.json(
        { ok: false, error: 'message not found' },
        { status: 404 }
      );
    }

    const msg = msgSnap.data();
    const participants = msg.participantsArr || [];
    if (!participants.includes(username)) {
      return NextResponse.json(
        { ok: false, error: 'not allowed' },
        { status: 403 }
      );
    }

    const reactions = { ...(msg.reactions || {}) };
    const current = { ...((reactions[emoji] || {})) };

    if (current[username]) {
      delete current[username];
    } else {
      current[username] = true;
    }

    if (Object.keys(current).length === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = current;
    }

    await msgRef.set({ reactions }, { merge: true });

    return NextResponse.json({ ok: true, reactions });
  } catch (err) {
    console.error('react: server error', err);
    return NextResponse.json(
      { ok: false, error: 'server error' },
      { status: 500 }
    );
  }
}
