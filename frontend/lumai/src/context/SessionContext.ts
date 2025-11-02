import { createContext, useContext } from 'react';

export interface SessionContextValue {
  sessionExpiry: number | null;
  resetSessionTimer: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export const useSessionContext = (): SessionContextValue => {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSessionContext must be used within a SessionContext provider');
  }
  return value;
};

export default SessionContext;

