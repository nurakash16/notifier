# Call QA Checklist (Web)

## Preconditions
- Two test users exist and can log in on separate devices/browsers.
- Browser permissions for microphone/camera can be granted.
- Both users can open the same chat thread.

## Core Flows
1. Outgoing voice call connects and both sides hear audio.
2. Outgoing video call connects and both sides see remote video.
3. Incoming call Accept works for voice and video.
4. Incoming call Reject ends ringing for caller.
5. Caller End closes call for both sides.

## Controls
1. Mute toggles local audio track without ending call.
2. Camera toggle hides/shows local video track.
3. Camera switch changes front/back camera on supported devices.

## Timeouts and Recovery
1. Unanswered outgoing call auto-marks `missed` after ~45s.
2. Unanswered incoming call auto-marks `missed` after ~45s.
3. Refresh during active accepted call restores active call UI state.
4. Closing tab during active call marks call as ended.

## Multi-Tab and Duplication
1. Open same account in two tabs and receive an incoming call.
2. Accept in tab A; verify tab B does not also accept/attach.
3. Ensure only one call UI remains active.

## Logging Verification (Firestore `callLogs/{callId}`)
- `owner`, `peer`, `callType`, `direction`, `status`
- `startedAt`, `endedAt`, `durationSec`
- `endReason` values like `local_hangup`, `local_reject`, `remote_rejected`, `ring_timeout`, `remote_end`
- `networkState` captured from peer connection state
