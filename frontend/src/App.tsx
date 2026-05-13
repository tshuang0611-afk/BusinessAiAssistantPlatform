import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import Wallet from './components/Wallet'
import Login from './components/Login'
import Register from './components/Register'
import AssetManager from './components/AssetManager'
import TransactionList from './components/TransactionList'
import AdminApproval from './components/AdminApproval'
import AICreator from './components/AICreator'
import UploadHub from './components/UploadHub'
import UploadMaterial from './components/UploadMaterial'
import UploadCreative from './components/UploadCreative'
import UploadBenefit from './components/UploadBenefit'
import PointDistribution from './components/PointDistribution'
import BenefitStore from './components/BenefitStore'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import {
  LayoutDashboard, Wallet as WalletIcon, UploadCloud, Cloud, LogOut,
  PackageSearch, FileText, ShieldCheck, Sparkles, Users, Gift
} from 'lucide-react'
import './index.css'

type UploadTrack = 'hub' | 'material' | 'creative' | 'benefit'

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [uploadTrack, setUploadTrack] = useState<UploadTrack>('hub')
  const [showRegister, setShowRegister] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const { user, logout, token } = useAuth()

  useEffect(() => {
    if (user?.role === 'PLATFORM_ADMIN' && token) {
      fetch('http://localhost:8000/api/admin/pending-count', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(d => { if (d.status === 'success') setPendingCount(d.count) })
        .catch(() => {})
    }
  }, [user, token, activeTab])

  if (!user) {
    if (showRegister) return <Register onBack={() => setShowRegister(false)} />
    return <Login onRegister={() => setShowRegister(true)} />
  }

  const roleLabels: Record<string, string> = {
    'PLATFORM_ADMIN': '平台管理者',
    'ENTERPRISE_ADMIN': '企業功能性使用者',
    'ENTERPRISE_USER': '企業一般使用者'
  }

  const goTab = (tab: string) => { setActiveTab(tab); if (tab === 'upload') setUploadTrack('hub') }

  return (
    <div className="app-container">
      {/* ===== 第一排：Logo + 使用者資訊 ===== */}
      <div className="header-top">
        <div className="logo">
          <Cloud color="var(--accent-color)" size={24} />
          <h1>CAXN Platform</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{roleLabels[user.role]}</div>
            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{user.sub}</div>
          </div>
          <button onClick={logout} className="danger" style={{ padding: '0.45rem 0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="登出">
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* ===== 第二排：導覽頁籤 ===== */}
      <div className="header-nav">
        <nav className="nav-tabs">
            {/* 資產大廳 — 所有人 */}
            <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => goTab('dashboard')}>
              <LayoutDashboard size={18} /> 資產大廳
            </button>

            {/* 上傳資產 — 企業/平台管理員 */}
            {(user.role === 'ENTERPRISE_ADMIN' || user.role === 'PLATFORM_ADMIN') && (
              <button className={activeTab === 'upload' ? 'active' : ''} onClick={() => goTab('upload')}>
                <UploadCloud size={18} /> 上傳資產
              </button>
            )}

            {/* 資產管理 — 企業管理員 */}
            {user.role === 'ENTERPRISE_ADMIN' && (
              <button className={activeTab === 'manage' ? 'active' : ''} onClick={() => goTab('manage')}>
                <PackageSearch size={18} /> 資產管理
              </button>
            )}

            {/* AI 創作坊 — 企業管理員 */}
            {user.role === 'ENTERPRISE_ADMIN' && (
              <button className={activeTab === 'ai_creator' ? 'active' : ''} onClick={() => goTab('ai_creator')}
                style={activeTab !== 'ai_creator' ? { background: 'rgba(99,102,241,0.08)' } : {}}>
                <Sparkles size={18} /> AI 創作坊
              </button>
            )}

            {/* 成員管理 — 企業管理員 */}
            {user.role === 'ENTERPRISE_ADMIN' && (
              <button className={activeTab === 'members' ? 'active' : ''} onClick={() => goTab('members')}>
                <Users size={18} /> 成員管理
              </button>
            )}

            {/* 福利品大廳 — 所有人 */}
            <button className={activeTab === 'benefits' ? 'active' : ''} onClick={() => goTab('benefits')}>
              <Gift size={18} /> 福利品大廳
            </button>

            {/* 交易明細 — 平台管理員 */}
            {user.role === 'PLATFORM_ADMIN' && (
              <button className={activeTab === 'transactions' ? 'active' : ''} onClick={() => goTab('transactions')}>
                <FileText size={18} /> 交易明細
              </button>
            )}

            {/* 審核管理 — 平台管理員（附 badge） */}
            {user.role === 'PLATFORM_ADMIN' && (
              <button className={activeTab === 'approval' ? 'active' : ''} onClick={() => goTab('approval')}
                style={{ position: 'relative', ...(activeTab !== 'approval' ? { background: 'rgba(16,185,129,0.08)' } : {}) }}>
                <ShieldCheck size={18} /> 審核管理
                {pendingCount > 0 && (
                  <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#ef4444', color: 'white', fontSize: '0.7rem', fontWeight: 700, borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
            )}

            {/* 點數錢包 — 所有人 */}
            <button className={activeTab === 'wallet' ? 'active' : ''} onClick={() => goTab('wallet')}>
              <WalletIcon size={18} /> 點數錢包
            </button>
          </nav>
        </div>

      <main>
        {activeTab === 'dashboard'    && <Dashboard />}

        {activeTab === 'upload' && (
          uploadTrack === 'hub'      ? <UploadHub onSelect={t => setUploadTrack(t)} /> :
          uploadTrack === 'material' ? <UploadMaterial onBack={() => setUploadTrack('hub')} onSuccess={() => goTab('manage')} /> :
          uploadTrack === 'creative' ? <UploadCreative onBack={() => setUploadTrack('hub')} onSuccess={() => goTab('dashboard')} /> :
                                       <UploadBenefit  onBack={() => setUploadTrack('hub')} onSuccess={() => goTab('benefits')} />
        )}

        {activeTab === 'manage'       && <AssetManager />}
        {activeTab === 'ai_creator'   && <AICreator />}
        {activeTab === 'members'      && <PointDistribution />}
        {activeTab === 'benefits'     && <BenefitStore />}
        {activeTab === 'transactions' && <TransactionList />}
        {activeTab === 'approval'     && <AdminApproval />}
        {activeTab === 'wallet'       && <Wallet />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  )
}
