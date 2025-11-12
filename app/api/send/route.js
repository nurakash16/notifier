export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { db, fcm } from '@/lib/firebaseAdmin';
import bcrypt from 'bcryptjs';

async function auth(username, password) {
  const snap = await db.collection('users').doc(username).get();
  if (!snap.exists) return false;
  return bcrypt.compare(password, snap.data().passwordHash);
}

export async function POST(req) {
  try {
    const { username, password, to, body } = await req.json(); // username = "from"
    if (!username || !password || !to || !body) {
      return NextResponse.json({ ok:false, error:'Missing fields' }, { status:400 });
    }
    if (!(await auth(username, password))) {
      return NextResponse.json({ ok:false, error:'Unauthorized' }, { status:401 });
    }

    const ts = Date.now();

    await db.collection('messages').add({ from: username, to, body, ts });

    // Push to recipient topic /topics/u_<username>
    await fcm.send({
      topic: `u_${to}`,
      notification: { title: username, body },
      android: { priority: 'high' },
    });

    return NextResponse.json({ ok:true, ts });
  } catch (e) {
    return NextResponse.json({ ok:false, error: e.message || 'Error' }, { status:500 });
  }
}
