import { router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RTCView } from 'react-native-webrtc'

import { useViewerSessionContext } from '@/hooks/viewer-session-context'

function goToConnect() {
  router.replace('/viewer')
}

export default function ViewerWatchScreen() {
  const insets = useSafeAreaInsets()
  const session = useViewerSessionContext()

  function disconnectAndReturn() {
    session.disconnect()
    goToConnect()
  }

  return (
    <View style={styles.root}>
      {session.remoteStream ? (
        <RTCView streamURL={session.remoteStream.toURL()} style={styles.video} objectFit="contain" />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>{session.statusText}</Text>
          {session.error ? <Text style={styles.error}>{session.error}</Text> : null}
        </View>
      )}

      <View
        style={[styles.chrome, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}
        pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable onPress={disconnectAndReturn} style={styles.chip}>
            <Text style={styles.chipText}>Disconnect</Text>
          </Pressable>
          <Text style={styles.status} numberOfLines={1}>
            {session.statusText}
          </Text>
          <Pressable onPress={() => router.push('/viewer/settings')} style={styles.chip}>
            <Text style={styles.chipText}>Settings</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000'
  },
  video: {
    ...StyleSheet.absoluteFill
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1220',
    padding: 24,
    gap: 8
  },
  placeholderText: {
    color: '#A8B3C7',
    fontSize: 16,
    textAlign: 'center'
  },
  error: {
    color: '#FDA4AF',
    fontSize: 14,
    textAlign: 'center'
  },
  chrome: {
    flex: 1,
    paddingHorizontal: 16
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  chipText: {
    color: '#fff',
    fontWeight: '600'
  },
  status: {
    flex: 1,
    color: '#F4F7FB',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  }
})
