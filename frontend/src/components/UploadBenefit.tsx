import { useState, useRef } from 'react'
import { ArrowLeft, Gift, UploadCloud, CheckCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface UploadBenefitProps { onBack: () => void; onSuccess: () => void }

const BENEFIT_TYPES = [
  { value: 'PRODUCT',  label: '📦 實體商品' },
  { value: 'VOUCHER',  label: '🎟️ 兌換券' },
  { value: 'SERVICE',  label: '🛠️ 服務' },
]

export default function UploadBenefit({ onBack, onSuccess }: UploadBenefitProps) {
  const { token } = useAuth()
  const [form, setForm] = useState({ title: '', description: '', benefit_type: 'PRODUCT', price_points: '0', stock: '-1' })
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('請填寫福利品名稱'); return }
    setLoading(true); setError('')
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v))
    if (file) fd.append('file', file)
    try {
      const res = await fetch('http://localhost:8000/api/benefits', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
      })
      const data = await res.json()
      if (res.ok) setDone(true)
      else setError(data.detail || '發布失敗')
    } catch { setError('網路連線錯誤') }
    setLoading(false)
  }

  if (done) return (
    <div style={{ maxWidth: '560px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center' }}>
        <CheckCircle size={56} color="#10b981" />
        <h3 style={{ margin: 0, color: '#10b981' }}>福利品已成功上架！</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>員工現在可以在「福利品大廳」用個人點數兌換。</p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => { setDone(false); setForm({ title: '', description: '', benefit_type: 'PRODUCT', price_points: '0', stock: '-1' }); setFile(null); setPreview(null) }}>繼續上架</button>
          <button className="primary" onClick={onSuccess}>前往福利品大廳</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><ArrowLeft size={20} /></button>
        <div>
          <h2 style={{ margin: 0 }}>企業福利品上架</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>填寫商品資訊並上架，員工可用個人點數兌換並獲得兌換碼</p>
        </div>
      </div>

      {error && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}

      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Cover image */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.75rem' }}>封面圖片 <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>（選填）</span></label>
          <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed var(--glass-border)', borderRadius: '10px', height: '150px', cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)' }}>
            {preview
              ? <img src={preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}><UploadCloud size={28} /><p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>點擊上傳封面圖</p></div>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)) } }} />
        </div>

        {/* Type */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.75rem' }}>福利品類型</label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {BENEFIT_TYPES.map(t => (
              <button key={t.value} onClick={() => setForm(f => ({ ...f, benefit_type: t.value }))}
                style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', cursor: 'pointer', border: form.benefit_type === t.value ? '2px solid #10b981' : '2px solid transparent', background: form.benefit_type === t.value ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)', color: form.benefit_type === t.value ? '#10b981' : 'var(--text-secondary)', fontWeight: form.benefit_type === t.value ? 700 : 400 }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>福利品名稱</label>
          <input type="text" value={form.title} onChange={set('title')} placeholder="例：星巴克咖啡兌換券" style={{ width: '100%' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>描述</label>
          <textarea value={form.description} onChange={set('description')} rows={3} placeholder="說明福利品內容、使用方式、注意事項..." style={{ width: '100%', resize: 'vertical', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.75rem', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>兌換所需點數</label>
            <input type="number" value={form.price_points} onChange={set('price_points')} min={0} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>庫存數量</label>
            <input type="number" value={form.stock} onChange={set('stock')} min={-1} style={{ width: '100%' }} />
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>-1 = 無限庫存</p>
          </div>
        </div>

        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '0.875rem', fontSize: '0.875rem', color: 'rgba(16,185,129,0.9)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <Gift size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          員工兌換後系統自動生成格式為 <code style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '0 4px' }}>CAXN-XXXXXXXXXXXXXXXX</code> 的唯一兌換碼，並預留 external_ref 欄位供與外部平台對接。
        </div>

        <button className="success" onClick={handleSubmit} disabled={loading} style={{ padding: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          {loading ? '上架中...' : <><Gift size={18} /> 立即上架福利品</>}
        </button>
      </div>
    </div>
  )
}
