import { useEffect, useState } from 'react'
import { Coins, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Wallet() {
  const { user, token } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const fetchBalance = () => {
    fetch(`http://localhost:8000/api/wallets/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setBalance(data.balance)
        }
      })
      .catch(console.error)
  }

  useEffect(() => {
    if (token) fetchBalance()
  }, [token])

  const handleAction = async (type: 'topup' | 'withdraw') => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert("請輸入有效的金額！")
      return
    }

    setLoading(true)
    try {
      const endpoint = type === 'topup' ? 'topup' : 'withdraw'
      const body = type === 'topup' 
        ? { amount: Number(amount), description: "線上儲值" }
        : { amount: Number(amount), bank_account: "Bank-1234567" }

      const res = await fetch(`http://localhost:8000/wallets/${endpoint}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      
      if (res.ok) {
        alert(data.message)
        setAmount('')
        fetchBalance()
      } else {
        alert(data.detail || "操作失敗")
      }
    } catch (e) {
      alert("網路連線錯誤")
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>企業點數錢包</h2>
      <p style={{ marginBottom: '2rem' }}>管理您的平台資產點數，點數可用於購買其他企業的高價值數位素材。</p>

      <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem', marginBottom: '2rem' }}>
        <Coins size={48} color="var(--accent-color)" style={{ marginBottom: '1rem' }} />
        <h3 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontWeight: 'normal' }}>目前可用餘額</h3>
        <div style={{ fontSize: '3rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
          {balance !== null ? balance.toLocaleString() : '---'} <span style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>pts</span>
        </div>
      </div>

      {(user?.role === 'ENTERPRISE_ADMIN' || user?.role === 'PLATFORM_ADMIN' || user?.role === 'ENTERPRISE_USER') ? (
        <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="glass-panel">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
              <ArrowDownCircle size={20} color="var(--success)" />
              儲值點數
            </h3>
            <input 
              type="number" 
              placeholder="輸入儲值金額..." 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button className="success" style={{ width: '100%', justifyContent: 'center' }} onClick={() => handleAction('topup')} disabled={loading}>
              {loading ? '處理中...' : '確認儲值'}
            </button>
          </div>

          {(user?.role === 'ENTERPRISE_ADMIN' || user?.role === 'PLATFORM_ADMIN') ? (
            <div className="glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                <ArrowUpCircle size={20} color="var(--warning)" />
                提領點數
              </h3>
              <input 
                type="number" 
                placeholder="輸入提領金額..." 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button style={{ width: '100%', justifyContent: 'center', background: 'var(--warning)', borderColor: 'var(--warning)' }} onClick={() => handleAction('withdraw')} disabled={loading}>
                {loading ? '處理中...' : '申請提領'}
              </button>
            </div>
          ) : (
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              提領功能僅限企業管理員操作
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          請登入以操作錢包。
        </div>
      )}
    </div>
  )
}
