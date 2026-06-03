import { useState, useRef } from 'react'
import { UploadCloud, ArrowLeft, Video, Image as ImageIcon, Mail, CheckCircle, Info } from 'lucide-react'
import { useAuth } from 

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
'../contexts/AuthContext'

interface Props {
  onBack: () => void
  onSuccess: () => void
}

const ASSET_TYPE_OPTIONS = [
  { value: 'VIDEO_AD', label: '🎬 形象影片', desc: '由 AI 工具生成的品牌/產品影片（.mp4）', accept: 'video/*', icon: <Video size={20} /> },
  { value: 'ECARD',   label: '🎴 電子賀卡', desc: '由 AI 工具生成的賀卡圖檔（.jpg / .png）', accept: 'image/*', icon: <Mail size={20} /> },
  { value: 'IMAGE',   label: '🖼️ AI 圖像',  desc: '由 AI 工具生成的圖片資產（.jpg / .png）', accept: 'image/*', icon: <ImageIcon size={20} /> },
]

export default function UploadCreative({ onBack, onSuccess }: Props) {
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [assetType, setAssetType] = useState('VIDEO_AD')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [requiredPoints, setRequiredPoints] = useState('100')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const currentType = ASSET_TYPE_OPTIONS.find(t => t.value === assetType)!

  const handleFile = (f: File) => {
    setFile(f)
    setError('')
    const isVideo = f.type.startsWith('video/')
    if (isVideo) {
      setPreview(URL.createObjectURL(f))
    } else {
      const reader = new FileReader()
      reader.onload = e => setPreview(e.target?.result as string)
      reader.readAsDataURL(f)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleSubmit = async () => {
    if (!file) { setError('請選擇要上傳的檔案'); return }
    if (!title.trim()) { setError('請填寫資產名稱'); return }
    if (!requiredPoints || isNaN(Number(requiredPoints)) || Number(requiredPoints) <= 0) {
      setError('請填寫有效的定價點數'); return
    }

    setUploading(true); setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title.trim())
      formData.append('description', description.trim())
      formData.append('tags', tags.trim())
      formData.append('asset_type', assetType)
      formData.append('required_points', requiredPoints)
      formData.append('publish_category', 'CREATIVE')

      const res = await fetch(`${API}/api/upload/creative`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => onSuccess(), 2000)
      } else {
        setError(data.detail || '上傳失敗，請稍後再試')
      }
    } catch {
      setError('網路連線錯誤，請稍後再試')
    }
    setUploading(false)
  }

  if (success) {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
        <h2 style={{ color: '#10b981' }}>上架成功！</h2>
        <p style={{ color: 'var(--text-secondary)' }}>AI 創意內容已上架，消費者可使用點數解鎖存取。即將跳轉至資產大廳...</p>
        <CheckCircle size={48} color="#10b981" style={{ marginTop: '1rem' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem' }}>
        <button onClick={onBack} style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
          <ArrowLeft size={15} /> 返回
        </button>
        <div>
          <h2 style={{ margin: 0 }}>✨ AI 創意內容上架</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            將外部 AI 工具生成的影片或圖片上架為可購買的數位資產
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', padding: '0.85rem 1.1rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <Info size={16} color="#818cf8" style={{ marginTop: '1px', flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: '0.83rem', color: '#a5b4fc', lineHeight: 1.5 }}>
          此功能專為上架由 <strong>外部 AI 工具</strong>（如 Sora、Runway、Midjourney 等）所產出的成品。
          上架後，消費者需消耗指定點數才能解鎖存取。若需先產生文案腳本，請使用「AI 創作坊」。
        </p>
      </div>

      {/* Step 1: 選擇資產類型 */}
      <div className="glass-panel" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>① 選擇資產類型</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {ASSET_TYPE_OPTIONS.map(t => (
            <button key={t.value} onClick={() => { setAssetType(t.value); setFile(null); setPreview(null) }}
              style={{ padding: '1rem 0.75rem', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', border: assetType === t.value ? '2px solid var(--accent-color)' : '2px solid transparent', background: assetType === t.value ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)', flexDirection: 'column', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ color: assetType === t.value ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{t.icon}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: assetType === t.value ? 'var(--accent-color)' : 'var(--text-primary)' }}>{t.label}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: 上傳檔案 */}
      <div className="glass-panel" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>② 上傳 AI 生成檔案</h3>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ border: `2px dashed ${dragOver ? 'var(--accent-color)' : file ? '#10b981' : 'rgba(255,255,255,0.15)'}`, borderRadius: '12px', padding: '2rem', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(99,102,241,0.07)' : 'transparent', transition: 'all 0.2s', marginBottom: '1rem' }}>
          <input ref={fileInputRef} type="file" accept={currentType.accept} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {file ? (
            <div>
              <CheckCircle size={28} color="#10b981" style={{ marginBottom: '0.5rem' }} />
              <p style={{ margin: 0, fontWeight: 600, color: '#10b981' }}>{file.name}</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB · 點擊更換</p>
            </div>
          ) : (
            <div>
              <UploadCloud size={32} color="rgba(255,255,255,0.25)" style={{ marginBottom: '0.75rem' }} />
              <p style={{ margin: 0, fontWeight: 500 }}>拖曳或點擊選擇檔案</p>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {assetType === 'VIDEO_AD' ? 'MP4 / WebM / MOV 影片' : 'JPG / PNG / WEBP 圖片'}
              </p>
            </div>
          )}
        </div>

        {/* 影片/圖片預覽 */}
        {preview && assetType === 'VIDEO_AD' && (
          <video src={preview} controls style={{ width: '100%', borderRadius: '8px', maxHeight: '240px', background: '#000' }} />
        )}
        {preview && assetType !== 'VIDEO_AD' && (
          <img src={preview} alt="preview" style={{ width: '100%', borderRadius: '8px', maxHeight: '240px', objectFit: 'contain', background: '#0f172a' }} />
        )}
      </div>

      {/* Step 3: 資產資訊與定價 */}
      <div className="glass-panel" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>③ 資產資訊與定價</h3>

        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>資產名稱 *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：2025 品牌形象影片 - 春季限定版" />

        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>描述說明</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="說明此 AI 創意內容的用途、主題、適合情境等..."
          style={{ width: '100%', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }} />

        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>標籤（逗號分隔）</label>
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder="品牌形象, AI 生成, 春季活動" />

        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.875rem' }}>解鎖定價（點數）*</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input type="number" value={requiredPoints} onChange={e => setRequiredPoints(e.target.value)}
            placeholder="100" min="1" style={{ width: '160px', marginBottom: 0 }} />
          <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
            消費者需消耗此點數才能解鎖觀看/下載
          </p>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#ef4444', fontSize: '0.875rem' }}>
          ❌ {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="primary" onClick={handleSubmit} disabled={uploading}
          style={{ flex: 1, justifyContent: 'center', padding: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UploadCloud size={18} />
          {uploading ? '上架中...' : '確認上架'}
        </button>
        <button onClick={onBack} style={{ padding: '0.85rem 1.5rem' }}>取消</button>
      </div>
    </div>
  )
}
