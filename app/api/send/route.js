// app/api/send/route.js
import { NextResponse } from "next/server";
import { db, messaging } from "../../../lib/firebaseAdmin"; 

export async function POST(req) {
  try {
    const { username, password, to, body } = await req.json();

    if (!username || !password || !to || !body) {
      return NextResponse.json(
        { ok: false, error: "missing fields" },
        { status: 400 }
      );
    }

    // 1) auth sender
    const userRef = db.collection("users").doc(username);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "user not found" },
        { status: 401 }
      );
    }

    const data = snap.data();
    if (data.password !== password) {
      return NextResponse.json(
        { ok: false, error: "invalid password" },
        { status: 401 }
      );
    }

    // 2) save message
    const ts = Date.now();
    const participantsKey = [username, to].sort().join("_");

    const msgDoc = await db.collection("messages").add({
      from: username,
      to,
      body,
      ts,
      participants: participantsKey,
    });

    // 3) send FCM to the receiver's personal topic
    await messaging.send({
      topic: `user_${to}`,
      notification: {
        title: username,
        body,
      },
      data: {
        from: username,
        body,
      },
    });

    return NextResponse.json({ ok: true, id: msgDoc.id });
  } catch (e) {
    console.error("send error", e);
    return NextResponse.json(
      { ok: false, error: "server error" },
      { status: 500 }
    );
  }
}
