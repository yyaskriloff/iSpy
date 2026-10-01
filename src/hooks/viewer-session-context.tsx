import { createContext, useContext, type ReactNode } from 'react';

import { useViewerSession, type ViewerSession } from '@/hooks/use-viewer-session';

const ViewerSessionContext = createContext<ViewerSession | null>(null);

export function ViewerSessionProvider({ children }: { children: ReactNode }) {
  const session = useViewerSession();
  return (
    <ViewerSessionContext.Provider value={session}>{children}</ViewerSessionContext.Provider>
  );
}

export function useViewerSessionContext(): ViewerSession {
  const session = useContext(ViewerSessionContext);
  if (!session) {
    throw new Error('useViewerSessionContext must be used within ViewerSessionProvider');
  }
  return session;
}
