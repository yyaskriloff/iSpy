# iSpy

LAN baby-monitor app for **Android and iOS**. The same build can be the **camera** or the **viewer**.

- Camera phone captures video + one-way audio, hosts signaling on `:8765`, and streams with WebRTC
- **Discoverable** (default on): camera advertises on Wi‑Fi via mDNS (`_ispy._tcp`) so viewers can find it; PIN is still required
- **Manual**: Discoverable off — viewers enter the camera LAN IP themselves
- Shared PIN gate before SDP exchange (PIN is never included in discovery)
- Android: foreground service + partial wake lock so streaming can continue with the screen off
- iOS: keep the camera app in the foreground (iOS does not allow sustained background camera capture)

## Requirements

- Development build (not Expo Go) — WebRTC and the local signaling server need native code
- Same Wi‑Fi for camera and viewer
- Camera, microphone, local network, and (Android) notification permissions

## Develop

```bash
npm install
npx expo prebuild
npx expo run:android   # or run:ios
```

Or build a dev client with EAS (`eas build --profile development`).

## Use

### Camera phone

1. Open **Camera**, grant permissions.
2. Leave **Discoverable** on if viewers should see this camera on the LAN; turn it off for manual IP-only pairing.
3. Tap **Start streaming**. Share the on-screen **PIN** (and LAN IP if Discoverable is off).

### Viewer phone

1. Open **Viewer** on the same Wi‑Fi.
2. **Discovered**: pick the camera from the list, enter the PIN, tap **Connect**.
3. **Manual IP**: enter the camera LAN IP + PIN, tap **Connect**.
4. On Android you can lock the camera phone; the stream should continue.
5. On iOS keep the camera app open / screen on while streaming.

## Architecture

- UI: Expo Router (`src/app`) — home role picker, camera, viewer
- Media: `react-native-webrtc` (send-only camera offer, viewer answer)
- Signaling: local Expo module `modules/ispy-signaling` — WebSocket server on the camera device (`/ws`), PIN auth, single viewer
- Discovery: same module advertises/browses `_ispy._tcp` (name + host + port only)
- Protocol (JSON over WS): `hello` → `welcome` → `offer` / `answer` / `ice` / `bye`

This merges the former native `ispy-camera` Android app into this Expo app so one codebase covers both roles.
