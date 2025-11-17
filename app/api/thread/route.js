// app/api/thread/route.js
import { db } from '../../../lib/firebaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const password = searchParams.get('password'); // ignored
    const other = searchParams.get('with');
    const afterStr = searchParams.get('after');
    const limitStr = searchParams.get('limit');

    if (!username || !other) {
      return NextResponse.json(
        { ok: false, error: 'missing fields' },
        { status: 400 }
      );
    }

    // verify user exists (1 read)
    const userRef = db.collection('users').doc(username);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404 }
      );
    }

    const participantsKey = [username, other].sort().join('_');

    let query = db
      .collection('messages')
      .where('participants', '==', participantsKey);

    const after = afterStr ? Number(afterStr) : 0;
    if (after) {
      // only messages strictly newer than the last timestamp
      query = query.where('ts', '>', after);
    }

    // limit: default 30, max 100
    let limit = limitStr ? Number(limitStr) : 30;
    if (!Number.isFinite(limit) || limit <= 0) limit = 30;
    if (limit > 100) limit = 100;

    // newest first, then we'll reverse to oldest-first
    query = query.orderBy('ts', 'desc').limit(limit);

    const qSnap = await query.get();

    let messages = qSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // we fetched newest first; for UI we want chronological order
    messages = messages.reverse();

    return NextResponse.json({ ok: true, messages });
  } catch (e) {
    console.error('thread error', e);
    return NextResponse.json(
      { ok: false, error: 'server error' },
      { status: 500 }
    );
  }
}
