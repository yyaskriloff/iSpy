import AsyncStorage from '@react-native-async-storage/async-storage'

import { generatePin } from '@/lib/stream-config'

const PIN_KEY = 'ispy_viewer_pin'
const DISCOVERABLE_KEY = 'ispy_camera_discoverable'
const CAMERA_NAME_KEY = 'ispy_camera_name'

export async function loadOrCreatePin(): Promise<string> {
  const existing = await AsyncStorage.getItem(PIN_KEY)
  if (existing && /^\d{4}$/.test(existing)) return existing
  const pin = generatePin()
  await AsyncStorage.setItem(PIN_KEY, pin)
  return pin
}

export async function savePin(pin: string): Promise<void> {
  await AsyncStorage.setItem(PIN_KEY, pin)
}

/** Default ON — camera advertises on LAN while streaming. */
export async function loadDiscoverable(): Promise<boolean> {
  const value = await AsyncStorage.getItem(DISCOVERABLE_KEY)
  if (value === null) return true
  return value === '1'
}

export async function saveDiscoverable(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(DISCOVERABLE_KEY, enabled ? '1' : '0')
}

export async function loadCameraName(): Promise<string> {
  return (await AsyncStorage.getItem(CAMERA_NAME_KEY)) ?? 'iSpy Camera'
}

export async function saveCameraName(name: string): Promise<void> {
  await AsyncStorage.setItem(CAMERA_NAME_KEY, name.trim() || 'iSpy Camera')
}
