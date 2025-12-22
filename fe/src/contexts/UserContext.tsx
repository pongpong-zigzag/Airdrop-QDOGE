"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useQubicConnect } from '../components/connect/QubicConnectContext';
import { getUser, updateUserRole } from '../lib/api';
import { fetchOwnedAssets } from '../services/rpc.service';
import {User} from "../lib/types"
import type { OwnedAssetSnapshot } from "../types/user.types";

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

  const refreshUser = useCallback(async () => {
    const walletId = wallet?.publicKey;
    if (!walletId) {
      setUser(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await getUser(walletId);
      let resolvedUser = result.user;

      const assets: OwnedAssetSnapshot[] | undefined = await fetchOwnedAssets(walletId);
      if (assets !== undefined) {
        const holdsPortalAsset = assets.some(
          (asset) => asset.asset?.trim().toLowerCase() === "qportal",
        );
        const currentRole = (resolvedUser.role || "user").toLowerCase();
        const canAutoAssign = currentRole === "user" || currentRole === "portal";
        const desiredRole = holdsPortalAsset ? "portal" : "user";

        if (canAutoAssign && desiredRole !== currentRole) {
          try {
            const updated = await updateUserRole(walletId, desiredRole);
            resolvedUser = updated.user;
          } catch (roleError) {
            console.error("Failed to update user role", roleError);
          }
        }
      }

      setUser(resolvedUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
      console.error('Error loading user:', err);
    } finally {
      setLoading(false);
    }
  }, [wallet?.publicKey]);

  // Load user when wallet connects
  useEffect(() => {
    if (connected && wallet?.publicKey) {
      refreshUser();
    } else {
      setUser(null);
    }
  }, [connected, wallet?.publicKey, refreshUser]);

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

