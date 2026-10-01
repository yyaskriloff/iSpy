import { router } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewerSessionContext } from '@/hooks/viewer-session-context';

export default function ViewerConnectScreen() {
  const insets = useSafeAreaInsets();
  const session = useViewerSessionContext();
  const connecting = session.status === 'connecting';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.inner, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Viewer</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.panel}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.status}>{session.statusText}</Text>

          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeChip, session.mode === 'discovered' && styles.modeChipActive]}
              disabled={connecting}
              onPress={() => session.setMode('discovered')}>
              <Text style={styles.modeChipText}>Discovered</Text>
            </Pressable>
            <Pressable
              style={[styles.modeChip, session.mode === 'manual' && styles.modeChipActive]}
              disabled={connecting}
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
                  No cameras found yet. Make sure the camera phone is streaming with Discoverable
                  on.
                </Text>
              ) : (
                session.cameras.map((camera) => {
                  const selected = session.selectedCameraId === camera.id;
                  return (
                    <Pressable
                      key={camera.id}
                      disabled={connecting}
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
                editable={!connecting}
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
            editable={!connecting}
            style={styles.input}
          />

          {session.error ? <Text style={styles.error}>{session.error}</Text> : null}

          <Pressable
            style={[styles.cta, connecting ? styles.ctaDisabled : styles.ctaStart]}
            disabled={connecting}
            onPress={() => {
              void (async () => {
                const ok = await session.connect();
                if (ok) router.replace('/viewer/watch');
              })();
            }}>
            <Text style={styles.ctaText}>{connecting ? 'Connecting…' : 'Connect'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
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
  scroll: {
    flex: 1,
  },
  panel: {
    backgroundColor: 'rgba(11,18,32,0.9)',
    borderRadius: 18,
    padding: 16,
    gap: 8,
    paddingBottom: 24,
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
  ctaDisabled: {
    backgroundColor: '#334155',
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
