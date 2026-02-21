import { v2 as cloudinary } from 'cloudinary';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const cloudKey = process.env.CLOUDINARY_API_KEY?.trim();
const cloudSecret = process.env.CLOUDINARY_API_SECRET?.trim();

cloudinary.config({
  cloud_name: cloudName,
  api_key: cloudKey,
  api_secret: cloudSecret,
});

export async function POST(req) {
  try {
    if (!cloudName || !cloudKey || !cloudSecret) {
      return NextResponse.json({ ok: false, error: 'missing cloudinary env vars' }, { status: 500 });
    }
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ ok: false, error: 'no file' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || 'image/jpeg';
    const dataUri = `data:${contentType};base64,${buffer.toString('base64')}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'chat-images',
      resource_type: 'image',
    });

    return NextResponse.json({
      ok: true,
      url: result.secure_url,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      format: result.format,
      publicId: result.public_id,
    });
  } catch (err) {
    console.error('upload: error', err);
    const message =
      err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'error' in err && err.error && typeof err.error === 'object' && 'message' in err.error
          ? String(err.error.message)
          : err && typeof err === 'object' && 'message' in err
            ? String(err.message)
            : typeof err === 'string'
              ? err
              : 'upload failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
