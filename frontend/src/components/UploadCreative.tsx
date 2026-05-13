import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Sparkles, UploadCloud, CheckCircle, RefreshCw, Copy, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface Asset { asset_id: string; title: string; asset_type: string }
interface UploadCreativeProps { onBack: () => void; onSuccess: () => void }

const CREATIVE_TYPES = [
  { value: 'VIDEO_AD', label: '🎬 形象影片', accept: 'video/*', ext: 'MP4/MOV' },
  { value: 'ECARD',    label: '🎴 電子賀卡', accept: 'image/*', ext: 'JPG/PNG' },
  { value: 'COURSE',   label: '📚 線上課程', accept: 'video/*', ext: 'MP4/MOV' },
]

export default function UploadCreative({ onBack, onSuccess }: UploadCreativeProps) {
  const { token } = useAuth()
  const [step, setStep] = useState(1)
  const [assetType, setAssetType] = useState('VIDEO_AD')
  const [materials, setMaterials] = useState<Asset[]>([])
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [prompt, setPrompt] = useState('')
  const [script, setScript] = useState<Record<string, unknown> | null>(null)
  const [scriptLoading, setScriptLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [requiredPoints, setRequiredPoints] = useState('100')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('http://localhost:8000/api/assets')
      .then(r => r.json())
      .then(d => { if (d.status === 'success') setMaterials(d.data.filter((a: Asset) => a.asset_type === 'IMAGE')) })
  }, [])

  const generateScript = async () => {
    if (!prompt.trim()) { setError('請填寫需求描述'); return }
    setScriptLoading(true); setError('')
    try {
      const res = await fetch('http://localhost:8000/api/ai/generate-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ asset_id: selectedMaterial, prompt, output_type: assetType === 'ECARD' ? 'ECARD' : 'VIDEO' })
      })
      const data = await res.json()
      if (res.ok) { setScript(data.result); setStep(3) }
      else setError(data.detail || '生成失敗')
    } catch { setError('網路錯誤') }
    setScriptLoading(false)
  }

  const copyScript = () => {
    navigator.clipboard.writeText(JSON.stringify(script, null, 2))
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const handlePublish = async () => {
    if (!file || !title.trim()) { setError('請上傳檔案並填寫標題'); return }
    setUploading(true); setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('title', title)
    fd.append('asset_type', assetType)
    fd.append('required_points', requiredPoints)
    fd.append('associated_asset_id', selectedMaterial)
    fd.append('ai_script', JSON.stringify(script))
    try {
      const res = await fetch('http://localhost:8000/api/upload/creative', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
      })
      const data = await res.json()
      if (res.ok) { setStep(5) }
      else setError(data.detail || '上架失敗')
    } catch { setError('網路錯誤') }
    setUploading(false)
  }

  const stepLabel = ['', '選擇類型與素材', '生成文案腳本', '複製腳本去外部工具生成', '上傳成品並發布', '完成']
  const currentType = CREATIVE_TYPES.find(t => t.value === assetType)!

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={step === 1 ? onBack : () => setStep(s => s - 1)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><ArrowLeft size={20} /></button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>AI 創意內容上架</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>步驟 {step}/4：{stepLabel[step]}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[1,2,3,4].map(s => (
            <div key={s} style={{ width: '32px', height: '4px', borderRadius: '2px', background: step >= s ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
          ))}
        </div>
      </div>

      {error && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}

      {/* Step 1 */}
      {step === 1 && (
        <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>選擇創意類型</label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {CREATIVE_TYPES.map(t => (
                <button key={t.value} onClick={() => setAssetType(t.value)}
                  style={{ flex: 1, minWidth: '140px', padding: '0.75rem', borderRadius: '10px', cursor: 'pointer', border: assetType === t.value ? '2px solid var(--accent-color)' : '2px solid transparent', background: assetType === t.value ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', color: assetType === t.value ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: assetType === t.value ? 700 : 400 }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>參考素材 <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>（選填）</span></label>
            <select value={selectedMaterial} onChange={e => setSelectedMaterial(e.target.value)} style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)' }}>
              <option value="">不選擇素材（純文字生成）</option>
              {materials.map(a => <option key={a.asset_id} value={a.asset_id}>{a.title}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>需求描述</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
              placeholder={assetType === 'ECARD' ? '例：製作中秋節電子賀卡，感謝客戶一年來的支持...' : '例：製作科技感企業形象宣傳影片，主打 AI 資源共享服務...'}
              style={{ width: '100%', resize: 'vertical', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.75rem', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
          </div>
          <button className="primary" onClick={() => { setError(''); setStep(2); generateScript() }} style={{ padding: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} /> 生成 AI 文案腳本（扣 20 點）
          </button>
        </div>
      )}

      {/* Step 2 — Loading */}
      {step === 2 && (
        <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: 'var(--accent-color)', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Gemini 正在生成文案腳本，通常需要 10-20 秒...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Step 3 — Show script */}
      {step === 3 && script && (
        <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: 'var(--accent-color)' }}>✨ AI 文案腳本已生成</strong>
            <button onClick={copyScript} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', color: copied ? '#10b981' : 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {copied ? <><Check size={14} /> 已複製</> : <><Copy size={14} /> 複製全部</>}
            </button>
          </div>
          <pre style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'auto', maxHeight: '300px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(script, null, 2)}
          </pre>
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '0.875rem', fontSize: '0.875rem', color: '#fbbf24' }}>
            💡 請複製上方腳本，前往 <strong>Google Veo / Imagen / Nano Banana</strong> 等外部工具生成最終{assetType === 'ECARD' ? '賀卡圖片' : '影片'}，然後回來上傳成品。
          </div>
          <button className="primary" onClick={() => setStep(4)} style={{ padding: '0.85rem' }}>
            成品已準備好，繼續上傳 →
          </button>
        </div>
      )}

      {/* Step 4 — Upload file */}
      {step === 4 && (
        <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>作品標題</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="為這個作品取個好名字..." style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>上架定價（點數）</label>
            <input type="number" value={requiredPoints} onChange={e => setRequiredPoints(e.target.value)} min={0} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>上傳成品檔案 <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>（{currentType.ext}）</span></label>
            <div onClick={() => fileRef.current?.click()}
              style={{ border: '2px dashed var(--glass-border)', borderRadius: '10px', padding: '2.5rem', textAlign: 'center', cursor: 'pointer' }}>
              <UploadCloud size={36} color="var(--text-secondary)" style={{ marginBottom: '0.75rem' }} />
              {file ? <p style={{ margin: 0, color: 'var(--accent-color)', fontWeight: 600 }}>✅ {file.name}</p> : <p style={{ margin: 0, color: 'var(--text-secondary)' }}>點擊選擇{currentType.label}成品</p>}
            </div>
            <input ref={fileRef} type="file" accept={currentType.accept} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
          </div>
          <button className="primary" onClick={handlePublish} disabled={uploading || !file || !title.trim()}
            style={{ padding: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            {uploading ? <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> 上架中...</> : '🚀 一鍵發布上架'}
          </button>
        </div>
      )}

      {/* Step 5 — Done */}
      {step === 5 && (
        <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center' }}>
          <CheckCircle size={56} color="#10b981" />
          <h3 style={{ margin: 0, color: '#10b981' }}>創意內容已成功上架！</h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>AI 診斷費 10 點已扣除，您的作品現在已在資產大廳公開展示。</p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={onBack}>繼續上架</button>
            <button className="primary" onClick={onSuccess}>前往資產大廳</button>
          </div>
        </div>
      )}
    </div>
  )
}
