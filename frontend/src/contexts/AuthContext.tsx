import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export interface User {
  sub: string;
  user_id: string;
  role: 'PLATFORM_ADMIN' | 'ENTERPRISE_ADMIN' | 'ENTERPRISE_USER';
  enterprise_id: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (accessToken: string, user: User, refreshToken?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化：從 localStorage 讀取
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      scheduleRefresh();
    }
  }, []);

  // 解析 JWT Payload（不驗證簽章，僅取 exp）
  const parseJwt = (t: string) => {
    try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; }
  };

  // 排程 Access Token 自動更新（過期前 5 分鐘）
  const scheduleRefresh = (accessToken?: string) => {
    const tk = accessToken || localStorage.getItem('token');
    if (!tk) return;
    const payload = parseJwt(tk);
    if (!payload?.exp) return;
    const expMs = payload.exp * 1000;
    const now = Date.now();
    const refreshIn = expMs - now - 5 * 60 * 1000; // 提前 5 分鐘
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    if (refreshIn > 0) {
      refreshTimerRef.current = setTimeout(() => doRefresh(), refreshIn);
    } else {
      doRefresh(); // 已過期，立即刷新
    }
  };

  const doRefresh = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) { logout(); return; }
    try {
      const res = await fetch(`${API}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) { logout(); return; }
      const data = await res.json();
      if (data.status === 'success') {
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        setToken(data.access_token);
        scheduleRefresh(data.access_token);
      } else {
        logout();
      }
    } catch {
      // 網路錯誤時不立即登出，等下次嘗試
    }
  };

  const login = (accessToken: string, newUser: User, refreshToken?: string) => {
    setToken(accessToken);
    setUser(newUser);
    localStorage.setItem('token', accessToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    scheduleRefresh(accessToken);
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    const accessToken = localStorage.getItem('token');
    // 通知後端廢止 Refresh Token
    if (refreshToken && accessToken) {
      fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
    }
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('refresh_token');
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
