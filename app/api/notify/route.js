import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

let app;

function getApp() {
  if (!app) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rk = process.env.FIREBASE_PRIVATE_KEY;
    const privateKey = rk && rk.includes('\\n') ? rk.replace(/\\n/g, '\n') : rk;

    app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
  }
  return app;
}

export async function POST(req) {
  try {
    const { title, body, password } = await req.json();

    // Optional simple protection
    const required = process.env.SENDER_PASSWORD;
    if (required && password !== required) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const messaging = getApp().messaging();
    await messaging.send({
      topic: 'broadcast',
      notification: {
        title: title || 'Broadcast',
        body: body || 'Hello everyone'
      },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
