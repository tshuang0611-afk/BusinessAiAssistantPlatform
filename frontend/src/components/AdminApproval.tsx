import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, ShieldX, RefreshCw, Clock, User, Building2 } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

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

interface RegisteredUser {
  user_id: string;
  username: string;
  user_role: string;
  phone_number: string;
  status: string;
  created_at: string;
  email: string | null;
  company_name: string | null;
  tax_id: string | null;
}

interface RegisteredEnterprise {
  enterprise_id: string;
  company_name: string;
  tax_id: string;
  vip_level: number;
  enterprise_points: number;
  status: string;
  created_at: string;
}

export default function AdminApproval() {
  const { token } = useAuth();
  const [subTab, setSubTab] = useState<'pending' | 'enterprises' | 'users'>('pending');
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [enterprises, setEnterprises] = useState<RegisteredEnterprise[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
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
      const res = await fetch(`${API}/api/admin/pending-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === 'success') setUsers(data.data);
    } catch {
      showToast('載入審核資料失敗', 'error');
    }
    setLoading(false);
  };

  const fetchEnterprises = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/enterprises`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === 'success') setEnterprises(data.data);
    } catch {
      showToast('載入企業名單失敗', 'error');
    }
    setLoading(false);
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === 'success') setRegisteredUsers(data.data);
    } catch {
      showToast('載入使用者名單失敗', 'error');
    }
    setLoading(false);
  };

  const fetchAllData = () => {
    fetchPending();
    fetchEnterprises();
    fetchUsers();
  };

  // 初始載入所有資料以取得正確的 Tab 計數
  useEffect(() => {
    fetchAllData();
  }, []);

  const handleAction = async (userId: string, action: 'approve' | 'reject') => {
    setProcessing(userId);
    const endpoint = action === 'approve'
      ? `${API}/api/admin/approve-user/${userId}`
      : `${API}/api/admin/reject-user/${userId}`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        // 更新待審核列表
        setUsers(prev => prev.filter(u => u.user_id !== userId));
        // 重新獲取企業與使用者名單以更新狀態與列表
        fetchEnterprises();
        fetchUsers();
      } else {
        showToast(data.detail || '操作失敗', 'error');
      }
    } catch {
      showToast('網路錯誤', 'error');
    }
    setProcessing(null);
  };

  const roleLabel: Record<string, string> = {
    ENTERPRISE_ADMIN: '企業功能性使用者',
    ENTERPRISE_USER: '企業一般使用者',
    PLATFORM_ADMIN: '平台管理者',
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
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
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem' }}>🔐 平台管理中心</h2>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            審核帳號申請並瀏覽已註冊的企業與使用者名單
          </p>
        </div>
        <button
          onClick={fetchAllData}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem' }}
        >
          <RefreshCw size={16} /> 重新整理
        </button>
      </div>

      {/* 子分頁導覽 */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
        <button 
          onClick={() => setSubTab('pending')}
          style={{
            background: subTab === 'pending' ? 'rgba(99,102,241,0.15)' : 'transparent',
            border: '1px solid ' + (subTab === 'pending' ? 'var(--accent-color)' : 'transparent'),
            borderRadius: '6px',
            color: subTab === 'pending' ? 'var(--text-primary)' : 'var(--text-secondary)',
            padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
            whiteSpace: 'nowrap', transition: 'all 0.2s'
          }}
        >
          🕒 待審核申請 ({users.length})
        </button>
        <button 
          onClick={() => setSubTab('enterprises')}
          style={{
            background: subTab === 'enterprises' ? 'rgba(99,102,241,0.15)' : 'transparent',
            border: '1px solid ' + (subTab === 'enterprises' ? 'var(--accent-color)' : 'transparent'),
            borderRadius: '6px',
            color: subTab === 'enterprises' ? 'var(--text-primary)' : 'var(--text-secondary)',
            padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
            whiteSpace: 'nowrap', transition: 'all 0.2s'
          }}
        >
          🏢 已註冊企業 ({enterprises.length})
        </button>
        <button 
          onClick={() => setSubTab('users')}
          style={{
            background: subTab === 'users' ? 'rgba(99,102,241,0.15)' : 'transparent',
            border: '1px solid ' + (subTab === 'users' ? 'var(--accent-color)' : 'transparent'),
            borderRadius: '6px',
            color: subTab === 'users' ? 'var(--text-primary)' : 'var(--text-secondary)',
            padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
            whiteSpace: 'nowrap', transition: 'all 0.2s'
          }}
        >
          👥 已註冊使用者 ({registeredUsers.length})
        </button>
      </div>

      {/* 待審核申請列表 */}
      {subTab === 'pending' && (
        <>
          <div className="glass-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Clock size={20} color="var(--accent-color)" />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              目前有 <strong style={{ color: 'var(--accent-color)', fontSize: '1.1rem' }}>{users.length}</strong> 筆帳號申請等待審核
            </span>
          </div>

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
        </>
      )}

      {/* 已註冊企業名單 */}
      {subTab === 'enterprises' && (
        <>
          {loading ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>載入中...</div>
          ) : enterprises.length === 0 ? (
            <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              無已註冊的企業
            </div>
          ) : (
            <div className="glass-panel" style={{ padding: '0', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>企業名稱</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>統一編號</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>VIP 等級</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>企業點數</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>狀態</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>註冊時間</th>
                  </tr>
                </thead>
                <tbody>
                  {enterprises.map(e => (
                    <tr key={e.enterprise_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        🏢 {e.company_name}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)' }}>{e.tax_id}</td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                          VIP {e.vip_level}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', color: 'var(--accent-color)', fontWeight: 600 }}>
                        {parseFloat(e.enterprise_points.toString()).toFixed(2)} pts
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600,
                          background: e.status === 'APPROVED' ? 'rgba(16,185,129,0.15)' : e.status === 'PENDING' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                          color: e.status === 'APPROVED' ? '#10b981' : e.status === 'PENDING' ? '#f59e0b' : '#ef4444'
                        }}>
                          {e.status === 'APPROVED' ? '已核准' : e.status === 'PENDING' ? '待審核' : '已拒絕'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {new Date(e.created_at).toLocaleString('zh-TW')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* 已註冊使用者名單 */}
      {subTab === 'users' && (
        <>
          {loading ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>載入中...</div>
          ) : registeredUsers.length === 0 ? (
            <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              無已註冊的使用者
            </div>
          ) : (
            <div className="glass-panel" style={{ padding: '0', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>帳號名稱</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>權限角色</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>聯絡電話</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>所屬企業</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>狀態</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>註冊時間</th>
                  </tr>
                </thead>
                <tbody>
                  {registeredUsers.map(u => (
                    <tr key={u.user_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        👤 {u.username}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{
                          fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '20px',
                          background: u.user_role === 'PLATFORM_ADMIN' ? 'rgba(239,68,68,0.15)' : u.user_role === 'ENTERPRISE_ADMIN' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)',
                          color: u.user_role === 'PLATFORM_ADMIN' ? '#f87171' : u.user_role === 'ENTERPRISE_ADMIN' ? '#818cf8' : '#34d399',
                          fontWeight: 600,
                        }}>
                          {roleLabel[u.user_role] || u.user_role}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{u.phone_number}</td>
                      <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        {u.company_name ? `🏢 ${u.company_name} (${u.tax_id})` : '-'}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600,
                          background: u.status === 'APPROVED' ? 'rgba(16,185,129,0.15)' : u.status === 'PENDING' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                          color: u.status === 'APPROVED' ? '#10b981' : u.status === 'PENDING' ? '#f59e0b' : '#ef4444'
                        }}>
                          {u.status === 'APPROVED' ? '已核准' : u.status === 'PENDING' ? '待審核' : '已拒絕'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {new Date(u.created_at).toLocaleString('zh-TW')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
