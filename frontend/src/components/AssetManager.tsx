import { useEffect, useState } from 'react'
import { useAuth } from 

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
'../contexts/AuthContext'

interface ManageAsset {
  asset_id: string;
  ai_metadata: any;
  is_archived: boolean;
  asset_type: string;
  title: string | null;
  required_points: number | null;
  ai_score: number | null;
  created_at: string;
}

export default function AssetManager() {
  const { token } = useAuth()
  const [assets, setAssets] = useState<ManageAsset[]>([])
  const [loading, setLoading] = useState(true)

  const [editForms, setEditForms] = useState<Record<string, { title: string, points: string, type: string }>>({})

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
          required_points: Number(form.points)
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
      <h2 style={{ marginBottom: '0.5rem' }}>企業資產管理</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>設定您的數位資產分類與定價，並完成歸檔 (將扣除 10 點 AI 處理費) 後，資產即可上架至大廳。</p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>載入中...</div>
      ) : (
        <div className="glass-panel" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '1rem' }}>ID</th>
                <th style={{ padding: '1rem' }}>AI 評分</th>
                <th style={{ padding: '1rem' }}>建立時間</th>
                <th style={{ padding: '1rem' }}>狀態與操作</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => (
                <tr key={asset.asset_id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{asset.asset_id.substring(0,8)}</td>
                  <td style={{ padding: '1rem' }}>
                    {asset.ai_score !== null ? (
                      <span style={{ 
                        color: asset.ai_score >= 80 ? 'var(--success)' : asset.ai_score >= 50 ? 'var(--warning)' : 'var(--danger)',
                        fontWeight: 'bold' 
                      }}>
                        {asset.ai_score}
                      </span>
                    ) : 'N/A'}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {new Date(asset.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {asset.is_archived ? (
                      <div>
                        <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>✅ 已歸檔上架</span>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          名稱: {asset.title} | 售價: {asset.required_points} 點 | 分類: {asset.asset_type}
                        </div>
                      </div>
                    ) : (
                      editForms[asset.asset_id] && (
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
                      )
                    )}
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>尚無任何資產資料</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
