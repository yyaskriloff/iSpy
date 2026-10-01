import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';

import '@/lib/webrtc-setup';
import { useCameraSession } from '@/hooks/use-camera-session';
import { STREAM_CONFIG } from '@/lib/stream-config';

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const session = useCameraSession();
  const streaming =
    session.status === 'starting' || session.status === 'waiting' || session.status === 'connected';

  return (
    <View style={styles.root}>
      {session.localStream ? (
        <RTCView
          streamURL={session.localStream.toURL()}
          style={styles.preview}
          objectFit="cover"
          mirror={false}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Camera preview appears after you start streaming</Text>
        </View>
      )}

      <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Camera</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Discoverable</Text>
              <Text style={styles.settingBody}>
                When on, viewers on this Wi‑Fi can see this camera. They still need the PIN to watch.
              </Text>
            </View>
            <Switch
              value={session.discoverable}
              onValueChange={(value) => {
                void session.setDiscoverable(value);
              }}
              trackColor={{ false: '#334155', true: '#1F6FEB' }}
              thumbColor="#F8FAFC"
            />
          </View>

          <Text style={styles.status}>{session.statusText}</Text>
          {session.host ? (
            <Text style={styles.meta}>
              LAN IP {session.host}:{STREAM_CONFIG.signalingPort}
            </Text>
          ) : null}
          {session.pin ? <Text style={styles.pin}>PIN {session.pin}</Text> : null}
          {session.error ? <Text style={styles.error}>{session.error}</Text> : null}

          <Pressable
            style={[styles.cta, streaming ? styles.ctaStop : styles.ctaStart]}
            onPress={() => {
              if (streaming) void session.stop();
              else void session.start();
            }}>
            <Text style={styles.ctaText}>{streaming ? 'Stop streaming' : 'Start streaming'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  preview: {
    ...StyleSheet.absoluteFill,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1220',
    padding: 24,
  },
  placeholderText: {
    color: '#A8B3C7',
    textAlign: 'center',
    fontSize: 16,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  back: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backText: {
    color: '#fff',
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  panel: {
    backgroundColor: 'rgba(11,18,32,0.82)',
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  settingCopy: {
    flex: 1,
    gap: 4,
  },
  settingTitle: {
    color: '#F4F7FB',
    fontSize: 16,
    fontWeight: '700',
  },
  settingBody: {
    color: '#A8B3C7',
    fontSize: 13,
    lineHeight: 18,
  },
  status: {
    color: '#F4F7FB',
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: '#A8B3C7',
    fontSize: 14,
  },
  pin: {
    color: '#7DD3FC',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 4,
    marginVertical: 4,
  },
  error: {
    color: '#FDA4AF',
    fontSize: 14,
  },
  cta: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaStart: {
    backgroundColor: '#1F6FEB',
  },
  ctaStop: {
    backgroundColor: '#BE123C',
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
