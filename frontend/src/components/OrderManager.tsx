import { useEffect, useState } from 'react'
import { Package, Truck, CheckCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from  '../contexts/AuthContext'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

interface Order {
  order_id: string
  benefit_id: string
  benefit_title: string
  buyer_username: string
  recipient_name: string
  recipient_phone: string
  recipient_company: string
  recipient_address: string
  delivery_method: string
  tracking_number: string | null
  status: string
  created_at: string
  shipped_at: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING:   { label: '待出貨', color: '#f59e0b', icon: <Clock size={14} /> },
  SHIPPED:   { label: '已出貨', color: '#10b981', icon: <CheckCircle size={14} /> },
  DELIVERED: { label: '已送達', color: '#6366f1', icon: <CheckCircle size={14} /> },
}

const METHOD_LABEL: Record<string, string> = {
  LOGISTICS: '🚚 物流配送',
  PICKUP:    '🏪 自取',
  COUPON:    '🎟️ 純兌換碼',
}

export default function OrderManager() {
  const { token } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [shippingForm, setShippingForm] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const fetchOrders = async () => {
    setLoading(true)
    const res = await fetch(`${API}/api/enterprise/benefit-orders`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.status === 'success') setOrders(data.data)
    setLoading(false)
  }

  useEffect(() => { if (token) fetchOrders() }, [token])

  const handleShip = async (orderId: string) => {
    setSubmitting(orderId)
    try {
      const res = await fetch(`${API}/api/enterprise/benefit-orders/${orderId}/ship`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tracking_number: shippingForm[orderId] || '' })
      })
      const data = await res.json()
      if (res.ok) { showToast('✅ 已標記出貨，買家將收到通知'); fetchOrders() }
      else showToast(`❌ ${data.detail}`)
    } catch { showToast('❌ 網路錯誤') }
    setSubmitting(null)
  }

  const filtered = filterStatus === 'ALL' ? orders : orders.filter(o => o.status === filterStatus)
  const pendingCount = orders.filter(o => o.status === 'PENDING').length

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', position: 'relative' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '80px', right: '24px', background: '#1e293b', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0.75rem 1.25rem', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>📦 訂單管理</h2>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)' }}>管理員工兌換福利品的物流訂單，標記出貨後員工即時收到通知</p>
        </div>
        {pendingCount > 0 && (
          <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', padding: '0.5rem 1rem', color: '#fbbf24', fontSize: '0.875rem', fontWeight: 600 }}>
            ⚡ {pendingCount} 筆待出貨
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {[
          { value: 'ALL', label: '全部', count: orders.length },
          { value: 'PENDING', label: '待出貨', count: orders.filter(o => o.status === 'PENDING').length },
          { value: 'SHIPPED', label: '已出貨', count: orders.filter(o => o.status === 'SHIPPED').length },
        ].map(f => (
          <button key={f.value} onClick={() => setFilterStatus(f.value)}
            style={{ padding: '0.4rem 1rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem', border: filterStatus === f.value ? '1.5px solid var(--accent-color)' : '1.5px solid transparent', background: filterStatus === f.value ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', color: filterStatus === f.value ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
            {f.label} {f.count > 0 && <span style={{ opacity: 0.7 }}>({f.count})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>載入中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
          <Package size={48} opacity={0.2} style={{ display: 'block', margin: '0 auto 1rem' }} />
          <p>目前沒有{filterStatus !== 'ALL' ? '此狀態的' : ''}訂單</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(order => {
            const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING
            const isExpanded = expandedId === order.order_id
            return (
              <div key={order.order_id} className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Order Summary Row */}
                <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : order.order_id)}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `rgba(${sc.color === '#f59e0b' ? '245,158,11' : sc.color === '#10b981' ? '16,185,129' : '99,102,241'},0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: sc.color, flexShrink: 0 }}>
                    {sc.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.2rem' }}>
                      <strong style={{ fontSize: '0.92rem' }}>{order.benefit_title}</strong>
                      <span style={{ fontSize: '0.75rem', color: sc.color, background: `rgba(${sc.color === '#f59e0b' ? '245,158,11' : '16,185,129'},0.1)`, borderRadius: '12px', padding: '0.1rem 0.5rem' }}>{sc.label}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{METHOD_LABEL[order.delivery_method] || order.delivery_method}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>買家：{order.buyer_username} · {new Date(order.created_at).toLocaleString('zh-TW')}</p>
                  </div>
                  {isExpanded ? <ChevronUp size={16} color="var(--text-secondary)" /> : <ChevronDown size={16} color="var(--text-secondary)" />}
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--glass-border)' }}>
                    <div style={{ paddingTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                      {[
                        { label: '收件人', value: order.recipient_name || '—' },
                        { label: '聯絡電話', value: order.recipient_phone || '—' },
                        { label: '公司名稱', value: order.recipient_company || '—' },
                        { label: '收件地址', value: order.recipient_address || '—' },
                      ].map(f => (
                        <div key={f.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{f.label}</p>
                          <p style={{ margin: '0.15rem 0 0', fontSize: '0.875rem', fontWeight: 500 }}>{f.value}</p>
                        </div>
                      ))}
                    </div>

                    {order.status === 'PENDING' && order.delivery_method !== 'COUPON' && (
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <input type="text" placeholder="輸入快遞單號（選填）" value={shippingForm[order.order_id] || ''}
                          onChange={e => setShippingForm(prev => ({ ...prev, [order.order_id]: e.target.value }))}
                          style={{ flex: 1, margin: 0 }} />
                        <button className="primary" onClick={() => handleShip(order.order_id)} disabled={submitting === order.order_id}
                          style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Truck size={15} /> {submitting === order.order_id ? '處理中...' : '標記已出貨'}
                        </button>
                      </div>
                    )}

                    {order.status === 'SHIPPED' && (
                      <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <CheckCircle size={16} color="#10b981" />
                        <div>
                          <p style={{ margin: 0, fontSize: '0.85rem', color: '#10b981' }}>已出貨 {order.shipped_at ? new Date(order.shipped_at).toLocaleString('zh-TW') : ''}</p>
                          {order.tracking_number && <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>快遞單號：{order.tracking_number}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
