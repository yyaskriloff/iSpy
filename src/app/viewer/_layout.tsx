import { Stack } from 'expo-router'

import { ViewerSessionProvider } from '@/hooks/viewer-session-context'

export const unstable_settings = {
  anchor: 'index'
}

export default function ViewerLayout() {
  return (
    <ViewerSessionProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0B1220' }
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="watch" />
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.45, 0.75],
            sheetGrabberVisible: true,
            sheetCornerRadius: 20,
            contentStyle: { backgroundColor: '#0B1220' }
          }}
        />
      </Stack>
    </ViewerSessionProvider>
  )
}
