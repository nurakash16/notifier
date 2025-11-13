// app/api/thread/route.js
import { db } from '../../../lib/firebaseAdmin';
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");
    const password = searchParams.get("password");
    const other = searchParams.get("with");

    if (!username || !password || !other) {
      return NextResponse.json(
        { ok: false, error: "missing fields" },
        { status: 400 }
      );
    }

    // auth
    const userRef = db.collection("users").doc(username);
    const snap = await userRef.get();
    if (!snap.exists || snap.data().password !== password) {
      return NextResponse.json(
        { ok: false, error: "auth failed" },
        { status: 401 }
      );
    }

    const participantsKey = [username, other].sort().join("_");

    // query messages in this conversation
    const qSnap = await db
      .collection("messages")
      .where("participants", "==", participantsKey)
      .orderBy("ts")
      .get();

    const messages = qSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({ ok: true, messages });
  } catch (e) {
    console.error("thread error", e);
    return NextResponse.json(
      { ok: false, error: "server error" },
      { status: 500 }
    );
  }
}

