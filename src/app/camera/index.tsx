import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';

import { useCameraSessionContext } from '@/hooks/camera-session-context';

export default function CameraPreviewScreen() {
  const insets = useSafeAreaInsets();
  const session = useCameraSessionContext();
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
          <Text style={styles.placeholderText}>
            {session.previewError
              ? session.previewError
              : 'Starting camera preview…'}
          </Text>
          {session.previewError ? (
            <Pressable
              style={styles.retry}
              onPress={() => {
                void session.retryPreview();
              }}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View
        style={[
          styles.chrome,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 },
        ]}
        pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.chip}>
            <Text style={styles.chipText}>Back</Text>
          </Pressable>
          <Text style={styles.status} numberOfLines={1}>
            {session.statusText}
          </Text>
          <Pressable onPress={() => router.push('/camera/settings')} style={styles.chip}>
            <Text style={styles.chipText}>Settings</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.cta, streaming ? styles.ctaStop : styles.ctaStart]}
          onPress={() => {
            if (streaming) void session.stop();
            else void session.start();
          }}>
          <Text style={styles.ctaText}>{streaming ? 'Stop' : 'Start'}</Text>
        </Pressable>
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
    gap: 16,
  },
  placeholderText: {
    color: '#A8B3C7',
    textAlign: 'center',
    fontSize: 16,
  },
  retry: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#1F6FEB',
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  chrome: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  chipText: {
    color: '#fff',
    fontWeight: '600',
  },
  status: {
    flex: 1,
    color: '#F4F7FB',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cta: {
    alignSelf: 'center',
    minWidth: 160,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
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
