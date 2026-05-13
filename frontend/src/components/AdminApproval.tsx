import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, ShieldX, RefreshCw, Clock, User, Building2 } from 'lucide-react';

interface PendingUser {
  user_id: string;
  username: string;
  user_role: string;
  phone_number: string;
  status: string;
  created_at: string;
  company_name: string | null;
  tax_id: string | null;
  enterprise_status: string | null;
}

export default function AdminApproval() {
  const { token } = useAuth();
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/admin/pending-users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === 'success') setUsers(data.data);
    } catch {
      showToast('載入資料失敗', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { fetchPending(); }, []);

  const handleAction = async (userId: string, action: 'approve' | 'reject') => {
    setProcessing(userId);
    const endpoint = action === 'approve'
      ? `http://localhost:8000/api/admin/approve-user/${userId}`
      : `http://localhost:8000/api/admin/reject-user/${userId}`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setUsers(prev => prev.filter(u => u.user_id !== userId));
      } else {
        showToast(data.detail || '操作失敗', 'error');
      }
    } catch {
      showToast('網路錯誤', 'error');
    }
    setProcessing(null);
  };

  const roleLabel: Record<string, string> = {
    ENTERPRISE_ADMIN: '企業管理員',
    ENTERPRISE_USER: '企業員工',
    PLATFORM_ADMIN: '平台管理員',
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999,
          background: toast.type === 'success' ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)',
          color: '#fff', padding: '0.8rem 1.5rem', borderRadius: '10px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', fontWeight: 500,
          animation: 'fadeIn 0.3s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* 標頭 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem' }}>🔐 帳號審核管理</h2>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            審核待入駐的企業與員工帳號申請
          </p>
        </div>
        <button
          onClick={fetchPending}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem' }}
        >
          <RefreshCw size={16} /> 重新整理
        </button>
      </div>

      {/* 統計卡片 */}
      <div className="glass-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Clock size={20} color="var(--accent-color)" />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          目前有 <strong style={{ color: 'var(--accent-color)', fontSize: '1.1rem' }}>{users.length}</strong> 筆帳號申請等待審核
        </span>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>載入中...</div>
      ) : users.length === 0 ? (
        <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center' }}>
          <ShieldCheck size={48} color="var(--accent-color)" style={{ marginBottom: '1rem' }} />
          <div style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>目前沒有待審核的申請</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>所有帳號均已處理完畢 🎉</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {users.map(u => (
            <div key={u.user_id} className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                {/* 左側資訊 */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                    background: u.user_role === 'ENTERPRISE_ADMIN' ? 'rgba(99,102,241,0.2)' : 'rgba(16,185,129,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {u.user_role === 'ENTERPRISE_ADMIN' ? <Building2 size={20} color="var(--accent-color)" /> : <User size={20} color="#10b981" />}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text-primary)', fontSize: '1.05rem' }}>{u.username}</strong>
                      <span style={{
                        fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '20px',
                        background: u.user_role === 'ENTERPRISE_ADMIN' ? 'rgba(99,102,241,0.2)' : 'rgba(16,185,129,0.2)',
                        color: u.user_role === 'ENTERPRISE_ADMIN' ? '#818cf8' : '#34d399',
                        fontWeight: 600,
                      }}>
                        {roleLabel[u.user_role] || u.user_role}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                      📞 {u.phone_number}
                      {u.company_name && <span style={{ marginLeft: '1rem' }}>🏢 {u.company_name}（統編：{u.tax_id}）</span>}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem', opacity: 0.7 }}>
                      申請時間：{new Date(u.created_at).toLocaleString('zh-TW')}
                    </div>
                  </div>
                </div>

                {/* 右側操作按鈕 */}
                <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
                  <button
                    className="primary"
                    disabled={processing === u.user_id}
                    onClick={() => handleAction(u.user_id, 'approve')}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.1rem', fontSize: '0.9rem' }}
                  >
                    <ShieldCheck size={16} />
                    {processing === u.user_id ? '處理中...' : '核准'}
                  </button>
                  <button
                    className="danger"
                    disabled={processing === u.user_id}
                    onClick={() => handleAction(u.user_id, 'reject')}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.1rem', fontSize: '0.9rem' }}
                  >
                    <ShieldX size={16} />
                    拒絕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
