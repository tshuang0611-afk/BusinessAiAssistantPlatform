import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6']

interface Stats {
  total_distributed: number
  redemptions: number
  assets_count: number
  wallet_balance: number
  asset_distribution: { asset_type: string; cnt: number }[]
  member_count: number
}

interface PlatformStats {
  enterprise_count: number
  asset_count: number
  total_transaction: number
  enterprise_ranking: { company_name: string; distributed: number }[]
  pending_users: number
}

export default function Analytics() {
  const { user, token } = useAuth()
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN'
  const [stats, setStats] = useState<Stats | null>(null)
  const [timeline, setTimeline] = useState<{ date: string; out_amount: number }[]>([])
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` }
    const fetches = [
      fetch('http://localhost:8000/api/enterprise/stats', { headers }).then(r => r.json()),
      fetch('http://localhost:8000/api/enterprise/points-timeline', { headers }).then(r => r.json()),
    ]
    if (isPlatformAdmin) fetches.push(fetch('http://localhost:8000/api/platform/stats', { headers }).then(r => r.json()))
    Promise.all(fetches).then(([s, t, p]) => {
      if (s.status === 'success') setStats(s.data)
      if (t.status === 'success') setTimeline(t.data.map((d: any) => ({ ...d, date: d.date?.slice(5) || '' })))
      if (p?.status === 'success') setPlatformStats(p.data)
      setLoading(false)
    })
  }, [token])

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>載入報表中...</div>

  const kpis = stats ? [
    { label: '錢包餘額', value: `${stats.wallet_balance.toLocaleString()} pts`, color: '#6366f1' },
    { label: '已分配點數', value: `${stats.total_distributed.toLocaleString()} pts`, color: '#10b981' },
    { label: '福利品兌換次數', value: stats.redemptions, color: '#f59e0b' },
    { label: '上架資產數', value: stats.assets_count, color: '#3b82f6' },
    { label: '企業成員數', value: stats.member_count, color: '#8b5cf6' },
  ] : []

  const pieData = (stats?.asset_distribution || []).map(d => ({ name: d.asset_type, value: Number(d.cnt) }))

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>📊 數據報表</h2>
        <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)' }}>企業點數分配、資產上架與兌換情況一覽</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {kpis.map(k => (
          <div key={k.label} className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center' }}>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{k.label}</p>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Charts Row 1: Timeline + Pie */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Line Chart - Points Timeline */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>📈 近 30 天點數分配趨勢</h3>
          {timeline.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>尚無分配記錄</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }} />
                <Line type="monotone" dataKey="out_amount" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} name="分配點數" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie Chart - Asset Distribution */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>🍩 資產類型分佈</h3>
          {pieData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>尚無資產</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Platform Admin Only: Enterprise Ranking */}
      {isPlatformAdmin && platformStats && (
        <>
          {/* Platform KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
            {[
              { label: '平台企業數', value: platformStats.enterprise_count, color: '#6366f1' },
              { label: '平台資產總數', value: platformStats.asset_count, color: '#10b981' },
              { label: '平台總交易額', value: `${platformStats.total_transaction.toLocaleString()} pts`, color: '#f59e0b' },
            ].map(k => (
              <div key={k.label} className="glass-panel" style={{ padding: '1rem', textAlign: 'center' }}>
                <p style={{ margin: '0 0 0.3rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{k.label}</p>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Bar Chart - Enterprise Ranking */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>📊 企業點數分配排行（Top 10）</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={platformStats.enterprise_ranking.map(e => ({ name: e.company_name.slice(0, 8), value: Number(e.distributed) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }} />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} name="分配點數" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
