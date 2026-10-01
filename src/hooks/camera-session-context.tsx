import { createContext, useContext, type ReactNode } from 'react';

import { useCameraSession, type CameraSession } from '@/hooks/use-camera-session';

const CameraSessionContext = createContext<CameraSession | null>(null);

export function CameraSessionProvider({ children }: { children: ReactNode }) {
  const session = useCameraSession();
  return (
    <CameraSessionContext.Provider value={session}>{children}</CameraSessionContext.Provider>
  );
}

export function useCameraSessionContext(): CameraSession {
  const session = useContext(CameraSessionContext);
  if (!session) {
    throw new Error('useCameraSessionContext must be used within CameraSessionProvider');
  }
  return session;
}
