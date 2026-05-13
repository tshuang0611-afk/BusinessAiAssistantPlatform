import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface Transaction {
  transaction_id: string;
  amount: string;
  fee_amount: string;
  transaction_type: string;
  description: string;
  created_at: string;
  from_owner_id: string | null;
  to_owner_id: string | null;
  from_company: string | null;
  to_company: string | null;
  asset_title: string | null;
}

export default function TransactionList() {
  const { token, user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token && user?.role === 'PLATFORM_ADMIN') {
      fetch('http://localhost:8000/api/transactions', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success') {
            setTransactions(data.data)
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [token, user])

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'TOPUP': return <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>儲值</span>;
      case 'WITHDRAWAL': return <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>提領</span>;
      case 'ASSET_EXCHANGE': return <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>資產交易</span>;
      case 'FEE': return <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>系統手續費</span>;
      default: return type;
    }
  }

  if (user?.role !== 'PLATFORM_ADMIN') {
    return <div style={{ textAlign: 'center', padding: '3rem' }}>無權限存取此頁面</div>
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>全站交易明細 (平台總帳)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>檢視所有企業的儲值、提領、消費與平台抽成明細。</p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>載入中...</div>
      ) : (
        <div className="glass-panel" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '1rem' }}>時間</th>
                <th style={{ padding: '1rem' }}>交易類型</th>
                <th style={{ padding: '1rem' }}>金額 / 手續費</th>
                <th style={{ padding: '1rem' }}>發款方 (From)</th>
                <th style={{ padding: '1rem' }}>收款方 (To)</th>
                <th style={{ padding: '1rem' }}>說明 / 關聯資產</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.transaction_id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>{getTypeLabel(t.transaction_type)}</td>
                  <td style={{ padding: '1rem' }}>
                    <div>金額: <strong>{Number(t.amount).toFixed(2)}</strong></div>
                    {Number(t.fee_amount) > 0 && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        手續費: {Number(t.fee_amount).toFixed(2)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {t.from_company || (t.from_owner_id ? t.from_owner_id.substring(0, 13) + '...' : '- (系統/現金)')}
                  </td>
                  <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {t.to_company || (t.to_owner_id ? t.to_owner_id.substring(0, 13) + '...' : '- (系統/提領)')}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {t.description || '-'}
                    {t.asset_title && <div style={{ color: 'var(--accent-color)' }}>[資產: {t.asset_title}]</div>}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>尚無任何交易紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
