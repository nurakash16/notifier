import { NextResponse } from 'next/server';
import { db, messaging } from '../../../lib/firebaseAdmin';

function parseAndroidImageBody(body) {
  if (typeof body !== 'string') return null;
  if (!body.startsWith('[IMAGE]|')) return null;

  const url = body.match(/url=([^|]+)/)?.[1] || '';
  const width = Number(body.match(/w=([^|]+)/)?.[1] || 0);
  const height = Number(body.match(/h=([^|]+)/)?.[1] || 0);
  const caption = body.match(/caption=([^|]*)/)?.[1] || '';

  if (!url) return null;

  return {
    body: caption,
    image: {
      url,
      width,
      height,
    },
  };
}

export async function POST(req) {
  try {
    const { username, password, to, body, encrypted, image } = await req.json();

    const androidImage = parseAndroidImageBody(body);
    const finalImage = image || androidImage?.image || null;
    const finalBody = androidImage ? androidImage.body : (typeof body === 'string' ? body : '');

    const hasEncrypted =
      encrypted &&
      typeof encrypted.ciphertext === 'string' &&
      typeof encrypted.iv === 'string' &&
      typeof encrypted.senderPubKeyJwk === 'string';

    const hasText = finalBody.trim().length > 0;
    const hasImage = !!finalImage?.url;

    if (!username || !to || (!hasEncrypted && !hasText && !hasImage)) {
      return NextResponse.json(
        { ok: false, error: 'missing fields' },
        { status: 400 }
      );
    }

    const senderRef = db.collection('users').doc(username);
    const senderSnap = await senderRef.get();

    if (!senderSnap.exists) {
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404 }
      );
    }

    const receiverRef = db.collection('users').doc(to);
    const receiverSnap = await receiverRef.get();

    if (!receiverSnap.exists) {
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404 }
      );
    }

    const now = Date.now();
    const participants = [username, to].sort().join('_');
    const participantsArr = [username, to];

    const messageType = hasEncrypted
      ? 'encrypted'
      : hasImage
        ? 'image'
        : 'text';

    const msgData = {
      from: username,
      to,
      body: hasEncrypted ? '' : finalBody,
      type: messageType,
      image: finalImage,
      encrypted: hasEncrypted ? encrypted : null,
      ts: now,
      participants,
      participantsArr,
      createdAt: new Date(now),
    };

    const msgRef = await db.collection('messages').add(msgData);

    const convRef = db.collection('conversations').doc(participants);

    const lastBody = hasImage
      ? (finalBody ? `Image: ${finalBody}` : '[Image]')
      : hasEncrypted
        ? '[Encrypted]'
        : finalBody;

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

    const topic = `user_${to}`;

    const fcmPayload = {
      notification: {
        title: username,
        body: lastBody,
      },
      data: {
        sender: username,
        toUser: to,
        msg: finalBody,
        ts: String(now),
        type: hasImage ? 'image' : messageType,
        imageUrl: finalImage?.url || '',
        imageWidth: String(finalImage?.width || 0),
        imageHeight: String(finalImage?.height || 0),
      },
      topic,
    };

    try {
      await messaging.send(fcmPayload);
    } catch (err) {
      console.error('send: FCM error', err);
    }

    return NextResponse.json({
      ok: true,
      id: msgRef.id,
      ts: now,
      type: messageType,
      image: finalImage,
    });
  } catch (err) {
    console.error('send: server error', err);
    return NextResponse.json(
      { ok: false, error: 'server error' },
      { status: 500 }
    );
  }
}