export type ServerStartResult = {
  port: number
  pin: string
  host: string
  wsUrl: string
}

export type ViewerAuthenticatedEvent = {
  sessionId: string
}

export type ViewerAnswerEvent = {
  sessionId: string
  sdp: string
}

export type ViewerIceEvent = {
  sessionId: string
  candidate: string
  sdpMid?: string
  sdpMLineIndex?: number
}

export type ViewerDisconnectedEvent = {
  sessionId: string
}

export type ServerErrorEvent = {
  message: string
}

export type DiscoveredCamera = {
  id: string
  name: string
  host: string
  port: number
}

export type CameraFoundEvent = DiscoveredCamera

export type CameraLostEvent = {
  id: string
}

export type IspySignalingEvents = {
  onViewerAuthenticated: (event: ViewerAuthenticatedEvent) => void
  onViewerAnswer: (event: ViewerAnswerEvent) => void
  onViewerIce: (event: ViewerIceEvent) => void
  onViewerDisconnected: (event: ViewerDisconnectedEvent) => void
  onServerError: (event: ServerErrorEvent) => void
  onCameraFound: (event: CameraFoundEvent) => void
  onCameraLost: (event: CameraLostEvent) => void
}
