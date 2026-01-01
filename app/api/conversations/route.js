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
    const password = searchParams.get('password'); // unused

    if (!username) {
      return NextResponse.json(
        { ok: false, error: 'missing username' },
        { status: 400 }
      );
    }

    // Optional: verify user exists (1 read). You *can* remove this later to save reads.
    const userRef = db.collection('users').doc(username);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404 }
      );
    }

    // Read only conversation summaries that involve this user
    const qSnap = await db
      .collection('conversations')
      .where('participantsArr', 'array-contains', username)
      .orderBy('lastTs', 'desc')
      .limit(200) // max 50 conversations
      .get();

    const conversations = qSnap.docs.map((doc) => {
      const data = doc.data();
      const other =
        (data.participantsArr || []).find((u) => u !== username) || null;

      return {
        other,
        lastBody: data.lastBody || '',
        lastTs: data.lastTs || 0,
      };
    });

    return NextResponse.json({ ok: true, conversations });
  } catch (e) {
    console.error('conversations error', e);
    return NextResponse.json(
      { ok: false, error: 'server error' },
      { status: 500 }
    );
  }
}
