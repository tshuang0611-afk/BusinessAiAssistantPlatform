import { useState } from 'react';
import { Building2, UserPlus, ArrowLeft, CheckCircle } from 'lucide-react';

interface RegisterProps {
  onBack: () => void;
}

type Mode = 'select' | 'enterprise' | 'employee';

export default function Register({ onBack }: RegisterProps) {
  const [mode, setMode] = useState<Mode>('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 共用欄位
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');

  // 企業入駐
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');

  // 員工加入
  const [enterpriseTaxId, setEnterpriseTaxId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const body: Record<string, string> = {
      mode: mode === 'enterprise' ? 'enterprise' : 'employee',
      username,
      password,
      phone_number: phone,
    };

    if (mode === 'enterprise') {
      body.company_name = companyName;
      body.tax_id = taxId;
    } else {
      body.enterprise_tax_id = enterpriseTaxId;
    }

    try {
      const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSuccess(data.message);
      } else {
        setError(data.detail || '申請失敗，請重試。');
      }
    } catch {
      setError('網路連線錯誤，請確定後端伺服器已啟動。');
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: 'var(--bg-dark)' }}>
        <div className="glass-panel" style={{ width: '440px', maxWidth: '90%', padding: '3rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
          <CheckCircle size={56} color="var(--accent-color)" />
          <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>申請已送出！</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{success}</p>
          <button className="primary" onClick={onBack} style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>
            返回登入頁面
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100vw', background: 'var(--bg-dark)', padding: '2rem 0' }}>
      <div className="glass-panel" style={{ width: '480px', maxWidth: '92%', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

        {/* 標頭 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={mode === 'select' ? onBack : () => setMode('select')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--text-secondary)', display: 'flex' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--accent-color)' }}>CAXN 帳號申請</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>申請後需等待平台管理員審核</p>
          </div>
        </div>

        {/* 模式選擇 */}
        {mode === 'select' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>請選擇申請類型</p>
            <button
              onClick={() => setMode('enterprise')}
              style={{
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '12px',
                padding: '1.25rem',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)')}
            >
              <Building2 size={32} color="var(--accent-color)" />
              <div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>企業入駐</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>全新企業加入平台，填寫公司資訊並建立管理員帳號</div>
              </div>
            </button>

            <button
              onClick={() => setMode('employee')}
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '1.25rem',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)')}
            >
              <UserPlus size={32} color="#10b981" />
              <div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>員工加入</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>加入已在平台的企業，輸入公司統編即可申請</div>
              </div>
            </button>
          </div>
        )}

        {/* 表單 */}
        {(mode === 'enterprise' || mode === 'employee') && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}>
                {error}
              </div>
            )}

            {/* 企業入駐專屬欄位 */}
            {mode === 'enterprise' && (
              <>
                <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  🏢 企業入駐 — 建立企業帳戶
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>公司名稱</label>
                  <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="例：台灣科技股份有限公司" required style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>統一編號</label>
                  <input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="例：12345678" required style={{ width: '100%' }} />
                </div>
              </>
            )}

            {/* 員工加入專屬欄位 */}
            {mode === 'employee' && (
              <>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  👤 員工加入 — 申請加入已入駐企業
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>公司統一編號</label>
                  <input type="text" value={enterpriseTaxId} onChange={e => setEnterpriseTaxId(e.target.value)} placeholder="請輸入您所在公司的統編" required style={{ width: '100%' }} />
                </div>
              </>
            )}

            {/* 共用帳號欄位 */}
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>設定您的帳號資訊</p>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>帳號 (Username)</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="請設定登入帳號" required style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>密碼</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="請設定密碼（至少8碼）" required minLength={6} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>聯絡電話</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="例：0912345678" required style={{ width: '100%' }} />
              </div>
            </div>

            <button type="submit" className="primary" disabled={loading} style={{ padding: '0.85rem', fontSize: '1rem', marginTop: '0.5rem' }}>
              {loading ? '送出申請中...' : '送出申請'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
