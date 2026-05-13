import { useState } from 'react'
import Dashboard from './components/Dashboard'
import Wallet from './components/Wallet'
import Upload from './components/Upload'
import Login from './components/Login'
import Register from './components/Register'
import AssetManager from './components/AssetManager'
import TransactionList from './components/TransactionList'
import AdminApproval from './components/AdminApproval'
import AICreator from './components/AICreator'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LayoutDashboard, Wallet as WalletIcon, UploadCloud, Cloud, LogOut, PackageSearch, FileText, ShieldCheck, Sparkles } from 'lucide-react'
import './index.css'

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showRegister, setShowRegister] = useState(false)
  const { user, logout } = useAuth()

  // 未登入：顯示登入或註冊頁
  if (!user) {
    if (showRegister) {
      return <Register onBack={() => setShowRegister(false)} />
    }
    return <Login onRegister={() => setShowRegister(true)} />
  }

  const roleLabels: Record<string, string> = {
    'PLATFORM_ADMIN': '平台管理者',
    'ENTERPRISE_ADMIN': '企業功能性使用者',
    'ENTERPRISE_USER': '企業一般使用者'
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <Cloud color="var(--accent-color)" size={28} />
          <h1>CAXN Platform</h1>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <nav className="nav-tabs">
            {/* 資產大廳 — 所有人可見 */}
            <button
              className={activeTab === 'dashboard' ? 'active' : ''}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard size={18} /> 資產大廳
            </button>

            {/* 上傳資產 — 企業管理員 / 平台管理員 */}
            {(user.role === 'ENTERPRISE_ADMIN' || user.role === 'PLATFORM_ADMIN') && (
              <button
                className={activeTab === 'upload' ? 'active' : ''}
                onClick={() => setActiveTab('upload')}
              >
                <UploadCloud size={18} /> 上傳資產
              </button>
            )}

            {/* 資產管理 — 企業管理員 */}
            {user.role === 'ENTERPRISE_ADMIN' && (
              <button
                className={activeTab === 'manage' ? 'active' : ''}
                onClick={() => setActiveTab('manage')}
              >
                <PackageSearch size={18} /> 資產管理
              </button>
            )}

            {/* ★ AI 創作坊 — 企業管理員 */}
            {user.role === 'ENTERPRISE_ADMIN' && (
              <button
                className={activeTab === 'ai_creator' ? 'active' : ''}
                onClick={() => setActiveTab('ai_creator')}
                style={activeTab === 'ai_creator' ? {} : { background: 'rgba(99,102,241,0.08)' }}
              >
                <Sparkles size={18} /> AI 創作坊
              </button>
            )}

            {/* 交易明細 — 平台管理員 */}
            {user.role === 'PLATFORM_ADMIN' && (
              <button
                className={activeTab === 'transactions' ? 'active' : ''}
                onClick={() => setActiveTab('transactions')}
              >
                <FileText size={18} /> 交易明細
              </button>
            )}

            {/* ★ 審核管理 — 平台管理員 */}
            {user.role === 'PLATFORM_ADMIN' && (
              <button
                className={activeTab === 'approval' ? 'active' : ''}
                onClick={() => setActiveTab('approval')}
                style={activeTab === 'approval' ? {} : { background: 'rgba(16,185,129,0.08)' }}
              >
                <ShieldCheck size={18} /> 審核管理
              </button>
            )}

            {/* 點數錢包 — 所有人可見 */}
            <button
              className={activeTab === 'wallet' ? 'active' : ''}
              onClick={() => setActiveTab('wallet')}
            >
              <WalletIcon size={18} /> 點數錢包
            </button>
          </nav>

          <div style={{ marginLeft: '1rem', borderLeft: '1px solid var(--glass-border)', paddingLeft: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{roleLabels[user.role]}</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{user.sub}</div>
            </div>
            <button onClick={logout} className="danger" style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="登出">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main>
        {activeTab === 'dashboard'   && <Dashboard />}
        {activeTab === 'upload'      && <Upload onUploadSuccess={() => setActiveTab('manage')} />}
        {activeTab === 'manage'      && <AssetManager />}
        {activeTab === 'ai_creator'  && <AICreator />}
        {activeTab === 'transactions'&& <TransactionList />}
        {activeTab === 'approval'    && <AdminApproval />}
        {activeTab === 'wallet'      && <Wallet />}
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
