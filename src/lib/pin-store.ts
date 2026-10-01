import AsyncStorage from '@react-native-async-storage/async-storage';

import { generatePin } from '@/lib/stream-config';

const PIN_KEY = 'ispy_viewer_pin';
const LAST_HOST_KEY = 'ispy_last_host';

export async function loadOrCreatePin(): Promise<string> {
  const existing = await AsyncStorage.getItem(PIN_KEY);
  if (existing && /^\d{4}$/.test(existing)) return existing;
  const pin = generatePin();
  await AsyncStorage.setItem(PIN_KEY, pin);
  return pin;
}

export async function savePin(pin: string): Promise<void> {
  await AsyncStorage.setItem(PIN_KEY, pin);
}

export async function loadLastHost(): Promise<string> {
  return (await AsyncStorage.getItem(LAST_HOST_KEY)) ?? '';
}

export async function saveLastHost(host: string): Promise<void> {
  await AsyncStorage.setItem(LAST_HOST_KEY, host);
}
