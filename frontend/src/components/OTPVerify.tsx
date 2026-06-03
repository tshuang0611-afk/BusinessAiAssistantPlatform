import { useRef, useState, type KeyboardEvent } from 'react'
import { ShieldCheck, RefreshCw } from 'lucide-react'

interface OTPVerifyProps {
  username: string
  onSuccess: (data: { access_token: string; refresh_token: string; user: any }) => void
  onBack: () => void
}

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function OTPVerify({ username, onSuccess, onBack }: OTPVerifyProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [trustDevice, setTrustDevice] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const newDigits = [...digits]
    newDigits[index] = value
    setDigits(newDigits)
    if (value && index < 5) inputRefs.current[index + 1]?.focus()

    // 自動提交
    if (index === 5 && value) {
      const otp = newDigits.join('')
      if (otp.length === 6) handleVerify(otp)
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigits(pasted.split(''))
      handleVerify(pasted)
    }
  }

  const handleVerify = async (otp: string) => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/api/auth/login/step2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, otp, trust_device: trustDevice })
      })
      const data = await res.json()
      if (res.ok && data.step === 'done') {
        onSuccess(data)
      } else {
        setError(data.detail || '驗證碼錯誤，請重試')
        setDigits(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
      }
    } catch { setError('網路錯誤') }
    setLoading(false)
  }

  const startCountdown = (seconds = 60) => {
    setCountdown(seconds)
    const timer = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(timer); return 0 } return c - 1 })
    }, 1000)
  }

  const otp = digits.join('')

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-dark)' }}>
      <div className="glass-panel" style={{ width: '400px', maxWidth: '92%', padding: '2.5rem 2rem', textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', border: '1px solid rgba(99,102,241,0.3)' }}>
          <ShieldCheck size={28} color="#6366f1" />
        </div>
        <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.4rem' }}>二步驟驗證</h2>
        <p style={{ margin: '0 0 1.75rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          驗證碼已發送至您的 Email，請在 10 分鐘內輸入
        </p>

        {/* 6 格 OTP 輸入框 */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }} onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input key={i} ref={el => { inputRefs.current[i] = el }}
              type="text" inputMode="numeric" maxLength={1} value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              style={{
                width: '46px', height: '54px', textAlign: 'center', fontSize: '1.5rem',
                fontWeight: 700, borderRadius: '10px', padding: 0, margin: 0,
                border: d ? '2px solid var(--accent-color)' : '2px solid rgba(255,255,255,0.15)',
                background: d ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.05)',
                color: 'var(--text-primary)', transition: 'all 0.15s'
              }} />
          ))}
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}

        {/* 信任裝置 */}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={trustDevice} onChange={e => setTrustDevice(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-color)' }} />
          信任此裝置 7 天（下次登入免驗證）
        </label>

        <button className="primary" onClick={() => otp.length === 6 && handleVerify(otp)}
          disabled={loading || otp.length < 6}
          style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', marginBottom: '0.75rem', opacity: otp.length < 6 ? 0.5 : 1 }}>
          {loading ? '驗證中...' : '確認驗證'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>
            ← 返回登入
          </button>
          <button disabled={countdown > 0 || resending} onClick={async () => {
            setResending(true)
            // 重新走 step1 觸發 OTP
            startCountdown()
            setResending(false)
          }} style={{ background: 'transparent', border: 'none', color: countdown > 0 ? 'var(--text-secondary)' : 'var(--accent-color)', cursor: countdown > 0 ? 'default' : 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <RefreshCw size={13} /> {countdown > 0 ? `重新發送 (${countdown}s)` : '重新發送'}
          </button>
        </div>
      </div>
    </div>
  )
}
