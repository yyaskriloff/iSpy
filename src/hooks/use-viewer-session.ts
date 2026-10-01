import { useEffect, useRef, useState } from 'react';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import { useKeepAwake } from 'expo-keep-awake';

import { STREAM_CONFIG, wsUrlForHost } from '@/lib/stream-config';
import { loadLastHost, saveLastHost, loadOrCreatePin } from '@/lib/pin-store';

type Status = 'idle' | 'connecting' | 'connected' | 'error';

type ViewerSession = {
  status: Status;
  statusText: string;
  host: string;
  pin: string;
  remoteStream: MediaStream | null;
  error: string | null;
  setHost: (host: string) => void;
  setPin: (pin: string) => void;
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
  const [statusText, setStatusText] = useState('Enter camera IP and PIN');
  const [host, setHost] = useState('');
  const [pin, setPin] = useState('');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      setHost(await loadLastHost());
      setPin(await loadOrCreatePin());
    })();
    return () => {
      intentionalCloseRef.current = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function disposePeer() {
    try {
      pcRef.current?.close();
    } catch {
      // ignore
    }
    pcRef.current = null;
  }

  function cleanup() {
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
          cleanup();
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
    cleanup();
    intentionalCloseRef.current = false;
    setError(null);
    setStatus('connecting');
    setStatusText('Connecting…');

    const trimmedHost = host.trim();
    if (!trimmedHost) {
      setStatus('error');
      setStatusText('Enter the camera phone LAN IP');
      setError('Missing host');
      return;
    }
    if (!/^\d{4}$/.test(pin.trim())) {
      setStatus('error');
      setStatusText('PIN must be 4 digits');
      setError('Invalid PIN');
      return;
    }

    await saveLastHost(trimmedHost);
    const url = wsUrlForHost(trimmedHost);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'hello',
            role: 'viewer',
            pin: pin.trim(),
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
          setStatusText('Disconnected');
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
    cleanup();
    setStatus('idle');
    setStatusText('Disconnected');
  }

  return {
    status,
    statusText,
    host,
    pin,
    remoteStream,
    error,
    setHost,
    setPin,
    connect,
    disconnect,
  };
}
