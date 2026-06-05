import { useEffect, useState } from 'react'
import { useAuth } from  '../contexts/AuthContext'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

interface ManageAsset {
  asset_id: string;
  ai_metadata: any;
  is_archived: boolean;
  asset_type: string;
  title: string | null;
  required_points: number | null;
  ai_score: number | null;
  created_at: string;
  owner_name?: string | null;
  no_ai_review?: boolean;
  is_published?: boolean;
  reason?: string | null;
  ai_analysis?: string | null;
}

export default function AssetManager() {
  const { token, user } = useAuth()
  const [assets, setAssets] = useState<ManageAsset[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedAsset, setSelectedAsset] = useState<ManageAsset | null>(null)
  const [overrideAi, setOverrideAi] = useState<Record<string, boolean>>({})

  const [editForms, setEditForms] = useState<Record<string, { title: string, points: string, type: string }>>({})

  const handleTogglePublish = async (assetId: string) => {
    try {
      const res = await fetch(`${API}/api/assets/${assetId}/toggle-publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await res.json()
      if (res.ok) {
        fetchAssets()
      } else {
        alert("操作失敗：" + (data.detail || "未知錯誤"))
      }
    } catch (e) {
      alert("網路錯誤")
    }
  }

  const fetchAssets = () => {
    setLoading(true)
    fetch(`${API}/api/manage-assets`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setAssets(data.data)
          const newForms: any = {}
          data.data.forEach((a: ManageAsset) => {
            if (!a.is_archived) {
              newForms[a.asset_id] = {
                title: a.title || `Asset_${a.asset_id.substring(0,8)}`,
                points: a.required_points?.toString() || '50',
                type: a.asset_type || 'IMAGE'
              }
            }
          })
          setEditForms(newForms)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (token) fetchAssets()
  }, [token])

  const handleArchive = async (assetId: string) => {
    const form = editForms[assetId]
    if (!form) return

    if (!confirm(`確定要歸檔此資產嗎？\n這將會從您的錢包扣除 10 點做為 AI 診斷費用。`)) return;

    try {
      const res = await fetch(`${API}/archive-asset/${assetId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          asset_type: form.type,
          title: form.title,
          required_points: Number(form.points),
          no_ai_review: !!overrideAi[assetId]
        })
      })
      const data = await res.json()
      if (res.ok) {
        alert(data.message)
        fetchAssets()
      } else {
        alert("歸檔失敗：" + (data.detail || "未知錯誤"))
      }
    } catch (e) {
      alert("網路錯誤")
    }
  }

  const updateForm = (id: string, field: string, value: string) => {
    setEditForms(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }))
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>
        {user?.role === 'PLATFORM_ADMIN' ? '全平台數位資產查詢清單' : '企業資產管理'}
      </h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        {user?.role === 'PLATFORM_ADMIN' 
          ? '檢視與查詢全體企業或個人上傳的數位資產。' 
          : '設定您的數位資產分類與定價，並完成歸檔 (將扣除 10 點 AI 處理費) 後，資產即可上架至大廳。'}
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>載入中...</div>
      ) : (
        <div className="glass-panel" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '1rem' }}>ID</th>
                {user?.role === 'PLATFORM_ADMIN' && <th style={{ padding: '1rem' }}>上傳來源</th>}
                <th style={{ padding: '1rem' }}>AI 評分</th>
                <th style={{ padding: '1rem' }}>建立時間</th>
                <th style={{ padding: '1rem' }}>狀態與操作</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => (
                <tr key={asset.asset_id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{asset.asset_id.substring(0,8)}</td>
                  {user?.role === 'PLATFORM_ADMIN' && (
                    <td style={{ padding: '1rem', fontWeight: '500' }}>{asset.owner_name || '個人上傳'}</td>
                  )}
                  <td style={{ padding: '1rem' }}>
                    <div>
                      {asset.no_ai_review ? (
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>無AI審閱</span>
                      ) : asset.ai_score !== null ? (
                        <span style={{ 
                          color: asset.ai_score >= 80 ? 'var(--success)' : asset.ai_score >= 50 ? 'var(--warning)' : 'var(--danger)',
                          fontWeight: 'bold' 
                        }}>
                          {asset.ai_score}
                        </span>
                      ) : 'N/A'}
                    </div>
                    {(asset.reason || asset.ai_analysis) && (
                      <button 
                        style={{ 
                          background: 'none', border: 'none', color: 'var(--accent-color, #6366f1)', 
                          padding: 0, textDecoration: 'underline', fontSize: '0.75rem', cursor: 'pointer',
                          marginTop: '0.25rem', display: 'block'
                        }}
                        onClick={() => setSelectedAsset(asset)}
                      >
                        查看評核回饋
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {new Date(asset.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {asset.is_archived ? (
                      <div>
                        {asset.is_published !== false ? (
                          <div>
                            <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>✅ 已歸檔上架</span>
                            {asset.no_ai_review && <span style={{ fontSize: '0.75rem', color: 'var(--warning)', marginLeft: '0.5rem' }}>(無AI審閱)</span>}
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                              名稱: {asset.title} | 售價: {asset.required_points} 點 | 分類: {asset.asset_type}
                            </div>
                            {user?.role !== 'PLATFORM_ADMIN' && (
                              <button 
                                className="danger" 
                                onClick={() => handleTogglePublish(asset.asset_id)}
                                style={{ marginTop: '0.5rem', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              >
                                🔴 下架 (暫停銷售)
                              </button>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>❌ 已下架暫停銷售</span>
                            {asset.no_ai_review && <span style={{ fontSize: '0.75rem', color: 'var(--warning)', marginLeft: '0.5rem' }}>(無AI審閱)</span>}
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                              名稱: {asset.title} | 售價: {asset.required_points} 點 | 分類: {asset.asset_type}
                            </div>
                            {user?.role !== 'PLATFORM_ADMIN' && (
                              <button 
                                className="primary" 
                                onClick={() => handleTogglePublish(asset.asset_id)}
                                style={{ marginTop: '0.5rem', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              >
                                🟢 重新上架 (免費)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : user?.role === 'PLATFORM_ADMIN' ? (
                      <div>
                        <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>⏳ 未歸檔/待歸檔</span>
                      </div>
                    ) : (
                      editForms[asset.asset_id] && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>名稱:</span>
                            <input 
                              type="text" 
                              placeholder="資產名稱"
                              value={editForms[asset.asset_id].title}
                              onChange={e => updateForm(asset.asset_id, 'title', e.target.value)}
                              style={{ width: '150px' }}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>售價(點數):</span>
                            <input 
                              type="number" 
                              placeholder="售價"
                              value={editForms[asset.asset_id].points}
                              onChange={e => updateForm(asset.asset_id, 'points', e.target.value)}
                              style={{ width: '80px' }}
                            />
                            <select 
                              value={editForms[asset.asset_id].type}
                              onChange={e => updateForm(asset.asset_id, 'type', e.target.value)}
                            >
                              <option value="IMAGE">素材圖片</option>
                              <option value="COURSE">線上課程</option>
                              <option value="GOODS">實體福利品</option>
                              <option value="VIDEO">企業形象影片</option>
                              <option value="ECARD">電子賀卡</option>
                            </select>
                            <button className="primary" onClick={() => handleArchive(asset.asset_id)}>
                              歸檔上架 (扣 10 點)
                            </button>
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer', marginTop: '0.25rem' }}>
                            <input 
                              type="checkbox" 
                              checked={!!overrideAi[asset.asset_id]} 
                              onChange={e => setOverrideAi(prev => ({ ...prev, [asset.asset_id]: e.target.checked }))} 
                            />
                            不同意 AI 評核，強制上架（將註記無 AI 審閱，仍需扣除 10 點）
                          </label>
                        </div>
                      )
                    )}
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr>
                  <td colSpan={user?.role === 'PLATFORM_ADMIN' ? 5 : 4} style={{ textAlign: 'center', padding: '2rem' }}>尚無任何資產資料</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Feedback Details Modal */}
      {selectedAsset && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setSelectedAsset(null)}>
          <div style={{
            background: '#0f172a', border: '1px solid var(--glass-border)',
            borderRadius: '16px', padding: '2rem', maxWidth: '500px', width: '90%',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', gap: '1rem'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--accent-color)' }}>AI 評估回饋報告</h3>
            <div style={{ color: 'var(--text-primary)' }}>
              <strong>資產標題:</strong> {selectedAsset.title || '未命名'}
            </div>
            <div style={{ color: 'var(--text-primary)' }}>
              <strong>AI 評分:</strong> {selectedAsset.no_ai_review ? '無AI審閱' : (selectedAsset.ai_score !== null ? `${selectedAsset.ai_score} 分` : '審閱中')}
            </div>
            <div style={{ color: 'var(--text-primary)' }}>
              <strong>AI 審核建議/原因:</strong>
              <p style={{ 
                background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px', 
                marginTop: '0.25rem', fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-primary)'
              }}>
                {selectedAsset.reason || '無審核原因'}
              </p>
            </div>
            {selectedAsset.ai_analysis && (
              <div style={{ color: 'var(--text-primary)' }}>
                <strong>AI 摘要分析:</strong>
                <p style={{ 
                  background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px', 
                  marginTop: '0.25rem', fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-primary)'
                }}>
                  {selectedAsset.ai_analysis}
                </p>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="primary" onClick={() => setSelectedAsset(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
