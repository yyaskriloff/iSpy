import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useCameraSessionContext } from '@/hooks/camera-session-context';
import { STREAM_CONFIG } from '@/lib/stream-config';

export default function CameraSettingsScreen() {
  const session = useCameraSessionContext();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Camera settings</Text>
        <Pressable onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        ) : (
          <Text style={styles.meta}>LAN IP appears after you start streaming</Text>
        )}
        {session.pin ? <Text style={styles.pin}>PIN {session.pin}</Text> : null}
        {session.error ? <Text style={styles.error}>{session.error}</Text> : null}
        {session.previewError ? <Text style={styles.error}>{session.previewError}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    color: '#F4F7FB',
    fontSize: 18,
    fontWeight: '700',
  },
  close: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#1B2838',
  },
  closeText: {
    color: '#F8FAFC',
    fontWeight: '600',
  },
  content: {
    padding: 16,
    gap: 10,
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
});
