import { useEffect, useState } from 'react'
import { Users, Coins, Gift, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { useAuth } from  '../contexts/AuthContext'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

interface Member { user_id: string; username: string; user_role: string; personal_points: number }
interface LogEntry { distribution_id: string; admin_name: string; user_name: string; amount: number; note: string; created_at: string }

export default function PointDistribution() {
  const { token } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [walletBalance, setWalletBalance] = useState(0)
  const [selectedUser, setSelectedUser] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const fetchAll = async () => {
    const headers = { Authorization: `Bearer ${token}` }
    const [mRes, wRes, lRes] = await Promise.all([
      fetch(`${API}/api/enterprise/members`, { headers }),
      fetch(`${API}/api/wallets/me`, { headers }),
      fetch(`${API}/api/enterprise/distribution-log`, { headers }),
    ])
    const [mData, wData, lData] = await Promise.all([mRes.json(), wRes.json(), lRes.json()])
    if (mData.status === 'success') setMembers(mData.data)
    if (wData.status === 'success') setWalletBalance(wData.balance)
    if (lData.status === 'success') setLog(lData.data)
  }

  useEffect(() => { if (token) fetchAll() }, [token])

  const handleDistribute = async () => {
    if (!selectedUser || !amount || Number(amount) <= 0) { showToast('⚠️ 請選擇員工並輸入正確金額'); return }
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/enterprise/distribute-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to_user_id: selectedUser, amount: Number(amount), note })
      })
      const data = await res.json()
      if (res.ok) { showToast(`✅ ${data.message}`); setAmount(''); setNote(''); fetchAll() }
      else showToast(`❌ ${data.detail}`)
    } catch { showToast('❌ 網路連線錯誤') }
    setLoading(false)
  }

  const ROLE_LABEL: Record<string, string> = { ENTERPRISE_ADMIN: '管理員', ENTERPRISE_USER: '一般員工', PLATFORM_ADMIN: '平台管理' }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', position: 'relative' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '80px', right: '24px', background: '#1e293b', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0.75rem 1.25rem', zIndex: 9999, color: 'var(--text-primary)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>企業點數分配</h2>
        <p style={{ margin: '0.4rem 0 0', color: 'var(--text-secondary)' }}>從企業錢包分配年度福利點數給員工，員工可用於兌換福利品或購買數位資產</p>
      </div>

      {/* Enterprise wallet balance */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Coins size={28} color="var(--accent-color)" />
        <div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>企業錢包餘額</p>
          <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>{Number(walletBalance).toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>pts</span></p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Distribute form */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Send size={18} color="var(--accent-color)" /> 分配點數</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>選擇員工</label>
              <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)' }}>
                <option value="">-- 請選擇 --</option>
                {members.filter(m => m.user_role !== 'PLATFORM_ADMIN').map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.username} ({ROLE_LABEL[m.user_role] || m.user_role}) — {m.personal_points} pts</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>分配點數</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={1} placeholder="輸入點數" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>備註</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="例：2025 年度福利金" style={{ width: '100%' }} />
            </div>
            <button className="primary" onClick={handleDistribute} disabled={loading} style={{ padding: '0.7rem', justifyContent: 'center', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {loading ? '處理中...' : <><Send size={16} /> 確認分配</>}
            </button>
          </div>
        </div>

        {/* Members list */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={18} color="var(--accent-color)" /> 成員點數一覽</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {members.map(m => (
              <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>{m.username}</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{ROLE_LABEL[m.user_role] || m.user_role}</p>
                </div>
                <span style={{ fontWeight: 700, color: m.personal_points > 0 ? '#10b981' : 'var(--text-secondary)' }}>
                  {Number(m.personal_points).toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Distribution log */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
        <button onClick={() => setShowLog(v => !v)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.95rem', width: '100%', padding: 0, justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Gift size={16} /> 分配歷史記錄 ({log.length})</span>
          {showLog ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showLog && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {log.length === 0 ? <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>尚無分配記錄</p> : log.map(entry => (
              <div key={entry.distribution_id} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}><strong>{entry.user_name}</strong> 獲得 <strong style={{ color: '#10b981' }}>+{entry.amount} pts</strong></p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{entry.note || '無備註'} · 由 {entry.admin_name} 操作</p>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(entry.created_at).toLocaleString('zh-TW')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
