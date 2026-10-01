# iSpy

LAN baby-monitor app for **Android and iOS**. The same build can be the **camera** or the **viewer**.

- Camera phone captures video + one-way audio, hosts signaling on `:8765`, and streams with WebRTC
- Viewer phone on the same Wi‑Fi connects with the camera LAN IP + PIN
- Shared PIN gate before SDP exchange
- Android: foreground service + partial wake lock so streaming can continue with the screen off
- iOS: keep the camera app in the foreground (iOS does not allow sustained background camera capture)

## Requirements

- Development build (not Expo Go) — WebRTC and the local signaling server need native code
- Same Wi‑Fi for camera and viewer
- Camera, microphone, and (Android) notification permissions

## Develop

```bash
npm install
npx expo prebuild
npx expo run:android   # or run:ios
```

Or build a dev client with EAS (`eas build --profile development`).

## Use

1. On the camera phone, open **Camera**, grant permissions, tap **Start streaming**.
2. Note the **LAN IP** and **PIN**.
3. On the viewer phone, open **Viewer**, enter that IP + PIN, tap **Connect**.
4. On Android you can lock the camera phone; the stream should continue.
5. On iOS keep the camera app open / screen on while streaming.

## Architecture

- UI: Expo Router (`src/app`) — home role picker, camera, viewer
- Media: `react-native-webrtc` (send-only camera offer, viewer answer)
- Signaling: local Expo module `modules/ispy-signaling` — WebSocket server on the camera device (`/ws`), PIN auth, single viewer
- Protocol (JSON over WS): `hello` → `welcome` → `offer` / `answer` / `ice` / `bye`

This merges the former native `ispy-camera` Android app into this Expo app so one codebase covers both roles.
