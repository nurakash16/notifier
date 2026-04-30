# Android Feature Integration Handoff (Image Send/Receive Only)

Use this document as context for ChatGPT to implement image messaging in my existing Android app.

## Goal
- Add only:
  - `send image in chat`
  - `receive/show image in chat`
- Use the **same backend** used by this web project.

## Current Backend Stack
- Next.js API routes (`app/api/.../route.js`)
- Firestore (`users`, `messages`, `conversations`)
- Cloudinary for image hosting via `/api/upload`
- Firebase Admin messaging for push notifications

## API Contracts To Follow

### 1) Upload image
- Endpoint: `POST /api/upload`
- Content-Type: `multipart/form-data`
- Form fields:
  - `file` (required): image file
  - `folder` (optional): use `chat-images` for chat images
  - `publicId` (optional): not required for normal chat image send
  - `overwrite` (optional): not required for normal chat image send
- Folder validation on backend allows only:
  - `chat-images`
  - `avatars`

Success response:
```json
{
  "ok": true,
  "url": "https://...",
  "width": 1080,
  "height": 720,
  "bytes": 123456,
  "format": "jpg",
  "publicId": "chat-images/...."
}
```

### 2) Send message with image
- Endpoint: `POST /api/send`
- Web app sends encrypted payload and places image inside encrypted content.

Request body shape used by web:
```json
{
  "username": "alice",
  "password": "plain-currently-not-validated-here",
  "to": "bob",
  "body": "",
  "encrypted": {
    "ciphertext": "...",
    "iv": "...",
    "senderPubKeyJwk": "...",
    "v": 1
  }
}
```

- The decrypted payload contains:
```json
{
  "text": "optional caption text",
  "image": {
    "url": "https://...",
    "width": 1080,
    "height": 720
  }
}
```

### 3) Receive thread messages
- Endpoint: `GET /api/thread?username=<u>&with=<other>&after=<ts>&limit=<n>`
- Returns list of messages; for encrypted messages, Android must decrypt payload to get `image.url`.

## Firestore Message Shape To Match
`messages/{messageId}` includes:
- `from`, `to`
- `participants` (sorted pair joined with `_`, example `alice_bob`)
- `participantsArr` (example `["alice","bob"]`)
- `ts`, `createdAt`
- `type` (`encrypted` or `text`)
- `body`
- `encrypted` object for encrypted messages

For image chat in this app, image metadata is carried inside encrypted payload (not as top-level Firestore image fields).

## Web Client Behavior To Mirror In Android

### Send image flow
1. User picks an image file.
2. Compress before upload:
   - max dimension: `1280`
   - jpeg quality: `0.7`
3. Reject if still too large after compression (web checks approx base64 length > `900000`).
4. Upload compressed image to `/api/upload` with `folder=chat-images`.
5. Take returned `url`, `width`, `height`.
6. Build message payload with image object and optional caption text.
7. Encrypt payload (same encryption scheme as existing app/web flow).
8. Send via `/api/send`.
9. Show optimistic local bubble until confirmed by realtime/thread update.

### Receive image flow
1. Read messages from Firestore realtime listener and/or `/api/thread`.
2. For encrypted messages, decrypt payload.
3. If decrypted payload has `image.url`, render as image message bubble.
4. If payload also has `text`, show it as caption.
5. Use `width/height` for layout ratio when available.

## Push / Notification Note
- `/api/send` also triggers FCM topic notification to `user_<recipient>`.
- Android device should subscribe to `user_<loggedInUsername>` so new message alerts work.

## Constraints / Compatibility Notes
- Keep all backend field names exactly as-is.
- `participants` must be deterministic: sort usernames then join with `_`.
- Current backend accepts `password` in `/api/send`, but sender validation is existence-based.
- Do not introduce a new upload endpoint or schema unless backend is also changed.

## What I Need ChatGPT To Generate For Android
1. API client for:
   - `/api/upload` multipart
   - `/api/send`
   - `/api/thread`
2. Kotlin DTO/models matching current backend contracts.
3. Repository + ViewModel flow for:
   - image pick/compress/upload
   - send encrypted image message
   - receive/decrypt/render image message
4. Compose UI updates:
   - image preview before send
   - image bubble rendering with optional caption
5. Error handling and retry strategy for upload/send failures.
6. Any required Android permissions.

## Prompt I Will Give ChatGPT
```text
I have an existing Android chat app. I need only image messaging integration (send image + receive/show image) using my existing backend. Follow this backend contract exactly (see attached handoff doc). Please generate production-ready Kotlin (Jetpack Compose + ViewModel + Repository + Retrofit/Ktor option) with:
- API clients
- DTO/data models
- image compression + multipart upload implementation
- send image message integration
- receive/decrypt/render image messages
- error handling and retry strategy
- required Android permissions

Do not include message reaction features. Keep field names and payload formats exactly backend-compatible.
```
