import { useState, useRef } from 'react'
import { UploadCloud, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import { useAuth } from 

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
'../contexts/AuthContext'

interface UploadMaterialProps { onBack: () => void; onSuccess: () => void }

export default function UploadMaterial({ onBack, onSuccess }: UploadMaterialProps) {
  const { token } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ is_passed: boolean; ai_score: number; reason: string } | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    setFile(f); setResult(null); setError('')
    setPreview(URL.createObjectURL(f))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true); setError('')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`${API}/api/upload/material`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
      })
      const data = await res.json()
      if (res.ok) { setResult(data) }
      else { setError(data.detail || '上傳失敗') }
    } catch { setError('網路連線錯誤') }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><ArrowLeft size={20} /></button>
        <div>
          <h2 style={{ margin: 0 }}>素材上架</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>上傳圖片素材，由 Gemini AI 自動審核品質與評分</p>
        </div>
      </div>

      {result ? (
        <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          {result.is_passed
            ? <><CheckCircle size={56} color="#10b981" /><h3 style={{ margin: 0, color: '#10b981' }}>審核通過！</h3></>
            : <><XCircle size={56} color="#ef4444" /><h3 style={{ margin: 0, color: '#ef4444' }}>未通過審核</h3></>
          }
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>AI 評分：<strong style={{ color: 'var(--text-primary)' }}>{result.ai_score}</strong> 分</p>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.875rem' }}>{result.reason}</p>
          {result.is_passed && <p style={{ color: '#10b981', fontSize: '0.875rem' }}>企業錢包已獲得 +50 點貢獻獎勵。請前往「資產管理」完成歸檔定價。</p>}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={() => { setFile(null); setPreview(null); setResult(null) }}>繼續上傳</button>
            <button className="primary" onClick={onSuccess}>前往資產管理</button>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <div
            style={{ border: '2px dashed var(--glass-border)', borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            {preview
              ? <img src={preview} alt="preview" style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '8px' }} />
              : <><UploadCloud size={48} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} /><h3 style={{ margin: '0 0 0.5rem' }}>點擊或拖曳圖片至此</h3><p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>支援 JPG, PNG, WEBP, GIF</p></>
            }
          </div>
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {file && <p style={{ margin: '1rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>已選擇：{file.name}</p>}
          {error && <div style={{ margin: '1rem 0 0', color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', padding: '0.75rem', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'center' }}>
            {file && <button onClick={() => { setFile(null); setPreview(null) }}>重新選擇</button>}
            <button className="primary" disabled={!file || loading} onClick={handleUpload} style={{ minWidth: '140px' }}>
              {loading ? '⏳ AI 審核中...' : '送出審核'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
