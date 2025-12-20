import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQubicConnect } from '../components/connect/QubicConnectContext';
import { getUser} from '../lib/api';
import {User} from "../lib/types"

interface UserContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { connected, wallet } = useQubicConnect();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = async () => {
    if (!wallet?.publicKey) {
      setUser(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await getUser(wallet.publicKey);
      setUser(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
      console.error('Error loading user:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load user when wallet connects
  useEffect(() => {
    if (connected && wallet?.publicKey) {
      refreshUser();
    } else {
      setUser(null);
    }
  }, [connected, wallet?.publicKey]);

  return (
    <UserContext.Provider value = {{ user, loading, error, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

