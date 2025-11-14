// app/api/conversations/route.js
import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebaseAdmin';

/**
 * GET /api/conversations?username=&password=
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const password = searchParams.get('password'); // currently unused

    if (!username) {
      return NextResponse.json(
        { ok: false, error: 'missing username' },
        { status: 400 }
      );
    }

    // Just verify user exists
    const userRef = db.collection('users').doc(username);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404 }
      );
    }

    // No orderBy here to avoid composite index requirement.
    const qSnap = await db
      .collection('messages')
      .where('participantsArr', 'array-contains', username)
      .get();

    // Sort in memory by ts DESC
    const docs = qSnap.docs
      .map((d) => d.data())
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));

    const map = new Map(); // otherUser -> convo summary

    for (const d of docs) {
      const from = d.from;
      const to = d.to;
      const other =
        from === username ? to :
        to === username ? from :
        null;

      if (!other) continue;
      if (!map.has(other)) {
        map.set(other, {
          other,
          lastBody: d.body || '',
          lastTs: d.ts || 0,
        });
      }
    }

    const conversations = Array.from(map.values()).sort(
      (a, b) => b.lastTs - a.lastTs
    );

    return NextResponse.json({ ok: true, conversations });
  } catch (e) {
    console.error('conversations error', e);
    return NextResponse.json(
      { ok: false, error: 'server error' },
      { status: 500 }
    );
  }
}
