export const STREAM_CONFIG = {
  width: 1280,
  height: 720,
  fps: 15,
  signalingPort: 8765,
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  iceRestartDelayMs: 1500,
  /** Any inbound WS frame resets NanoHTTPD's default 5s SO_TIMEOUT. */
  signalingKeepaliveMs: 2000
} as const

export function generatePin(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

export function preferHwH264(sdp: string): string {
  const lines = sdp.split('\r\n')
  const videoMLineIndex = lines.findIndex(line => line.startsWith('m=video'))
  if (videoMLineIndex < 0) return sdp

  let h264Pt: string | null = null
  for (const line of lines) {
    if (line.startsWith('a=rtpmap:') && /H264\/90000/i.test(line)) {
      h264Pt = line.slice('a=rtpmap:'.length).split(' ')[0] ?? null
      break
    }
  }
  if (!h264Pt) return sdp

  const parts = lines[videoMLineIndex].split(' ')
  if (parts.length > 3) {
    const head = parts.slice(0, 3)
    const pts = parts.slice(3).filter(pt => pt !== h264Pt)
    pts.unshift(h264Pt)
    lines[videoMLineIndex] = [...head, ...pts].join(' ')
  }
  return lines.join('\r\n')
}

export function wsUrlForHost(host: string, port = STREAM_CONFIG.signalingPort): string {
  const cleaned = host
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:.*$/, '')
  return `ws://${cleaned}:${port}/ws`
}
