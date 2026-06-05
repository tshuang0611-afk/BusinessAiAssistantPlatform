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
import Analytics from './components/Analytics'
import OrderManager from './components/OrderManager'
import PartnerManager from './components/PartnerManager'
import NotificationBell from './components/NotificationBell'
import UserCenter from './components/UserCenter'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useMediaQuery } from  './hooks/useMediaQuery'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
import {
  LayoutDashboard, Wallet as WalletIcon, UploadCloud, Cloud, LogOut,
  PackageSearch, FileText, ShieldCheck, Sparkles, Users, Gift,
  BarChart2, Package, Link, Menu, X, UserCircle
} from 'lucide-react'
import './index.css'

type UploadTrack = 'hub' | 'material' | 'creative' | 'benefit'

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [uploadTrack, setUploadTrack] = useState<UploadTrack>('hub')
  const [showRegister, setShowRegister] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { user, logout, token } = useAuth()
  const isMobile = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    if (user?.role === 'PLATFORM_ADMIN' && token) {
      fetch(`${API}/api/admin/pending-count`, {
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

  const goTab = (tab: string) => {
    setActiveTab(tab)
    if (tab === 'upload') setUploadTrack('hub')
    setMobileMenuOpen(false)
  }

  // 根據角色建立頁籤列表
  const navItems = [
    { id: 'dashboard', label: '資產大廳', icon: <LayoutDashboard size={16} />, roles: ['all'] },
    { id: 'upload', label: '上傳資產', icon: <UploadCloud size={16} />, roles: ['ENTERPRISE_ADMIN'] },
    { id: 'manage', label: '資產管理', icon: <PackageSearch size={16} />, roles: ['ENTERPRISE_ADMIN', 'PLATFORM_ADMIN'] },
    { id: 'ai_creator', label: 'AI 創作坊', icon: <Sparkles size={16} />, roles: ['ENTERPRISE_ADMIN'] },
    { id: 'members', label: '成員管理', icon: <Users size={16} />, roles: ['ENTERPRISE_ADMIN'] },
    { id: 'benefits', label: '福利品大廳', icon: <Gift size={16} />, roles: ['all'] },
    { id: 'orders', label: '訂單管理', icon: <Package size={16} />, roles: ['ENTERPRISE_ADMIN'] },
    { id: 'analytics', label: '數據報表', icon: <BarChart2 size={16} />, roles: ['ENTERPRISE_ADMIN', 'PLATFORM_ADMIN'] },
    { id: 'transactions', label: '交易明細', icon: <FileText size={16} />, roles: ['PLATFORM_ADMIN'] },
    { id: 'approval', label: '審核管理', icon: <ShieldCheck size={16} />, roles: ['PLATFORM_ADMIN'], badge: pendingCount },
    { id: 'partners', label: '夥伴管理', icon: <Link size={16} />, roles: ['PLATFORM_ADMIN'] },
    { id: 'wallet', label: '點數錢包', icon: <WalletIcon size={16} />, roles: ['all'] },
    { id: 'user_center', label: '個人中心', icon: <UserCircle size={16} />, roles: ['all'] },
  ].filter(item => item.roles.includes('all') || item.roles.includes(user.role))

  const NavTabs = () => (
    <>
      {navItems.map(item => (
        <button key={item.id}
          className={activeTab === item.id ? 'active' : ''}
          onClick={() => goTab(item.id)}
          style={{ position: 'relative', ...(item.id === 'ai_creator' && activeTab !== 'ai_creator' ? { background: 'rgba(99,102,241,0.08)' } : {}) }}>
          {item.icon} {item.label}
          {item.badge && item.badge > 0 ? (
            <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#ef4444', color: 'white', fontSize: '0.65rem', fontWeight: 700, borderRadius: '50%', width: '17px', height: '17px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.badge > 9 ? '9+' : item.badge}
            </span>
          ) : null}
        </button>
      ))}
    </>
  )

  return (
    <div className="app-container">
      {/* ===== 第一排：Logo + 通知 Bell + 使用者資訊 ===== */}
      <div className="header-top">
        <div className="logo">
          <Cloud color="var(--accent-color)" size={22} />
          <h1>CAXN Platform</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <NotificationBell />
          {!isMobile && (
            <div style={{ textAlign: 'right', borderLeft: '1px solid var(--glass-border)', paddingLeft: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{roleLabels[user.role]}</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.88rem' }}>{user.sub}</div>
            </div>
          )}
          <button onClick={logout} className="danger" style={{ padding: '0.4rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }} title="登出">
            <LogOut size={14} /> {!isMobile && '登出'}
          </button>
          {/* Hamburger (mobile only) */}
          {isMobile && (
            <button onClick={() => setMobileMenuOpen(v => !v)} style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.07)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* ===== 第二排：導覽頁籤 (桌機) ===== */}
      {!isMobile && (
        <div className="header-nav">
          <nav className="nav-tabs">
            <NavTabs />
          </nav>
        </div>
      )}

      {/* ===== 手機側邊選單 ===== */}
      {isMobile && mobileMenuOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 500 }} onClick={() => setMobileMenuOpen(false)}>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '260px', background: 'rgba(15,23,42,0.98)', backdropFilter: 'blur(12px)', borderLeft: '1px solid var(--glass-border)', padding: '4rem 1rem 2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ marginBottom: '0.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {roleLabels[user.role]}<br /><strong style={{ color: 'var(--text-primary)' }}>{user.sub}</strong>
            </div>
            <NavTabs />
          </div>
        </div>
      )}

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
        {activeTab === 'orders'       && <OrderManager />}
        {activeTab === 'analytics'    && <Analytics />}
        {activeTab === 'transactions' && <TransactionList />}
        {activeTab === 'approval'     && <AdminApproval />}
        {activeTab === 'partners'     && <PartnerManager />}
        {activeTab === 'wallet'       && <Wallet />}
        {activeTab === 'user_center'  && <UserCenter />}
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
