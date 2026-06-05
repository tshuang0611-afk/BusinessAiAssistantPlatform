import { useEffect, useState } from 'react'
import { Gift, Tag, ShoppingCart, Coins, Copy, Check, Search, X, Truck, Package } from 'lucide-react'
import { useAuth } from  '../contexts/AuthContext'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const resolveImageUrl = (url: string | null | undefined) => {
  if (!url || url.trim() === '') return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/uploads/')) {
    return `${API}${url.replace('/uploads/', '/static/')}`;
  }
  if (url.includes('/') || url.includes('\\')) {
    const normalized = url.replace(/\\/g, '/');
    const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `${API}/static${path}`;
  }
  const filename = url.split('/').pop() || url.split('\\').pop();
  return `${API}/static/done/${filename}`;
}

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

interface OrderForm {
  delivery_method: string
  recipient_name: string
  recipient_phone: string
  recipient_company: string
  recipient_address: string
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

  // 物流表單 Modal
  const [logisticsTarget, setLogisticsTarget] = useState<Benefit | null>(null)
  const [orderForm, setOrderForm] = useState<OrderForm>({
    delivery_method: 'COUPON', recipient_name: '', recipient_phone: '', recipient_company: '', recipient_address: ''
  })

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const fetchAll = async () => {
    const [bRes, pRes] = await Promise.all([
      fetch(`${API}/api/benefits`),
      fetch(`${API}/api/users/my-points`, { headers: { Authorization: `Bearer ${token}` } })
    ])
    const [bData, pData] = await Promise.all([bRes.json(), pRes.json()])
    if (bData.status === 'success') setBenefits(bData.data)
    if (pData.status === 'success') setMyPoints(pData.personal_points)
  }

  useEffect(() => { if (token) fetchAll() }, [token])

  const openRedeemFlow = (b: Benefit) => {
    setLogisticsTarget(b)
    setOrderForm({ delivery_method: 'COUPON', recipient_name: '', recipient_phone: '', recipient_company: '', recipient_address: '' })
  }

  const handleRedeem = async () => {
    if (!logisticsTarget) return
    if (orderForm.delivery_method !== 'COUPON' && !orderForm.recipient_name.trim()) {
      showToast('❌ 請填寫收件人姓名'); return
    }
    setRedeeming(logisticsTarget.benefit_id)
    try {
      const res = await fetch(`${API}/api/benefits/${logisticsTarget.benefit_id}/redeem-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(orderForm)
      })
      const data = await res.json()
      if (res.ok) {
        setLogisticsTarget(null)
        setCodeModal({ code: data.redemption_code, title: logisticsTarget.title })
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

  const needsLogistics = orderForm.delivery_method !== 'COUPON'

  return (
    <div style={{ position: 'relative' }}>
      {toast && <div style={{ position: 'fixed', top: '80px', right: '24px', background: '#1e293b', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0.75rem 1.25rem', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>{toast}</div>}

      {/* ===== 物流兌換 Modal ===== */}
      {logisticsTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '2rem', background: 'var(--bg-dark)' }}>
            <h3 style={{ margin: '0 0 0.25rem' }}>🎁 兌換 — {logisticsTarget.title}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              費用：<strong style={{ color: 'var(--accent-color)' }}>{logisticsTarget.price_points} pts</strong> · 您的餘額：<strong>{myPoints} pts</strong>
            </p>

            {/* Step 1: 選擇取貨方式 */}
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.6rem', fontSize: '0.9rem' }}>取貨方式</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {[
                { value: 'COUPON', icon: '🎟️', label: '純兌換碼' },
                { value: 'LOGISTICS', icon: '🚚', label: '物流配送' },
                { value: 'PICKUP', icon: '🏪', label: '自取' },
              ].map(m => (
                <button key={m.value} onClick={() => setOrderForm(f => ({ ...f, delivery_method: m.value }))}
                  style={{ padding: '0.75rem', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', border: orderForm.delivery_method === m.value ? '2px solid var(--accent-color)' : '2px solid transparent', background: orderForm.delivery_method === m.value ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', flexDirection: 'column', gap: '0.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '1.4rem' }}>{m.icon}</span>
                  <span style={{ fontSize: '0.8rem', color: orderForm.delivery_method === m.value ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{m.label}</span>
                </button>
              ))}
            </div>

            {/* Step 2: 填寫收件資訊（物流/自取才顯示） */}
            {needsLogistics && (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', color: '#818cf8', fontWeight: 600, fontSize: '0.875rem' }}>
                  <Package size={15} /> 收件資訊（發貨公司將使用此資訊出貨）
                </div>
                {[
                  { field: 'recipient_name', label: '收件人姓名 *', placeholder: '請輸入姓名' },
                  { field: 'recipient_phone', label: '聯絡電話 *', placeholder: '請輸入電話' },
                  { field: 'recipient_company', label: '公司名稱', placeholder: '請輸入公司名稱' },
                  ...(orderForm.delivery_method === 'LOGISTICS' ? [{ field: 'recipient_address', label: '收件地址 *', placeholder: '請輸入完整地址' }] : []),
                ].map(f => (
                  <div key={f.field}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{f.label}</label>
                    <input value={(orderForm as any)[f.field]} onChange={e => setOrderForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                      placeholder={f.placeholder} style={{ marginBottom: '0.65rem' }} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="primary" onClick={handleRedeem} disabled={!!redeeming}
                style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {redeeming ? '處理中...' : <><Truck size={15} /> 確認兌換</>}
              </button>
              <button onClick={() => setLogisticsTarget(null)} style={{ flex: 1, justifyContent: 'center' }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 兌換碼 Modal ===== */}
      {codeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ maxWidth: '420px', width: '90%', padding: '2rem', textAlign: 'center', background: 'var(--bg-dark)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
            <h3 style={{ margin: '0 0 0.25rem', color: '#10b981' }}>兌換成功！</h3>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem' }}>「{codeModal.title}」的專屬兌換碼：</p>
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <code style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-color)', letterSpacing: '0.05em', flex: 1 }}>{codeModal.code}</code>
              <button onClick={copyCode} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copied ? '#10b981' : 'var(--text-secondary)' }}>
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
              請妥善保存此兌換碼。若選擇物流配送，發貨公司將依據您填寫的地址寄送。
            </p>
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
          const imgUrl = resolveImageUrl(b.image_url)
          return (
            <div key={b.benefit_id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ height: '160px', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {imgUrl
                  ? <img src={imgUrl} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  : <Gift size={48} color="rgba(255,255,255,0.15)" />}
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
                    <button className={canAfford ? 'primary' : ''} onClick={() => canAfford && openRedeemFlow(b)}
                      disabled={!canAfford} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', opacity: canAfford ? 1 : 0.5, cursor: canAfford ? 'pointer' : 'not-allowed' }}>
                      {canAfford ? '立即兌換' : '點數不足'}
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
