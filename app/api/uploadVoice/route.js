import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_VOICE_BUCKET = process.env.SUPABASE_VOICE_BUCKET || 'voice-notes';

export async function POST(req) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: 'missing supabase env vars' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const username = formData.get('username') || 'user';

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'no file' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileName = `${username}_${Date.now()}.m4a`;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_VOICE_BUCKET}/${fileName}`;

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': file.type || 'audio/m4a',
        'x-upsert': 'true',
      },
      body: buffer,
    });

    const uploadText = await uploadRes.text();

    if (!uploadRes.ok) {
      return NextResponse.json(
        { ok: false, error: uploadText },
        { status: uploadRes.status }
      );
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_VOICE_BUCKET}/${fileName}`;

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      fileName,
    });
  } catch (err) {
    console.error('uploadVoice error', err);
    return NextResponse.json(
      { ok: false, error: 'voice upload failed' },
      { status: 500 }
    );
  }
}