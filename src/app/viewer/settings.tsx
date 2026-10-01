import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useViewerSessionContext } from '@/hooks/viewer-session-context';

export default function ViewerSettingsScreen() {
  const session = useViewerSessionContext();

  function disconnectAndReturn() {
    session.disconnect();
    router.replace('/viewer');
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Viewer settings</Text>
        <Pressable onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.status}>{session.statusText}</Text>
        {session.host ? <Text style={styles.meta}>Camera {session.host}</Text> : null}
        {session.error ? <Text style={styles.error}>{session.error}</Text> : null}

        <Pressable style={styles.ctaStop} onPress={disconnectAndReturn}>
          <Text style={styles.ctaText}>Disconnect</Text>
        </Pressable>
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
  status: {
    color: '#F4F7FB',
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: '#A8B3C7',
    fontSize: 14,
  },
  error: {
    color: '#FDA4AF',
    fontSize: 14,
  },
  ctaStop: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#BE123C',
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
