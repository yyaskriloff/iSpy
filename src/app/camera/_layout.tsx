import { Stack } from 'expo-router';

import { CameraSessionProvider } from '@/hooks/camera-session-context';

export const unstable_settings = {
  anchor: 'index',
};

export default function CameraLayout() {
  return (
    <CameraSessionProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0B1220' },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.45, 0.75],
            sheetGrabberVisible: true,
            sheetCornerRadius: 20,
            contentStyle: { backgroundColor: '#0B1220' },
          }}
        />
      </Stack>
    </CameraSessionProvider>
  );
}
