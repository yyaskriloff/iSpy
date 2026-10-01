import { Link } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import '@/lib/webrtc-setup'

export default function HomeScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.brand}>iSpy</Text>
      <Text style={styles.sub}>
        One app, two roles. Use this phone as the camera or as the viewer on the same Wi‑Fi.
      </Text>

      <View style={styles.actions}>
        <Link href="/camera" asChild>
          <Pressable style={StyleSheet.flatten([styles.button, styles.cameraButton])}>
            <Text style={styles.buttonTitle}>Camera</Text>
            <Text style={styles.buttonBody}>Stream this phone’s camera + mic</Text>
          </Pressable>
        </Link>

        <Link href="/viewer" asChild>
          <Pressable style={StyleSheet.flatten([styles.button, styles.viewerButton])}>
            <Text style={styles.buttonTitle}>Viewer</Text>
            <Text style={styles.buttonBody}>Watch another iSpy camera on your LAN</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B1220',
    paddingHorizontal: 24,
    justifyContent: 'center'
  },
  brand: {
    fontSize: 56,
    fontWeight: '700',
    color: '#F4F7FB',
    letterSpacing: -1.5
  },
  sub: {
    marginTop: 12,
    fontSize: 17,
    lineHeight: 24,
    color: '#A8B3C7',
    maxWidth: 340
  },
  actions: {
    marginTop: 40,
    gap: 14
  },
  button: {
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 20
  },
  cameraButton: {
    backgroundColor: '#1F6FEB'
  },
  viewerButton: {
    backgroundColor: '#1B2838',
    borderWidth: 1,
    borderColor: '#2C3E55'
  },
  buttonTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700'
  },
  buttonBody: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    lineHeight: 20
  }
})
