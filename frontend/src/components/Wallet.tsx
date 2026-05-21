import { useEffect, useState } from 'react'
import { Coins, ArrowDownCircle, ArrowUpCircle, User, CreditCard, Clock, CheckCircle, XCircle, Building2, AlertTriangle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const MIN_WITHDRAW = 5000

type Tab = 'overview' | 'topup' | 'withdraw' | 'history'

const STATUS_MAP: Record<string, { label: string; color: string; icon: JSX.Element }> = {
  PAID:    { label: '付款成功', color: '#10b981', icon: <CheckCircle size={14} /> },
  PENDING: { label: '處理中',   color: '#f59e0b', icon: <Clock size={14} /> },
  FAILED:  { label: '失敗',     color: '#ef4444', icon: <XCircle size={14} /> },
  APPROVED:{ label: '已核准',   color: '#10b981', icon: <CheckCircle size={14} /> },
  REJECTED:{ label: '已拒絕',   color: '#ef4444', icon: <XCircle size={14} /> },
}

const PRESET_AMOUNTS = [1000, 3000, 5000, 10000, 30000, 50000]

const TW_BANKS = [
  { code: '004', name: '台灣銀行' }, { code: '005', name: '土地銀行' },
  { code: '006', name: '合作金庫' }, { code: '007', name: '第一銀行' },
  { code: '008', name: '華南銀行' }, { code: '009', name: '彰化銀行' },
  { code: '012', name: '台北富邦' }, { code: '013', name: '國泰世華' },
  { code: '017', name: '兆豐銀行' }, { code: '021', name: '花旗銀行' },
  { code: '050', name: '台灣企銀' }, { code: '052', name: '渣打銀行' },
  { code: '808', name: '玉山銀行' }, { code: '812', name: '台新銀行' },
  { code: '815', name: '日盛銀行' }, { code: '822', name: '中國信託' },
]

export default function Wallet() {
  const { user, token } = useAuth()
  const isAdmin = user?.role === 'ENTERPRISE_ADMIN' || user?.role === 'PLATFORM_ADMIN'

  const [tab, setTab] = useState<Tab>('overview')
  const [entBalance, setEntBalance] = useState<number | null>(null)
  const [personalPoints, setPersonalPoints] = useState<number | null>(null)
  const [payHistory, setPayHistory] = useState<any[]>([])
  const [withdrawHistory, setWithdrawHistory] = useState<any[]>([])
  const [toast, setToast] = useState({ msg: '', ok: true })

  // 儲值
  const [topupTarget, setTopupTarget] = useState<'PERSONAL' | 'ENTERPRISE'>('PERSONAL')
  const [topupAmt, setTopupAmt] = useState('')
  const [paying, setPaying] = useState(false)

  // 提領
  const [eligible, setEligible] = useState(false)
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [withdrawStep, setWithdrawStep] = useState<'check' | 'form' | 'done'>('check')
  const [withdrawMsg, setWithdrawMsg] = useState('')

  const h = { Authorization: `Bearer ${token}` }

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast({ msg: '', ok: true }), 3500)
  }

  const fetchOverview = async () => {
    if (isAdmin) {
      const r = await fetch(`${API}/api/wallets/me`, { headers: h })
      const d = await r.json()
      if (d.status === 'success') setEntBalance(Number(d.balance))
    }
    const r2 = await fetch(`${API}/api/users/my-points`, { headers: h })
    const d2 = await r2.json()
    if (d2.status === 'success') setPersonalPoints(Number(d2.personal_points))
  }

  const fetchHistory = async () => {
    const r = await fetch(`${API}/api/payment/history`, { headers: h })
    const d = await r.json()
    if (d.status === 'success') setPayHistory(d.data)
    if (isAdmin) {
      const r2 = await fetch(`${API}/api/wallets/withdraw/history`, { headers: h })
      const d2 = await r2.json()
      if (d2.status === 'success') setWithdrawHistory(d2.data)
    }
  }

  const checkWithdraw = async () => {
    const r = await fetch(`${API}/api/wallets/withdraw/check`, { headers: h })
    const d = await r.json()
    if (d.status === 'success') {
      setEligible(d.eligible)
      if (d.eligible) { setWithdrawStep('form'); setWithdrawMsg('') }
      else setWithdrawMsg(d.message)
    }
  }

  useEffect(() => { if (token) { fetchOverview() } }, [token])
  useEffect(() => { if (tab === 'history') fetchHistory() }, [tab])
  useEffect(() => { if (tab === 'withdraw' && isAdmin) checkWithdraw() }, [tab])

  // 建立 ECPay 付款
  const handleTopup = async () => {
    const amt = parseInt(topupAmt)
    if (!amt || amt < 1) { showToast('請輸入有效金額（最低 1 元）', false); return }
    setPaying(true)
    try {
      const res = await fetch(`${API}/api/payment/ecpay/create`, {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          payment_type: topupTarget,
          enterprise_id: topupTarget === 'ENTERPRISE' ? user?.enterprise_id : null
        })
      })
      if (res.ok) {
        // 後端回傳 HTML，開新視窗導向綠界
        const html = await res.text()
        const w = window.open('', '_blank')
        if (w) { w.document.write(html); w.document.close() }
        else { showToast('請允許彈出視窗以前往付款頁面', false) }
      } else {
        const d = await res.json()
        showToast(d.detail || '建立訂單失敗', false)
      }
    } catch { showToast('網路錯誤', false) }
    setPaying(false)
  }

  // 提交提領
  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmt)
    if (!amt || amt < MIN_WITHDRAW) { showToast(`最低提領 ${MIN_WITHDRAW.toLocaleString()} 點`, false); return }
    if (!bankCode) { showToast('請選擇銀行', false); return }
    if (!accountName.trim()) { showToast('請填寫戶名', false); return }
    if (accountNumber.length < 10) { showToast('請填寫正確帳號（至少10碼）', false); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/api/wallets/withdraw`, {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, bank_name: bankName, bank_code: bankCode, account_name: accountName, account_number: accountNumber })
      })
      const d = await res.json()
      if (res.ok) { setWithdrawStep('done'); setWithdrawMsg(d.message); fetchOverview() }
      else showToast(d.detail || '提交失敗', false)
    } catch { showToast('網路錯誤', false) }
    setSubmitting(false)
  }

  const balStyle = (n: number | null) => (
    <span style={{ fontSize: '2.4rem', fontWeight: 800 }}>
      {n !== null ? n.toLocaleString() : '---'}
      <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>pts</span>
    </span>
  )

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: '💼 總覽' },
    { id: 'topup', label: '💳 儲值' },
    ...(isAdmin ? [{ id: 'withdraw' as Tab, label: '🏦 提領' }] : []),
    { id: 'history', label: '📋 記錄' },
  ]

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', position: 'relative' }}>
      {toast.msg && (
        <div style={{ position: 'fixed', top: '80px', right: '24px', zIndex: 9999, background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${toast.ok ? '#10b981' : '#ef4444'}`, color: toast.ok ? '#10b981' : '#ef4444', borderRadius: '10px', padding: '0.75rem 1.25rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxWidth: '320px' }}>
          {toast.msg}
        </div>
      )}

      <h2 style={{ margin: '0 0 0.4rem' }}>點數錢包</h2>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>管理企業與個人點數、儲值金流、提領轉帳</p>

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '0.45rem 1.1rem', borderRadius: '20px', border: tab === t.id ? '1.5px solid var(--accent-color)' : '1.5px solid transparent', background: tab === t.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', color: tab === t.id ? 'var(--accent-color)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 總覽 ── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isAdmin && (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
              <Building2 size={36} color="var(--accent-color)" style={{ marginBottom: '0.5rem' }} />
              <p style={{ margin: '0 0 0.3rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>企業錢包餘額</p>
              {balStyle(entBalance)}
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {entBalance !== null && entBalance < MIN_WITHDRAW
                  ? `⚠️ 需累積至 ${MIN_WITHDRAW.toLocaleString()} 點才可申請提領`
                  : entBalance !== null ? '✅ 已達提領門檻，可至「提領」頁申請' : ''}
              </p>
            </div>
          )}
          <div className="glass-panel" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <User size={32} color="#818cf8" />
              <div>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>個人點數餘額</p>
                {balStyle(personalPoints)}
              </div>
            </div>
            <div style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '8px', padding: '0.8rem', fontSize: '0.82rem', color: 'rgba(129,140,248,0.9)' }}>
              💡 來源：① 企業管理員年度福利分配 ② 自行現金購買<br />
              用途：購買數位資產 · 兌換企業福利品
            </div>
          </div>
        </div>
      )}

      {/* ── 儲值 ── */}
      {tab === 'topup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isAdmin && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
              {(['PERSONAL', 'ENTERPRISE'] as const).map(t => (
                <button key={t} onClick={() => setTopupTarget(t)}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '10px', border: topupTarget === t ? '1.5px solid var(--accent-color)' : '1.5px solid transparent', background: topupTarget === t ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', color: topupTarget === t ? 'var(--accent-color)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>
                  {t === 'PERSONAL' ? '👤 個人點數' : '🏢 企業錢包'}
                </button>
              ))}
            </div>
          )}

          <div className="glass-panel">
            <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>
              <CreditCard size={16} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
              選擇儲值金額（台幣 = 點數，1:1）
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
              {PRESET_AMOUNTS.map(a => (
                <button key={a} onClick={() => setTopupAmt(String(a))}
                  style={{ padding: '0.6rem', borderRadius: '8px', border: topupAmt === String(a) ? '1.5px solid var(--accent-color)' : '1.5px solid rgba(255,255,255,0.1)', background: topupAmt === String(a) ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                  {a.toLocaleString()}
                </button>
              ))}
            </div>
            <input type="number" placeholder="或輸入自訂金額（元）" value={topupAmt} onChange={e => setTopupAmt(e.target.value)} style={{ marginBottom: '0.75rem' }} />
            {topupAmt && parseInt(topupAmt) > 0 && (
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                付款 <strong style={{ color: 'var(--accent-color)' }}>TWD {parseInt(topupAmt).toLocaleString()}</strong> → 獲得 <strong style={{ color: '#10b981' }}>{parseInt(topupAmt).toLocaleString()} 點</strong>（含 2~3% 金流手續費由平台吸收）
              </p>
            )}
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '0.65rem', fontSize: '0.8rem', color: 'rgba(245,158,11,0.9)', marginBottom: '1rem' }}>
              🔒 點擊「前往付款」將開啟綠界安全付款頁面，支援信用卡、ATM 轉帳、超商繳費、Line Pay
            </div>
            <button className="primary" onClick={handleTopup} disabled={paying || !topupAmt || parseInt(topupAmt) < 1}
              style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}>
              {paying ? '建立訂單中...' : '🔒 前往綠界安全付款'}
            </button>
          </div>
        </div>
      )}

      {/* ── 提領 ── */}
      {tab === 'withdraw' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {withdrawStep === 'check' && (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <AlertTriangle size={40} color={eligible ? '#10b981' : '#f59e0b'} style={{ marginBottom: '1rem' }} />
              <p style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>{withdrawMsg || '正在檢查提領資格...'}</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0' }}>
                目前企業餘額：<strong>{entBalance?.toLocaleString() ?? '---'} pts</strong> ／ 最低門檻：<strong>{MIN_WITHDRAW.toLocaleString()} pts</strong>
              </p>
            </div>
          )}

          {withdrawStep === 'form' && (
            <div className="glass-panel">
              <h3 style={{ marginTop: 0 }}>
                <ArrowUpCircle size={18} color="var(--warning)" style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                申請提領
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 0 }}>
                目前餘額：<strong style={{ color: 'var(--accent-color)' }}>{entBalance?.toLocaleString()} pts</strong>（提領後約 3–5 個工作日內轉帳）
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    提領點數（最低 {MIN_WITHDRAW.toLocaleString()} 點）
                  </label>
                  <input type="number" placeholder={`最低 ${MIN_WITHDRAW}`} value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)} />
                  {withdrawAmt && parseFloat(withdrawAmt) >= MIN_WITHDRAW && (
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: '#10b981' }}>
                      預計收到約 TWD {parseFloat(withdrawAmt).toLocaleString()}（1點=1元）
                    </p>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>銀行</label>
                    <select value={bankCode} onChange={e => { setBankCode(e.target.value); setBankName(TW_BANKS.find(b => b.code === e.target.value)?.name || '') }}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '0.6rem', color: 'var(--text-primary)' }}>
                      <option value="">選擇銀行</option>
                      {TW_BANKS.map(b => <option key={b.code} value={b.code}>{b.code} {b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>戶名</label>
                    <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="請輸入帳戶戶名" />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>銀行帳號</label>
                  <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="請輸入完整帳號" maxLength={16} />
                </div>

                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.65rem', fontSize: '0.8rem', color: 'rgba(239,68,68,0.9)' }}>
                  ⚠️ 提領申請提交後，點數將立即凍結，待平台管理員審核後執行轉帳。拒絕時點數原路退回。
                </div>

                <button className="primary" onClick={handleWithdraw} disabled={submitting}
                  style={{ width: '100%', padding: '0.85rem', background: 'var(--warning)', borderColor: 'var(--warning)' }}>
                  {submitting ? '提交中...' : '確認申請提領'}
                </button>
              </div>
            </div>
          )}

          {withdrawStep === 'done' && (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <CheckCircle size={48} color="#10b981" style={{ marginBottom: '1rem' }} />
              <h3 style={{ color: '#10b981', marginTop: 0 }}>申請已提交！</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.7 }}>{withdrawMsg}</p>
              <button className="primary" onClick={() => { setWithdrawStep('form'); setWithdrawAmt(''); setBankCode(''); setAccountName(''); setAccountNumber('') }}
                style={{ marginTop: '1rem' }}>再次申請</button>
            </div>
          )}
        </div>
      )}

      {/* ── 記錄 ── */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-panel">
            <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>💳 付款記錄</h3>
            {payHistory.length === 0
              ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>尚無付款記錄</p>
              : payHistory.map((r: any) => {
                const s = STATUS_MAP[r.status] || STATUS_MAP.PENDING
                return (
                  <div key={r.order_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', marginBottom: '0.5rem' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>TWD {Number(r.amount).toLocaleString()} → {Number(r.points_to_add).toLocaleString()} pts</p>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.payment_type === 'ENTERPRISE' ? '企業' : '個人'} · {new Date(r.created_at).toLocaleDateString('zh-TW')}</p>
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: s.color, background: `${s.color}18`, padding: '0.2rem 0.6rem', borderRadius: '10px' }}>
                      {s.icon} {s.label}
                    </span>
                  </div>
                )
              })}
          </div>

          {isAdmin && (
            <div className="glass-panel">
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>🏦 提領記錄</h3>
              {withdrawHistory.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>尚無提領記錄</p>
                : withdrawHistory.map((r: any) => {
                  const s = STATUS_MAP[r.status] || STATUS_MAP.PENDING
                  return (
                    <div key={r.request_id} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>{Number(r.amount).toLocaleString()} pts → TWD {Number(r.amount).toLocaleString()}</p>
                          <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.bank_name} · {r.account_masked} · {r.account_name}</p>
                          {r.admin_note && <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#ef4444' }}>備注：{r.admin_note}</p>}
                        </div>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: s.color, background: `${s.color}18`, padding: '0.2rem 0.6rem', borderRadius: '10px', flexShrink: 0 }}>
                          {s.icon} {s.label}
                        </span>
                      </div>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{new Date(r.created_at).toLocaleString('zh-TW')}</p>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
