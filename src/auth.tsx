// 登录态：凭据只保存在当前标签页的 sessionStorage；角色以 safety-admin 返回的为准。
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_EXPIRED_EVENT, admin, clearCredentials, readCredentials, runtime, saveCredentials } from './api';
import type { Credentials, Role } from './types';

interface AuthState {
  credentials: Credentials | null;
  username: string;
  role: Role;
  canWrite: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = useState<Credentials | null>(readCredentials);

  const logout = useCallback(() => {
    clearCredentials();
    setCredentials(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, logout);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, logout);
  }, [logout]);

  // 旧会话没有角色信息时向后端补查一次
  useEffect(() => {
    if (!credentials || credentials.role) return;
    admin.identity(credentials)
      .then(identity => setCredentials(saveCredentials(credentials.username, credentials.password, identity.role)))
      .catch(logout);
  }, [credentials, logout]);

  const login = useCallback(async (username: string, password: string) => {
    const attempt = { username, password };
    // 先过 nginx 的 Basic Auth，再由 safety-admin 确认角色（两层都校验同一组账号）
    await runtime.authCheck(attempt);
    const identity = await admin.identity(attempt);
    queryClient.clear();
    setCredentials(saveCredentials(username, password, identity.role));
  }, [queryClient]);

  const value = useMemo<AuthState>(() => {
    const role: Role = credentials?.role === 'admin' ? 'admin' : 'viewer';
    return { credentials, username: credentials?.username || '', role, canWrite: role === 'admin', login, logout };
  }, [credentials, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return value;
}
