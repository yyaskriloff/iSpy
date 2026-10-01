import { useEffect, useRef, useState } from 'react';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import { Platform } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import type { EventSubscription } from 'expo-modules-core';

import IspySignaling from 'ispy-signaling';
import { preferHwH264, STREAM_CONFIG } from '@/lib/stream-config';
import {
  loadCameraName,
  loadDiscoverable,
  loadOrCreatePin,
  saveDiscoverable,
} from '@/lib/pin-store';

type Status = 'idle' | 'starting' | 'waiting' | 'connected' | 'error';

export type CameraSession = {
  status: Status;
  statusText: string;
  pin: string;
  host: string;
  wsUrl: string;
  localStream: MediaStream | null;
  error: string | null;
  previewError: string | null;
  discoverable: boolean;
  setDiscoverable: (enabled: boolean) => Promise<void>;
  retryPreview: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

function waitingText(discoverable: boolean): string {
  if (Platform.OS === 'ios') {
    return discoverable
      ? 'Discoverable on Wi‑Fi — waiting for viewer (keep app open)'
      : 'Manual mode — share LAN IP + PIN (keep app open)';
  }
  return discoverable
    ? 'Discoverable on Wi‑Fi — waiting for viewer'
    : 'Manual mode — share LAN IP + PIN';
}

export function useCameraSession(): CameraSession {
  useKeepAwake();

  const [status, setStatus] = useState<Status>('idle');
  const [statusText, setStatusText] = useState('Ready');
  const [pin, setPin] = useState('');
  const [host, setHost] = useState('');
  const [wsUrl, setWsUrl] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [discoverable, setDiscoverableState] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const discoverableRef = useRef(true);
  const previewErrorRef = useRef<string | null>(null);
  const subscriptionsRef = useRef<EventSubscription[]>([]);
  const previewPromiseRef = useRef<Promise<MediaStream | null> | null>(null);

  useEffect(() => {
    void (async () => {
      const enabled = await loadDiscoverable();
      discoverableRef.current = enabled;
      setDiscoverableState(enabled);
    })();
    void ensurePreview();
    return () => {
      void teardownAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearSubscriptions() {
    subscriptionsRef.current.forEach((s) => s.remove());
    subscriptionsRef.current = [];
  }

  function disposePeer() {
    try {
      pcRef.current?.close();
    } catch {
      // ignore
    }
    pcRef.current = null;
  }

  function stopPreviewTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLocalStream(null);
  }

  async function syncAdvertising(enabled: boolean) {
    if (!runningRef.current) {
      try {
        await IspySignaling.stopAdvertising();
      } catch {
        // ignore
      }
      return;
    }
    if (enabled) {
      const name = await loadCameraName();
      await IspySignaling.startAdvertising(name, STREAM_CONFIG.signalingPort);
    } else {
      await IspySignaling.stopAdvertising();
    }
  }

  /** Tear down signaling/peer/advertising but keep local preview tracks. */
  async function stopStreaming() {
    runningRef.current = false;
    sessionIdRef.current = null;
    clearSubscriptions();
    try {
      await IspySignaling.stopAdvertising();
    } catch {
      // ignore
    }
    try {
      await IspySignaling.sendBye();
    } catch {
      // ignore
    }
    try {
      await IspySignaling.stopServer();
    } catch {
      // ignore
    }
    disposePeer();
    setHost('');
    setWsUrl('');
    setStatus('idle');
    setStatusText('Ready');
  }

  /** Full teardown including camera/mic tracks — only on unmount. */
  async function teardownAll() {
    await stopStreaming();
    stopPreviewTracks();
    previewPromiseRef.current = null;
    setPreviewError(null);
    setStatusText('Stopped');
  }

  async function ensurePreview(): Promise<MediaStream | null> {
    if (streamRef.current) return streamRef.current;
    if (previewPromiseRef.current) return previewPromiseRef.current;

    previewPromiseRef.current = (async () => {
      previewErrorRef.current = null;
      setPreviewError(null);
      try {
        const media = (await mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: 'environment',
            width: STREAM_CONFIG.width,
            height: STREAM_CONFIG.height,
            frameRate: STREAM_CONFIG.fps,
          },
        })) as MediaStream;

        streamRef.current = media;
        setLocalStream(media);
        return media;
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Camera or microphone permission denied';
        previewErrorRef.current = message;
        setPreviewError(message);
        streamRef.current = null;
        setLocalStream(null);
        return null;
      } finally {
        previewPromiseRef.current = null;
      }
    })();

    return previewPromiseRef.current;
  }

  async function retryPreview() {
    stopPreviewTracks();
    previewPromiseRef.current = null;
    await ensurePreview();
  }

  async function createOfferForViewer(sessionId: string) {
    disposePeer();
    sessionIdRef.current = sessionId;
    const stream = streamRef.current;
    if (!stream) return;

    const pc = new RTCPeerConnection({
      iceServers: [...STREAM_CONFIG.iceServers],
    });
    pcRef.current = pc;

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // @ts-expect-error react-native-webrtc event typing
    pc.onicecandidate = (event) => {
      const candidate = event.candidate;
      if (!candidate) return;
      void IspySignaling.sendIce(
        candidate.candidate,
        candidate.sdpMid,
        candidate.sdpMLineIndex,
      );
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        setStatus('connected');
        setStatusText('Viewer connected');
      } else if (state === 'disconnected') {
        setStatusText('ICE disconnected');
      } else if (state === 'failed') {
        setStatusText('ICE failed — reconnecting');
        setTimeout(() => {
          if (runningRef.current && sessionIdRef.current === sessionId) {
            void createOfferForViewer(sessionId);
          }
        }, STREAM_CONFIG.iceRestartDelayMs);
      }
    };

    const offer = await pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    const tunedSdp = preferHwH264(offer.sdp ?? '');
    await pc.setLocalDescription({ type: offer.type, sdp: tunedSdp });
    await IspySignaling.sendOffer(tunedSdp);
    setStatusText('Offer sent — waiting for answer');
  }

  async function setDiscoverable(enabled: boolean) {
    discoverableRef.current = enabled;
    setDiscoverableState(enabled);
    await saveDiscoverable(enabled);
    try {
      await syncAdvertising(enabled);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update discovery';
      setError(message);
    }
    if (runningRef.current && status !== 'connected') {
      setStatusText(waitingText(enabled));
    }
  }

  async function start() {
    if (runningRef.current) return;
    setError(null);
    setStatus('starting');
    setStatusText('Starting stream…');

    try {
      const media = await ensurePreview();
      if (!media) {
        const message = previewErrorRef.current ?? 'Camera preview unavailable';
        setError(message);
        setStatus('error');
        setStatusText(message);
        return;
      }

      const nextPin = await loadOrCreatePin();
      setPin(nextPin);

      const info = await IspySignaling.startServer(STREAM_CONFIG.signalingPort, nextPin);
      setHost(info.host);
      setWsUrl(info.wsUrl);
      runningRef.current = true;

      if (discoverableRef.current) {
        await syncAdvertising(true);
      }

      setStatus('waiting');
      setStatusText(waitingText(discoverableRef.current));

      clearSubscriptions();
      subscriptionsRef.current = [
        IspySignaling.addListener('onViewerAuthenticated', (event) => {
          setStatusText('Viewer authenticated — creating offer');
          void createOfferForViewer(event.sessionId);
        }),
        IspySignaling.addListener('onViewerAnswer', async (event) => {
          const pc = pcRef.current;
          if (!pc || sessionIdRef.current !== event.sessionId) return;
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: event.sdp }),
          );
          setStatusText('Answer applied');
        }),
        IspySignaling.addListener('onViewerIce', async (event) => {
          const pc = pcRef.current;
          if (!pc || sessionIdRef.current !== event.sessionId) return;
          try {
            await pc.addIceCandidate(
              new RTCIceCandidate({
                candidate: event.candidate,
                sdpMid: event.sdpMid ?? undefined,
                sdpMLineIndex: event.sdpMLineIndex ?? undefined,
              }),
            );
          } catch {
            // ignore late candidates
          }
        }),
        IspySignaling.addListener('onViewerDisconnected', () => {
          disposePeer();
          sessionIdRef.current = null;
          if (runningRef.current) {
            setStatus('waiting');
            setStatusText(waitingText(discoverableRef.current));
          }
        }),
      ];
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to start stream';
      setError(message);
      setStatus('error');
      setStatusText(message);
      await stopStreaming();
    }
  }

  async function stop() {
    await stopStreaming();
  }

  return {
    status,
    statusText,
    pin,
    host,
    wsUrl,
    localStream,
    error,
    previewError,
    discoverable,
    setDiscoverable,
    retryPreview,
    start,
    stop,
  };
}
