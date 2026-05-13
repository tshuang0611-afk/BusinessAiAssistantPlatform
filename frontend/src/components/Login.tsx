import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok && data.status === 'success') {
        login(data.access_token, data.user);
      } else {
        setError(data.detail || '登入失敗，請檢查帳號密碼。');
      }
    } catch (err) {
      setError('網路連線錯誤，請確定後端伺服器已啟動。');
    }
    setLoading(false);
  };

  const setTestAccount = (user: string) => {
    setUsername(user);
    setPassword('password123');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: 'var(--bg-dark)' }}>
      <div className="glass-panel" style={{ width: '400px', maxWidth: '90%', padding: '3rem 2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--accent-color)', fontSize: '2rem', marginBottom: '0.5rem', marginTop: 0 }}>CAXN</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>企業 AI 資源共享平台</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '4px', fontSize: '0.9rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>帳號 (Username)</label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="請輸入帳號"
              required
              style={{ width: '100%' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>密碼 (Password)</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              required
              style={{ width: '100%' }}
            />
          </div>

          <button type="submit" className="primary" disabled={loading} style={{ marginTop: '1rem', padding: '0.75rem', fontSize: '1rem' }}>
            {loading ? '登入中...' : '登入系統'}
          </button>
        </form>

        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>快速測試身分 (點擊套用)</p>
          <button onClick={() => setTestAccount('admin')} style={{ background: 'rgba(255,255,255,0.05)' }}>
            平台管理者 (admin)
          </button>
          <button onClick={() => setTestAccount('ent_admin')} style={{ background: 'rgba(255,255,255,0.05)' }}>
            企業功能性使用者 (ent_admin)
          </button>
          <button onClick={() => setTestAccount('ent_user')} style={{ background: 'rgba(255,255,255,0.05)' }}>
            企業一般使用者 (ent_user)
          </button>
        </div>

      </div>
    </div>
  );
}
