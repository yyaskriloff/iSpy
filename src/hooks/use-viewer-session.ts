import { useEffect, useRef, useState } from 'react';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import { useKeepAwake } from 'expo-keep-awake';
import type { EventSubscription } from 'expo-modules-core';
import type { DiscoveredCamera } from 'ispy-signaling';
import IspySignaling from 'ispy-signaling';

import { STREAM_CONFIG, wsUrlForHost } from '@/lib/stream-config';
import { loadLastHost, saveLastHost } from '@/lib/pin-store';

type Status = 'idle' | 'connecting' | 'connected' | 'error';
type ConnectMode = 'discovered' | 'manual';

type ViewerSession = {
  status: Status;
  statusText: string;
  mode: ConnectMode;
  setMode: (mode: ConnectMode) => void;
  host: string;
  pin: string;
  remoteStream: MediaStream | null;
  error: string | null;
  cameras: DiscoveredCamera[];
  selectedCameraId: string | null;
  browsing: boolean;
  setHost: (host: string) => void;
  setPin: (pin: string) => void;
  selectCamera: (camera: DiscoveredCamera) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
};

type SignalMessage = {
  type: string;
  sdp?: string;
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
  code?: string;
  message?: string;
  role?: string;
};

export function useViewerSession(): ViewerSession {
  useKeepAwake();

  const [status, setStatus] = useState<Status>('idle');
  const [statusText, setStatusText] = useState('Choose a camera and enter the PIN');
  const [mode, setModeState] = useState<ConnectMode>('discovered');
  const [host, setHost] = useState('');
  const [pin, setPin] = useState('');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<DiscoveredCamera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const browseSubsRef = useRef<EventSubscription[]>([]);
  const hostRef = useRef('');
  const pinRef = useRef('');
  const modeRef = useRef<ConnectMode>('discovered');

  useEffect(() => {
    hostRef.current = host;
  }, [host]);
  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    void (async () => {
      setHost(await loadLastHost());
    })();
    return () => {
      intentionalCloseRef.current = true;
      cleanupConnection();
      stopBrowse();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'discovered' && status === 'idle') {
      void startBrowse();
    } else if (mode === 'manual') {
      stopBrowse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function stopBrowse() {
    browseSubsRef.current.forEach((s) => s.remove());
    browseSubsRef.current = [];
    void IspySignaling.stopBrowse().catch(() => undefined);
    setBrowsing(false);
  }

  async function startBrowse() {
    stopBrowse();
    setCameras([]);
    setBrowsing(true);
    browseSubsRef.current = [
      IspySignaling.addListener('onCameraFound', (camera) => {
        setCameras((prev) => {
          const without = prev.filter((c) => c.id !== camera.id);
          return [...without, camera].sort((a, b) => a.name.localeCompare(b.name));
        });
      }),
      IspySignaling.addListener('onCameraLost', (event) => {
        setCameras((prev) => prev.filter((c) => c.id !== event.id));
        setSelectedCameraId((current) => (current === event.id ? null : current));
      }),
    ];
    try {
      await IspySignaling.startBrowse();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Discovery failed';
      setError(message);
      setBrowsing(false);
    }
  }

  function setMode(next: ConnectMode) {
    setModeState(next);
    setError(null);
    if (next === 'discovered') {
      setStatusText('Choose a camera and enter the PIN');
    } else {
      setStatusText('Enter camera IP and PIN');
    }
  }

  function selectCamera(camera: DiscoveredCamera) {
    setSelectedCameraId(camera.id);
    setHost(camera.host);
  }

  function disposePeer() {
    try {
      pcRef.current?.close();
    } catch {
      // ignore
    }
    pcRef.current = null;
  }

  function cleanupConnection() {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    try {
      wsRef.current?.close();
    } catch {
      // ignore
    }
    wsRef.current = null;
    disposePeer();
    setRemoteStream(null);
  }

  function scheduleReconnect() {
    if (intentionalCloseRef.current) return;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    setStatusText('Reconnecting…');
    reconnectTimerRef.current = setTimeout(() => {
      void connectInternal();
    }, 2000);
  }

  async function ensurePeer(): Promise<RTCPeerConnection> {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({
      iceServers: [...STREAM_CONFIG.iceServers],
    });
    pcRef.current = pc;

    // @ts-expect-error react-native-webrtc event typing
    pc.ontrack = (event) => {
      const stream = event.streams?.[0] as MediaStream | undefined;
      if (stream) {
        setRemoteStream(stream);
        setStatus('connected');
        setStatusText('Live');
      }
    };

    // @ts-expect-error react-native-webrtc event typing
    pc.onicecandidate = (event) => {
      const candidate = event.candidate;
      const ws = wsRef.current;
      if (!candidate || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: 'ice',
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        }),
      );
    };

    // @ts-expect-error react-native-webrtc event typing
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed' || state === 'disconnected') {
        setStatusText(`ICE ${state}`);
        if (state === 'failed') {
          disposePeer();
          scheduleReconnect();
        }
      }
    };

    return pc;
  }

  async function handleMessage(raw: string) {
    let msg: SignalMessage;
    try {
      msg = JSON.parse(raw) as SignalMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'welcome':
        setStatusText('Authenticated — waiting for offer');
        break;
      case 'offer': {
        if (!msg.sdp) return;
        const pc = await ensurePeer();
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsRef.current?.send(
          JSON.stringify({
            type: 'answer',
            sdp: answer.sdp,
          }),
        );
        setStatusText('Answer sent');
        break;
      }
      case 'ice': {
        if (!msg.candidate) return;
        const pc = pcRef.current;
        if (!pc) return;
        try {
          await pc.addIceCandidate(
            new RTCIceCandidate({
              candidate: msg.candidate,
              sdpMid: msg.sdpMid,
              sdpMLineIndex: msg.sdpMLineIndex,
            }),
          );
        } catch {
          // ignore
        }
        break;
      }
      case 'error':
        setError(msg.message ?? msg.code ?? 'Signaling error');
        setStatus('error');
        setStatusText(msg.message ?? 'Error');
        if (msg.code === 'bad_pin') {
          intentionalCloseRef.current = true;
          cleanupConnection();
        }
        break;
      case 'bye':
        setStatusText('Camera ended stream');
        disposePeer();
        setRemoteStream(null);
        scheduleReconnect();
        break;
      default:
        break;
    }
  }

  async function connectInternal() {
    cleanupConnection();
    intentionalCloseRef.current = false;
    setError(null);
    setStatus('connecting');
    setStatusText('Connecting…');

    const trimmedHost = hostRef.current.trim();
    const trimmedPin = pinRef.current.trim();

    if (!trimmedHost) {
      setStatus('error');
      setStatusText(
        modeRef.current === 'discovered'
          ? 'Select a discovered camera'
          : 'Enter the camera phone LAN IP',
      );
      setError(modeRef.current === 'discovered' ? 'No camera selected' : 'Missing host');
      return;
    }
    if (!/^\d{4}$/.test(trimmedPin)) {
      setStatus('error');
      setStatusText('PIN must be 4 digits');
      setError('Invalid PIN');
      return;
    }

    await saveLastHost(trimmedHost);
    const url = wsUrlForHost(trimmedHost);

    // Pause browsing while connected to reduce chatter.
    if (modeRef.current === 'discovered') {
      stopBrowse();
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'hello',
            role: 'viewer',
            pin: trimmedPin,
          }),
        );
        setStatusText('Connected — authenticating');
      };

      ws.onmessage = (event) => {
        const data = typeof event.data === 'string' ? event.data : '';
        void handleMessage(data);
      };

      ws.onerror = () => {
        setStatusText('WebSocket error');
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!intentionalCloseRef.current) {
          setStatus('connecting');
          scheduleReconnect();
        } else {
          setStatus('idle');
          setStatusText(
            modeRef.current === 'discovered'
              ? 'Choose a camera and enter the PIN'
              : 'Enter camera IP and PIN',
          );
        }
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Connection failed';
      setError(message);
      setStatus('error');
      setStatusText(message);
    }
  }

  async function connect() {
    intentionalCloseRef.current = false;
    await connectInternal();
  }

  function disconnect() {
    intentionalCloseRef.current = true;
    cleanupConnection();
    setStatus('idle');
    setStatusText(
      modeRef.current === 'discovered'
        ? 'Choose a camera and enter the PIN'
        : 'Enter camera IP and PIN',
    );
    if (modeRef.current === 'discovered') {
      void startBrowse();
    }
  }

  return {
    status,
    statusText,
    mode,
    setMode,
    host,
    pin,
    remoteStream,
    error,
    cameras,
    selectedCameraId,
    browsing,
    setHost,
    setPin,
    selectCamera,
    connect,
    disconnect,
  };
}
