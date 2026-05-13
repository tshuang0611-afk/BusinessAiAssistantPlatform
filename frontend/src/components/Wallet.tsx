import { useEffect, useState } from 'react'
import { Coins, ArrowDownCircle, ArrowUpCircle, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Wallet() {
  const { user, token } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [personalPoints, setPersonalPoints] = useState<number | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [selfAmount, setSelfAmount] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [selfLoading, setSelfLoading] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const isAdmin = user?.role === 'ENTERPRISE_ADMIN' || user?.role === 'PLATFORM_ADMIN'
  const isUser = user?.role === 'ENTERPRISE_USER'

  const fetchData = async () => {
    const headers = { Authorization: `Bearer ${token}` }
    if (isAdmin) {
      const res = await fetch('http://localhost:8000/api/wallets/me', { headers })
      const data = await res.json()
      if (data.status === 'success') setBalance(data.balance)
    }
    const pRes = await fetch('http://localhost:8000/api/users/my-points', { headers })
    const pData = await pRes.json()
    if (pData.status === 'success') setPersonalPoints(pData.personal_points)
  }

  useEffect(() => { if (token) fetchData() }, [token])

  const handleAction = async (type: 'topup' | 'withdraw') => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { showToast('請輸入有效的金額！'); return }
    setLoading(true)
    try {
      const endpoint = type === 'topup' ? 'topup' : 'withdraw'
      const body = type === 'topup'
        ? { amount: Number(amount), description: '企業錢包儲值' }
        : { amount: Number(amount), bank_account: 'Bank-1234567' }
      const res = await fetch(`http://localhost:8000/wallets/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (res.ok) { showToast(data.message || '操作成功'); setAmount(''); fetchData() }
      else showToast(data.detail || '操作失敗')
    } catch { showToast('網路連線錯誤') }
    setLoading(false)
  }

  const handleSelfTopup = async () => {
    if (!selfAmount || isNaN(Number(selfAmount)) || Number(selfAmount) <= 0) { showToast('請輸入有效的金額！'); return }
    setSelfLoading(true)
    try {
      const res = await fetch('http://localhost:8000/api/users/self-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: Number(selfAmount), description: '員工自購點數' })
      })
      const data = await res.json()
      if (res.ok) { showToast(data.message || '儲值成功'); setSelfAmount(''); fetchData() }
      else showToast(data.detail || '儲值失敗')
    } catch { showToast('網路連線錯誤') }
    setSelfLoading(false)
  }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', position: 'relative' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '80px', right: '24px', background: '#1e293b', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0.75rem 1.25rem', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}

      <h2>點數錢包</h2>
      <p style={{ marginBottom: '2rem' }}>管理您的企業或個人點數，點數可用於平台消費及兌換福利品。</p>

      {/* 企業錢包（管理員顯示） */}
      {isAdmin && (
        <>
          <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem', marginBottom: '1.25rem' }}>
            <Coins size={40} color="var(--accent-color)" style={{ marginBottom: '0.75rem' }} />
            <h3 style={{ color: 'var(--text-secondary)', margin: '0 0 0.4rem', fontWeight: 'normal', fontSize: '0.9rem' }}>企業錢包餘額</h3>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
              {balance !== null ? balance.toLocaleString() : '---'} <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>pts</span>
            </div>
          </div>

          <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '1.25rem' }}>
            <div className="glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                <ArrowDownCircle size={20} color="var(--success)" /> 企業儲值
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 0 }}>現金購買企業點數，用於分配給員工或支付 AI 費用</p>
              <input type="number" placeholder="輸入儲值點數..." value={amount} onChange={e => setAmount(e.target.value)} />
              <button className="success" style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem' }} onClick={() => handleAction('topup')} disabled={loading}>
                {loading ? '處理中...' : '確認儲值'}
              </button>
            </div>
            <div className="glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                <ArrowUpCircle size={20} color="var(--warning)" /> 提領點數
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 0 }}>將企業點數換回現金至指定帳戶</p>
              <input type="number" placeholder="輸入提領點數..." value={amount} onChange={e => setAmount(e.target.value)} />
              <button style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem', background: 'var(--warning)', borderColor: 'var(--warning)' }} onClick={() => handleAction('withdraw')} disabled={loading}>
                {loading ? '處理中...' : '申請提領'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 個人點數（所有人顯示） */}
      <div className="glass-panel" style={{ padding: '1.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <User size={32} color="#818cf8" />
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>個人點數餘額</p>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              {personalPoints !== null ? personalPoints.toLocaleString() : '---'} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>pts</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '8px', padding: '0.85rem', fontSize: '0.85rem', color: 'rgba(129,140,248,0.9)', marginBottom: '1.25rem' }}>
          💡 個人點數來源：① 企業管理員分配年度福利金  ② 自行購買（下方）<br />
          可用於：購買平台數位資產 · 兌換企業福利品
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            自行購買個人點數（現金儲值）
          </label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input type="number" placeholder="輸入購買點數..." value={selfAmount} onChange={e => setSelfAmount(e.target.value)} style={{ flex: 1 }} />
            <button className="primary" onClick={handleSelfTopup} disabled={selfLoading} style={{ whiteSpace: 'nowrap' }}>
              {selfLoading ? '處理中...' : '購買點數'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
