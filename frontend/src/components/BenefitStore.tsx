import { useEffect, useState } from 'react'
import { Gift, Tag, ShoppingCart, Coins, Copy, Check, Search, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface Benefit {
  benefit_id: string
  enterprise_id: string
  company_name: string
  title: string
  description: string
  benefit_type: string
  price_points: number
  image_url: string | null
  stock: number
  is_active: boolean
  created_at: string
}

const TYPE_LABEL: Record<string, string> = { PRODUCT: '📦 實體商品', VOUCHER: '🎟️ 兌換券', SERVICE: '🛠️ 服務' }

export default function BenefitStore() {
  const { token, user } = useAuth()
  const [benefits, setBenefits] = useState<Benefit[]>([])
  const [myPoints, setMyPoints] = useState(0)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [codeModal, setCodeModal] = useState<{ code: string; title: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const fetchAll = async () => {
    const [bRes, pRes] = await Promise.all([
      fetch('http://localhost:8000/api/benefits'),
      fetch('http://localhost:8000/api/users/my-points', { headers: { Authorization: `Bearer ${token}` } })
    ])
    const [bData, pData] = await Promise.all([bRes.json(), pRes.json()])
    if (bData.status === 'success') setBenefits(bData.data)
    if (pData.status === 'success') setMyPoints(pData.personal_points)
  }

  useEffect(() => { if (token) fetchAll() }, [token])

  const handleRedeem = async (b: Benefit) => {
    if (!confirm(`確定用 ${b.price_points} 個人點數兌換「${b.title}」嗎？`)) return
    setRedeeming(b.benefit_id)
    try {
      const res = await fetch(`http://localhost:8000/api/benefits/${b.benefit_id}/redeem`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setCodeModal({ code: data.redemption_code, title: b.title })
        fetchAll()
      } else showToast(`❌ ${data.detail}`)
    } catch { showToast('❌ 網路連線錯誤') }
    setRedeeming(null)
  }

  const copyCode = () => {
    if (!codeModal) return
    navigator.clipboard.writeText(codeModal.code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const filtered = benefits.filter(b =>
    (!filterType || b.benefit_type === filterType) &&
    (!search || b.title.toLowerCase().includes(search.toLowerCase()) || (b.description || '').toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div style={{ position: 'relative' }}>
      {toast && <div style={{ position: 'fixed', top: '80px', right: '24px', background: '#1e293b', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0.75rem 1.25rem', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>{toast}</div>}

      {/* Redemption code modal */}
      {codeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ maxWidth: '420px', width: '90%', padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
            <h3 style={{ margin: '0 0 0.25rem', color: '#10b981' }}>兌換成功！</h3>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem' }}>「{codeModal.title}」的專屬兌換碼：</p>
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <code style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-color)', letterSpacing: '0.05em', flex: 1 }}>{codeModal.code}</code>
              <button onClick={copyCode} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copied ? '#10b981' : 'var(--text-secondary)', flexShrink: 0 }}>
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>請妥善保存此兌換碼。您也可以在個人帳戶的「我的兌換記錄」中查看。</p>
            <button className="primary" onClick={() => setCodeModal(null)} style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}>確認並關閉</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>福利品大廳</h2>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)' }}>使用個人點數兌換各企業上架的精選福利品</p>
        </div>
        <div style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '10px', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Coins size={18} color="var(--accent-color)" />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>個人點數：</span>
          <strong style={{ color: 'var(--accent-color)', fontSize: '1.1rem' }}>{myPoints.toLocaleString()} pts</strong>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋福利品..." style={{ paddingLeft: '36px', width: '100%', boxSizing: 'border-box' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={14} /></button>}
        </div>
        {['', 'PRODUCT', 'VOUCHER', 'SERVICE'].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            style={{ padding: '0.5rem 1rem', borderRadius: '20px', cursor: 'pointer', border: filterType === t ? '1.5px solid var(--accent-color)' : '1.5px solid transparent', background: filterType === t ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', color: filterType === t ? 'var(--accent-color)' : 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {t === '' ? '全部' : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Benefits grid */}
      <div className="grid-3">
        {filtered.map(b => {
          const canAfford = myPoints >= b.price_points
          const isRedeemable = user?.role === 'ENTERPRISE_USER'
          const imgFilename = b.image_url?.split(/[\\/]/).pop()
          return (
            <div key={b.benefit_id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ height: '160px', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {imgFilename
                  ? <img src={`http://localhost:8000/static/done/${imgFilename}`} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  : <Gift size={48} color="rgba(255,255,255,0.15)" />
                }
              </div>
              <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '0.15rem 0.5rem' }}>{TYPE_LABEL[b.benefit_type] || b.benefit_type}</span>
                    {b.stock === 0 && <span style={{ fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239,68,68,0.12)', borderRadius: '12px', padding: '0.15rem 0.5rem' }}>已售罄</span>}
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{b.title}</h3>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b.description || '暫無描述'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  <Tag size={12} /><span>by {b.company_name}</span>
                  {b.stock > 0 && <><span>·</span><span>剩 {b.stock} 件</span></>}
                  {b.stock === -1 && <><span>·</span><span>無限庫存</span></>}
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ShoppingCart size={15} color="var(--accent-color)" />
                    <span style={{ fontWeight: 700, color: 'var(--accent-color)' }}>{b.price_points} pts</span>
                  </div>
                  {isRedeemable && b.stock !== 0 ? (
                    <button
                      className={canAfford ? 'primary' : ''}
                      onClick={() => handleRedeem(b)}
                      disabled={redeeming === b.benefit_id || !canAfford}
                      style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', opacity: canAfford ? 1 : 0.5, cursor: canAfford ? 'pointer' : 'not-allowed' }}
                    >
                      {redeeming === b.benefit_id ? '處理中...' : canAfford ? '立即兌換' : '點數不足'}
                    </button>
                  ) : b.stock === 0 ? (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>暫時售罄</span>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>僅限員工兌換</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}><Gift size={48} opacity={0.3} style={{ margin: '0 auto 1rem', display: 'block' }} /><p>目前沒有符合條件的福利品</p></div>}
    </div>
  )
}
