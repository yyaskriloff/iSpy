import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';

import '@/lib/webrtc-setup';
import { useViewerSession } from '@/hooks/use-viewer-session';

export default function ViewerScreen() {
  const insets = useSafeAreaInsets();
  const session = useViewerSession();
  const connected = session.status === 'connecting' || session.status === 'connected';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {session.remoteStream ? (
        <RTCView
          streamURL={session.remoteStream.toURL()}
          style={styles.video}
          objectFit="contain"
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Live video will show here</Text>
        </View>
      )}

      <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Viewer</Text>
        </View>

        <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panel} keyboardShouldPersistTaps="handled">
          <Text style={styles.status}>{session.statusText}</Text>

          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeChip, session.mode === 'discovered' && styles.modeChipActive]}
              disabled={connected}
              onPress={() => session.setMode('discovered')}>
              <Text style={styles.modeChipText}>Discovered</Text>
            </Pressable>
            <Pressable
              style={[styles.modeChip, session.mode === 'manual' && styles.modeChipActive]}
              disabled={connected}
              onPress={() => session.setMode('manual')}>
              <Text style={styles.modeChipText}>Manual IP</Text>
            </Pressable>
          </View>

          {session.mode === 'discovered' ? (
            <View style={styles.section}>
              <Text style={styles.label}>
                {session.browsing ? 'Scanning Wi‑Fi…' : 'Nearby cameras'}
              </Text>
              {session.cameras.length === 0 ? (
                <Text style={styles.hint}>
                  No cameras found yet. Make sure the camera phone is streaming with Discoverable on.
                </Text>
              ) : (
                session.cameras.map((camera) => {
                  const selected = session.selectedCameraId === camera.id;
                  return (
                    <Pressable
                      key={camera.id}
                      disabled={connected}
                      onPress={() => session.selectCamera(camera)}
                      style={[styles.cameraRow, selected && styles.cameraRowSelected]}>
                      <Text style={styles.cameraName}>{camera.name}</Text>
                      <Text style={styles.cameraMeta}>
                        {camera.host}:{camera.port}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.label}>Camera LAN IP</Text>
              <TextInput
                value={session.host}
                onChangeText={session.setHost}
                placeholder="192.168.1.42"
                placeholderTextColor="#64748B"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                editable={!connected}
                style={styles.input}
              />
            </View>
          )}

          <Text style={styles.label}>PIN</Text>
          <TextInput
            value={session.pin}
            onChangeText={session.setPin}
            placeholder="1234"
            placeholderTextColor="#64748B"
            keyboardType="number-pad"
            maxLength={4}
            editable={!connected}
            style={styles.input}
          />

          {session.error ? <Text style={styles.error}>{session.error}</Text> : null}

          <Pressable
            style={[styles.cta, connected ? styles.ctaStop : styles.ctaStart]}
            onPress={() => {
              if (connected) session.disconnect();
              else void session.connect();
            }}>
            <Text style={styles.ctaText}>{connected ? 'Disconnect' : 'Connect'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    ...StyleSheet.absoluteFill,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1220',
  },
  placeholderText: {
    color: '#A8B3C7',
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
  panelScroll: {
    maxHeight: '70%',
  },
  panel: {
    backgroundColor: 'rgba(11,18,32,0.9)',
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  status: {
    color: '#F4F7FB',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  modeChip: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modeChipActive: {
    backgroundColor: '#1F6FEB',
    borderColor: '#1F6FEB',
  },
  modeChipText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 14,
  },
  section: {
    gap: 8,
  },
  label: {
    color: '#A8B3C7',
    fontSize: 13,
    marginTop: 4,
  },
  hint: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  cameraRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  cameraRowSelected: {
    borderColor: '#1F6FEB',
    backgroundColor: '#172554',
  },
  cameraName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraMeta: {
    color: '#A8B3C7',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 16,
  },
  error: {
    color: '#FDA4AF',
    fontSize: 14,
  },
  cta: {
    marginTop: 10,
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
