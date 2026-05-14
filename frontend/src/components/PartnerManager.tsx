import { useEffect, useState } from 'react'
import { Plus, Link, ToggleLeft, ToggleRight, Copy, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface Partner {
  platform_id: string
  name: string
  api_key_preview: string
  callback_url: string
  is_active: boolean
  created_at: string
}

export default function PartnerManager() {
  const { token } = useAuth()
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', callback_url: '' })
  const [newKey, setNewKey] = useState('')
  const [newKeyName, setNewKeyName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const fetchPartners = async () => {
    setLoading(true)
    const res = await fetch('http://localhost:8000/api/admin/partner-platforms', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (data.status === 'success') setPartners(data.data)
    setLoading(false)
  }

  useEffect(() => { if (token) fetchPartners() }, [token])

  const handleCreate = async () => {
    if (!form.name.trim()) { showToast('請輸入平台名稱'); return }
    setSubmitting(true)
    try {
      const res = await fetch('http://localhost:8000/api/admin/partner-platforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (res.ok) {
        setNewKey(data.api_key)
        setNewKeyName(form.name)
        setForm({ name: '', callback_url: '' })
        setShowForm(false)
        fetchPartners()
      } else showToast(`❌ ${data.detail}`)
    } catch { showToast('❌ 網路錯誤') }
    setSubmitting(false)
  }

  const handleToggle = async (pid: string) => {
    await fetch(`http://localhost:8000/api/admin/partner-platforms/${pid}/toggle`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}` }
    })
    fetchPartners()
  }

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', position: 'relative' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '80px', right: '24px', background: '#1e293b', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0.75rem 1.25rem', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>🔌 夥伴平台管理</h2>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)' }}>管理可調用 CAXN Webhook API 的外部夥伴平台及 API 金鑰</p>
        </div>
        <button className="primary" onClick={() => setShowForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Plus size={16} /> 新增夥伴
        </button>
      </div>

      {/* New API Key Alert */}
      {newKey && (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <AlertCircle size={18} color="#10b981" />
            <strong style={{ color: '#10b981' }}>「{newKeyName}」的 API Key（僅顯示一次，請立即複製）</strong>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <code style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: '0.65rem 1rem', borderRadius: '8px', fontSize: '0.85rem', letterSpacing: '0.02em', wordBreak: 'break-all' }}>{newKey}</code>
            <button onClick={() => { navigator.clipboard.writeText(newKey); showToast('已複製！') }} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Copy size={14} /> 複製
            </button>
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'rgba(16,185,129,0.7)' }}>此 API Key 只顯示一次，關閉後無法再次查看。</p>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="glass-panel" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginTop: 0 }}>新增夥伴平台</h3>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>平台名稱 *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例如：HR 系統、ERP 平台" />
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>Callback URL（選填）</label>
          <input value={form.callback_url} onChange={e => setForm(f => ({ ...f, callback_url: e.target.value }))} placeholder="https://your-platform.com/webhook/caxn" />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            兌換碼驗證成功後，CAXN 將向此 URL 發送 POST 請求。
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="primary" onClick={handleCreate} disabled={submitting}>{submitting ? '建立中...' : '建立夥伴並生成 API Key'}</button>
            <button onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      {/* Webhook Info Card */}
      <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Link size={15} color="#6366f1" />
          <strong style={{ fontSize: '0.875rem', color: '#818cf8' }}>兌換碼驗證端點</strong>
        </div>
        <code style={{ fontSize: '0.82rem', color: '#a5b4fc' }}>POST http://localhost:8000/api/webhook/verify-code</code>
        <pre style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px' }}>{`{ "code": "CAXN-XXXXXXXX", "api_key": "caxn_..." }`}</pre>
      </div>

      {/* Partner List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>載入中...</div>
      ) : partners.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
          <Link size={40} opacity={0.2} style={{ display: 'block', margin: '0 auto 1rem' }} />
          <p>尚未設定任何夥伴平台</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {partners.map(p => (
            <div key={p.platform_id} className="glass-panel" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.3rem' }}>
                  <strong style={{ fontSize: '0.95rem' }}>{p.name}</strong>
                  <span style={{ fontSize: '0.75rem', borderRadius: '12px', padding: '0.1rem 0.6rem', background: p.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: p.is_active ? '#10b981' : '#ef4444' }}>
                    {p.is_active ? '啟用中' : '已停用'}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  API Key: <code style={{ background: 'rgba(255,255,255,0.07)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{p.api_key_preview}</code>
                  {p.callback_url && <span style={{ marginLeft: '0.75rem' }}>· Callback: {p.callback_url.slice(0, 40)}{p.callback_url.length > 40 ? '...' : ''}</span>}
                </p>
              </div>
              <button onClick={() => handleToggle(p.platform_id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: p.is_active ? '#10b981' : 'var(--text-secondary)', padding: '0.4rem' }}>
                {p.is_active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
