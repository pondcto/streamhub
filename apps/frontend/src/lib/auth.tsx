"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Account } from "./types";
import { fetchMe, loginRequest, signupRequest } from "./auth-api";

const TOKEN_KEY = "streamhub_token";

interface AuthContextValue {
  user: Account | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Account>;
  signup: (email: string, password: string, displayName?: string) => Promise<Account>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from a stored token on first mount (client only).
  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
    if (!stored) {
      setLoading(false);
      return;
    }
    setToken(stored);
    fetchMe(stored)
      .then((account) => setUser(account))
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const applyToken = useCallback((newToken: string, account: Account) => {
    window.localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(account);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await loginRequest(email, password);
      applyToken(res.access_token, res.user);
      return res.user;
    },
    [applyToken]
  );

  const signup = useCallback(
    async (email: string, password: string, displayName = "") => {
      const res = await signupRequest(email, password, displayName);
      applyToken(res.access_token, res.user);
      return res.user;
    },
    [applyToken]
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, signup, logout }),
    [user, token, loading, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}

/** Read the persisted bearer token outside React (e.g. for API calls). */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
