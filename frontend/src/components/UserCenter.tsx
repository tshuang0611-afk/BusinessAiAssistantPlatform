import { useEffect, useState } from 'react'
import { User, Key, ShoppingBag, Ticket, Heart, Copy, Check, Eye, EyeOff, Truck, CheckCircle, Clock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const TABS = [
  { id: 'profile', label: '👤 個人資料', icon: <User size={15} /> },
  { id: 'licenses', label: '🔑 已購授權', icon: <ShoppingBag size={15} /> },
  { id: 'redemptions', label: '🎟️ 兌換記錄', icon: <Ticket size={15} /> },
  { id: 'favorites', label: '❤️ 我的收藏', icon: <Heart size={15} /> },
]

const TYPE_LABEL: Record<string, string> = { IMAGE: '🖼️ 圖片素材', VIDEO_AD: '🎬 形象影片', ECARD: '🎴 電子賀卡', COURSE: '📚 線上課程', GOODS: '🎁 福利品' }

export default function UserCenter() {
  const { user, token, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('profile')

  // Profile state
  const [profile, setProfile] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  // Password state
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [pwdMsg, setPwdMsg] = useState('')
  const [changingPwd, setChangingPwd] = useState(false)

  // Data state
  const [licenses, setLicenses] = useState<any[]>([])
  const [redemptions, setRedemptions] = useState<any[]>([])
  const [favorites, setFavorites] = useState<any[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  const h = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    fetch(`${API}/api/users/me/profile`, { headers: h }).then(r => r.json()).then(d => {
      if (d.status === 'success') {
        setProfile(d.data); setDisplayName(d.data.username || ''); setPhone(d.data.phone_number || '')
      }
    })
  }, [token])

  useEffect(() => {
    if (activeTab === 'licenses' && licenses.length === 0)
      fetch(`${API}/api/users/me/licenses`, { headers: h }).then(r => r.json()).then(d => { if (d.status === 'success') setLicenses(d.data) })
    if (activeTab === 'redemptions' && redemptions.length === 0)
      fetch(`${API}/api/users/me/redemptions`, { headers: h }).then(r => r.json()).then(d => { if (d.status === 'success') setRedemptions(d.data) })
    if (activeTab === 'favorites' && favorites.length === 0)
      fetch(`${API}/api/users/favorites`, { headers: h }).then(r => r.json()).then(d => { if (d.status === 'success') setFavorites(d.data) })
  }, [activeTab, token])

  const saveProfile = async () => {
    setSaving(true); setProfileMsg('')
    const res = await fetch(`${API}/api/users/me`, { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: displayName, phone_number: phone }) })
    const d = await res.json()
    setProfileMsg(res.ok ? '✅ 資料已更新' : `❌ ${d.detail}`)
    setSaving(false)
  }

  const changePassword = async () => {
    if (newPwd !== confirmPwd) { setPwdMsg('❌ 新密碼兩次輸入不一致'); return }
    setChangingPwd(true); setPwdMsg('')
    const res = await fetch(`${API}/api/users/me/password`, { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }) })
    const d = await res.json()
    if (res.ok) { setPwdMsg('✅ 密碼已更新，請重新登入'); setTimeout(() => logout(), 2000) }
    else setPwdMsg(`❌ ${d.detail}`)
    setChangingPwd(false)
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 2000)
  }

  const removeFavorite = async (assetId: string) => {
    await fetch(`${API}/api/assets/${assetId}/favorite`, { method: 'DELETE', headers: h })
    setFavorites(prev => prev.filter(f => f.asset_id !== assetId))
  }

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>👤 個人中心</h2>
        <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)' }}>管理您的帳號資料、授權記錄與收藏清單</p>
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.875rem', border: activeTab === t.id ? '1.5px solid var(--accent-color)' : '1.5px solid transparent', background: activeTab === t.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', color: activeTab === t.id ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ===== 個人資料 Tab ===== */}
      {activeTab === 'profile' && profile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Basic Info */}
          <div className="glass-panel">
            <h3 style={{ marginTop: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>基本資料</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>顯示名稱</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>聯絡電話</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem', padding: '0.65rem 0.85rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.83rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>角色：</span><strong>{profile.user_role}</strong>
              <span style={{ color: 'var(--text-secondary)', marginLeft: '1rem' }}>個人點數：</span><strong style={{ color: 'var(--accent-color)' }}>{Number(profile.personal_points).toLocaleString()} pts</strong>
              <span style={{ color: 'var(--text-secondary)', marginLeft: '1rem' }}>加入時間：</span><span>{new Date(profile.created_at).toLocaleDateString('zh-TW')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button className="primary" onClick={saveProfile} disabled={saving}>{saving ? '儲存中...' : '儲存變更'}</button>
              {profileMsg && <span style={{ fontSize: '0.875rem', color: profileMsg.startsWith('✅') ? '#10b981' : '#ef4444' }}>{profileMsg}</span>}
            </div>
          </div>

          {/* Change Password */}
          <div className="glass-panel">
            <h3 style={{ marginTop: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              <Key size={15} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />修改密碼
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {[
                { label: '目前密碼', value: oldPwd, setter: setOldPwd },
                { label: '新密碼（至少 6 碼）', value: newPwd, setter: setNewPwd },
                { label: '確認新密碼', value: confirmPwd, setter: setConfirmPwd },
              ].map(f => (
                <div key={f.label} style={{ position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{f.label}</label>
                  <input type={showPwd ? 'text' : 'password'} value={f.value} onChange={e => f.setter(e.target.value)} style={{ paddingRight: '2.5rem' }} />
                </div>
              ))}
              <button onClick={() => setShowPwd(v => !v)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', width: 'fit-content' }}>
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />} {showPwd ? '隱藏密碼' : '顯示密碼'}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button className="primary" onClick={changePassword} disabled={changingPwd}>{changingPwd ? '更新中...' : '確認修改密碼'}</button>
                {pwdMsg && <span style={{ fontSize: '0.875rem', color: pwdMsg.startsWith('✅') ? '#10b981' : '#ef4444' }}>{pwdMsg}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 已購授權 Tab ===== */}
      {activeTab === 'licenses' && (
        <div>
          {licenses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}><ShoppingBag size={48} opacity={0.2} style={{ display: 'block', margin: '0 auto 1rem' }} /><p>尚未購買任何資產授權</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {licenses.map((l: any) => (
                <div key={`${l.asset_id}-${l.purchased_at}`} className="glass-panel" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                    {TYPE_LABEL[l.asset_type]?.split(' ')[0] || '📄'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {TYPE_LABEL[l.asset_type] || l.asset_type} · 花費 {l.points_spent} pts · {new Date(l.purchased_at).toLocaleDateString('zh-TW')}
                    </p>
                  </div>
                  {l.ai_score && <div style={{ fontSize: '0.8rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '0.2rem 0.5rem', borderRadius: '8px' }}>AI {l.ai_score}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== 兌換記錄 Tab ===== */}
      {activeTab === 'redemptions' && (
        <div>
          {redemptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}><Ticket size={48} opacity={0.2} style={{ display: 'block', margin: '0 auto 1rem' }} /><p>尚無兌換記錄</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {redemptions.map((r: any) => (
                <div key={r.redemption_id} className="glass-panel" style={{ padding: '1.1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem' }}>{r.benefit_title}</p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{new Date(r.created_at).toLocaleDateString('zh-TW')}</p>
                    </div>
                    <span style={{ fontSize: '0.75rem', borderRadius: '12px', padding: '0.15rem 0.6rem', background: r.status === 'USED' ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)', color: r.status === 'USED' ? '#818cf8' : '#10b981' }}>
                      {r.status === 'USED' ? '已使用' : '有效'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.6rem 0.85rem' }}>
                    <code style={{ flex: 1, fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-color)', letterSpacing: '0.05em' }}>{r.redemption_code}</code>
                    <button onClick={() => copyCode(r.redemption_code)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copied === r.redemption_code ? '#10b981' : 'var(--text-secondary)' }}>
                      {copied === r.redemption_code ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  {/* 物流資訊 */}
                  {r.delivery_method && r.delivery_method !== 'COUPON' && (
                    <div style={{ marginTop: '0.65rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {r.order_status === 'SHIPPED' ? <Truck size={14} color="#10b981" /> : <Clock size={14} />}
                      <span style={{ color: r.order_status === 'SHIPPED' ? '#10b981' : 'var(--text-secondary)' }}>
                        {r.order_status === 'SHIPPED' ? `已出貨 · 快遞：${r.tracking_number || '無'}` : '待出貨中'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== 我的收藏 Tab ===== */}
      {activeTab === 'favorites' && (
        <div>
          {favorites.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}><Heart size={48} opacity={0.2} style={{ display: 'block', margin: '0 auto 1rem' }} /><p>尚未收藏任何資產</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {favorites.map((f: any) => (
                <div key={f.asset_id} className="glass-panel" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '1.5rem' }}>{TYPE_LABEL[f.asset_type]?.split(' ')[0] || '📄'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</p>
                    <p style={{ margin: '0.2rem 0 0.5rem', fontSize: '0.78rem', color: 'var(--accent-color)' }}>{f.required_points} pts</p>
                    <button onClick={() => removeFavorite(f.asset_id)} style={{ fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.2rem 0.5rem', cursor: 'pointer' }}>
                      移除收藏
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
