// app/api/thread/route.js
import { db } from '../../../lib/firebaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const password = searchParams.get('password'); // accepted but ignored
    const other = searchParams.get('with');

    if (!username || !other) {
      return NextResponse.json(
        { ok: false, error: 'missing fields' },
        { status: 400 }
      );
    }

    // just verify user exists, no extra password check
    const userRef = db.collection('users').doc(username);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404 }
      );
    }

    const participantsKey = [username, other].sort().join('_');

    const qSnap = await db
      .collection('messages')
      .where('participants', '==', participantsKey)
      .orderBy('ts')
      .get();

    const messages = qSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({ ok: true, messages });
  } catch (e) {
    console.error('thread error', e);
    return NextResponse.json(
      { ok: false, error: 'server error' },
      { status: 500 }
    );
  }
}
