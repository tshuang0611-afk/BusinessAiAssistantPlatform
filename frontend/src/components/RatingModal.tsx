import { useState } from 'react'
import { Star } from 'lucide-react'
import { useAuth } from 

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
'../contexts/AuthContext'

interface RatingModalProps {
  assetId: string
  assetTitle: string
  onClose: () => void
  onSuccess: () => void
}

export default function RatingModal({ assetId, assetTitle, onClose, onSuccess }: RatingModalProps) {
  const { token } = useAuth()
  const [score, setScore] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (score === 0) { setError('請選擇評分星數'); return }
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/assets/${assetId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ score, comment })
      })
      const data = await res.json()
      if (res.ok) { onSuccess() }
      else setError(data.detail || '評分失敗')
    } catch { setError('網路錯誤') }
    setLoading(false)
  }

  const LABELS = ['', '非常差', '差', '普通', '好', '非常好！']

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '2rem', background: 'var(--bg-dark)' }}>
        <h3 style={{ margin: '0 0 0.4rem' }}>⭐ 為資產評分</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>{assetTitle}</p>

        {/* Star Picker */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {[1, 2, 3, 4, 5].map(s => (
            <button key={s} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)} onClick={() => setScore(s)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', transition: 'transform 0.1s' }}>
              <Star size={36} fill={(hover || score) >= s ? '#f59e0b' : 'transparent'} color={(hover || score) >= s ? '#f59e0b' : 'rgba(148,163,184,0.4)'} style={{ transition: 'all 0.15s' }} />
            </button>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: (hover || score) ? '#f59e0b' : 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', minHeight: '1.4rem' }}>
          {LABELS[hover || score]}
        </p>

        <textarea value={comment} onChange={e => setComment(e.target.value)}
          placeholder="分享您對此資產的使用心得... （選填）"
          style={{ width: '100%', minHeight: '90px', resize: 'vertical', boxSizing: 'border-box', marginBottom: '1rem' }} />

        {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: '0 0 1rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={handleSubmit} disabled={loading} className="primary" style={{ flex: 1, justifyContent: 'center' }}>
            {loading ? '送出中...' : '確認評分'}
          </button>
          <button onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>取消</button>
        </div>
      </div>
    </div>
  )
}
