import { useEffect, useState } from 'react'
import { Tag, Image as ImageIcon, Video, ShoppingCart, BookOpen, Mail, Download, Play, Truck, Link as LinkIcon, Search, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface Asset {
  asset_id: string;
  ai_score: number;
  ai_tags: string[] | null;
  ai_analysis: string;
  is_archived: boolean;
  asset_type: string;
  title: string;
  content_url: string;
  required_points: number; // 假設後端有回傳這欄位
}

// Icons mapping based on type
const getTypeIcon = (type: string) => {
  switch(type) {
    case 'COURSE': return <BookOpen size={16} />
    case 'GOODS': return <ShoppingCart size={16} />
    case 'VIDEO': return <Video size={16} />
    case 'ECARD': return <Mail size={16} />
    default: return <ImageIcon size={16} />
  }
}

// 處理圖片載入錯誤與預設呈現的子元件
const PreviewImage = ({ url, title }: { url: string | null | undefined, title: string }) => {
  const [error, setError] = useState(false)
  
  if (!url || error || url.trim() === '') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#475569', flexDirection: 'column', gap: '0.5rem' }}>
        <ImageIcon size={40} opacity={0.5} />
        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>無圖片預覽</span>
      </div>
    )
  }

  const filename = url.split('/').pop();
  const src = `http://localhost:8000/static/done/${filename}`;

  return (
    <img 
      src={src} 
      alt={title} 
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      onError={() => setError(true)}
    />
  )
}


export default function Dashboard() {
  const { user, token } = useAuth()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [purchasedIds, setPurchasedIds] = useState<string[]>([])
  const [purchasingId, setPurchasingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  
  // Modals state
  const [showShippingModal, setShowShippingModal] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [activeAsset, setActiveAsset] = useState<Asset | null>(null)
  
  // Logistics form state
  const [logisticsForm, setLogisticsForm] = useState({ name: '', address: '', phone: '' })

  useEffect(() => {
    const url = search || filterType
      ? `http://localhost:8000/api/assets/search?keyword=${encodeURIComponent(search)}&asset_type=${filterType}`
      : 'http://localhost:8000/api/assets'
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          const mapped = data.data.map((a: any) => ({...a, required_points: a.required_points || 50}))
          setAssets(mapped)
        }
        setLoading(false)
      })
      .catch(err => { console.error(err); setLoading(false) })
      
    const saved = localStorage.getItem('caxn_purchased')
    if (saved) setPurchasedIds(JSON.parse(saved))
  }, [search, filterType])

  const handlePurchase = async (asset: Asset) => {
    if (!confirm(`確定要花費 ${asset.required_points} 點購買「${asset.title}」的授權嗎？`)) return;
    
    setPurchasingId(asset.asset_id)
    try {
      // 呼叫原本寫好的 purchase-asset API，加上 Token 認證
      const res = await fetch(`http://localhost:8000/purchase-asset/${asset.asset_id}`, { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await res.json()
      
      if (res.ok) {
        alert("✅ 購買授權成功！點數已扣除。")
        const newPurchased = [...purchasedIds, asset.asset_id]
        setPurchasedIds(newPurchased)
        localStorage.setItem('caxn_purchased', JSON.stringify(newPurchased))
      } else {
        alert(`❌ 購買失敗：${result.detail || '未知錯誤'}`)
      }
    } catch (e) {
      alert("❌ 網路連線錯誤，無法完成購買")
    }
    setPurchasingId(null)
  }

  const handleDownload = async (asset_id: string, filename: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/assets/${asset_id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`❌ 下載失敗: ${err.detail || '未知錯誤'}`);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      alert("❌ 網路錯誤，下載失敗");
    }
  }

  const handleAction = (asset: Asset) => {
    switch(asset.asset_type) {
      case 'COURSE':
      case 'VIDEO':
        setActiveAsset(asset)
        setShowVideoModal(true)
        break;
      case 'GOODS':
        setActiveAsset(asset)
        setShowShippingModal(true)
        break;
      case 'ECARD':
        navigator.clipboard.writeText(`https://caxn-platform.com/ecard/${asset.asset_id}`)
        alert("🔗 專屬賀卡連結已複製到剪貼簿！可以傳送給您的親友囉。")
        break;
      case 'IMAGE':
      default:
        handleDownload(asset.asset_id, asset.content_url.split('/').pop() || 'downloaded_file');
        break;
    }
  }

  const submitLogistics = async (method: string) => {
    if (!activeAsset) return;
    if (method === 'HOME_DELIVERY' && (!logisticsForm.name || !logisticsForm.address || !logisticsForm.phone)) {
      alert('請填寫完整收件資料');
      return;
    }
    try {
      const res = await fetch('http://localhost:8000/api/logistics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          asset_id: activeAsset.asset_id,
          delivery_method: method,
          recipient_name: method === 'COUPON' ? '兌換券' : logisticsForm.name,
          phone: method === 'COUPON' ? '無' : logisticsForm.phone,
          address: method === 'COUPON' ? '無' : logisticsForm.address
        })
      });
      if (res.ok) {
        alert(method === 'COUPON' ? '🎟️ 兌換券申請成功！請至會員中心查看' : '✅ 物流資料已送出！');
        setShowShippingModal(false);
      } else {
        const err = await res.json();
        alert(`❌ 失敗: ${err.detail}`);
      }
    } catch (e) {
      alert("網路錯誤");
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem' }}>載入中...</div>

  const FILTER_TABS = [
    { value: '', label: '全部' },
    { value: 'IMAGE', label: '🖼️ 圖片素材' },
    { value: 'VIDEO_AD', label: '🎬 形象影片' },
    { value: 'ECARD', label: '🎴 電子賀卡' },
    { value: 'COURSE', label: '📚 線上課程' },
    { value: 'GOODS', label: '🎁 福利品' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>資產大廳</h2>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)' }}>瀏覽由平台會員貢獻並經過 Gemini AI 評分驗證的數位資產。</p>
        </div>
        <div style={{ position: 'relative', minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋資產名稱或描述..." style={{ paddingLeft: '36px', width: '100%', boxSizing: 'border-box' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={14} /></button>}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {FILTER_TABS.map(t => (
          <button key={t.value} onClick={() => setFilterType(t.value)}
            style={{ padding: '0.4rem 1rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.875rem', border: filterType === t.value ? '1.5px solid var(--accent-color)' : '1.5px solid transparent', background: filterType === t.value ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', color: filterType === t.value ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid-3">
        {assets.map((asset, i) => {
          let scoreClass = 'score-low'
          if (asset.ai_score > 70) scoreClass = 'score-high'
          else if (asset.ai_score >= 40) scoreClass = 'score-mid'

          const isPurchased = purchasedIds.includes(asset.asset_id)

          return (
            <div key={i} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: 0, overflow: 'hidden' }}>
              
              {/* Image Preview Container */}
              <div style={{ height: '200px', width: '100%', background: '#1e293b', position: 'relative' }}>
                <PreviewImage url={asset.content_url} title={asset.title} />
                <div style={{ position: 'absolute', top: '10px', right: '10px' }} className={`score-badge ${scoreClass}`} title="AI 評分">
                  {asset.ai_score || 0}
                </div>
              </div>

              {/* Content Container */}
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', wordBreak: 'break-word' }}>
                    {asset.title || `Asset_${asset.asset_id.slice(0, 8)}`}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                  {getTypeIcon(asset.asset_type)}
                  <span>{asset.asset_type || '未分類'}</span>
                </div>

                <p style={{ flex: 1, fontSize: '0.9rem', margin: 0 }}>
                  {asset.ai_analysis || '尚無摘要內容'}
                </p>

                <div>
                  {(asset.ai_tags || []).slice(0, 4).map((tag, idx) => (
                    <span key={idx} className="tag">
                      <Tag size={10} style={{ marginRight: '2px', display: 'inline-block', verticalAlign: 'middle' }} />
                      {tag}
                    </span>
                  ))}
                </div>

                <div style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  
                  {!asset.is_archived ? (
                    <span style={{ color: 'var(--warning)', fontSize: '0.9rem' }}>⏳ 審核中</span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      💰 {asset.required_points} pts
                    </span>
                  )}

                  {!asset.is_archived ? (
                    <button className="primary" disabled style={{ padding: '0.25rem 0.75rem', fontSize: '0.9rem' }}>
                      購買授權
                    </button>
                  ) : isPurchased ? (
                    <button 
                      className="success" 
                      onClick={() => handleAction(asset)}
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.9rem' }}
                    >
                      {asset.asset_type === 'IMAGE' && <><Download size={14} /> 下載原圖</>}
                      {asset.asset_type === 'GOODS' && <><Truck size={14} /> 填寫物流</>}
                      {asset.asset_type === 'COURSE' && <><Play size={14} /> 播放課程</>}
                      {asset.asset_type === 'VIDEO' && <><Download size={14} /> 下載影片</>}
                      {asset.asset_type === 'ECARD' && <><LinkIcon size={14} /> 專屬連結</>}
                    </button>
                  ) : user?.role !== 'ENTERPRISE_USER' ? (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {user?.role === 'PLATFORM_ADMIN' ? '平台方不可消費' : '企業管理員不可消費'}
                    </span>
                  ) : (
                    <button 
                      className="primary" 
                      onClick={() => handlePurchase(asset)}
                      disabled={purchasingId === asset.asset_id}
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.9rem' }}
                    >
                      {purchasingId === asset.asset_id ? '處理中...' : '購買授權'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {assets.length === 0 && <p>目前沒有任何資產。</p>}

      {/* --- Modals --- */}
      {showShippingModal && (
        <div style={modalOverlayStyle}>
          <div className="glass-panel" style={modalContentStyle}>
            <h3>🚚 福利品兌換 - 填寫物流資料</h3>
            <p>您已成功扣點購買「{activeAsset?.title}」，請填寫配送地址或下載兌換券。</p>
            <input type="text" placeholder="收件人姓名" value={logisticsForm.name} onChange={e => setLogisticsForm({...logisticsForm, name: e.target.value})} style={{ marginBottom: '1rem' }}/>
            <input type="text" placeholder="收件地址" value={logisticsForm.address} onChange={e => setLogisticsForm({...logisticsForm, address: e.target.value})} style={{ marginBottom: '1rem' }}/>
            <input type="text" placeholder="聯絡電話" value={logisticsForm.phone} onChange={e => setLogisticsForm({...logisticsForm, phone: e.target.value})} style={{ marginBottom: '1.5rem' }}/>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="success" onClick={() => submitLogistics('HOME_DELIVERY')} style={{ flex: 1, justifyContent: 'center' }}>送出資料</button>
              <button onClick={() => submitLogistics('COUPON')} style={{ flex: 1, justifyContent: 'center' }}>下載實體兌換券</button>
              <button className="danger" onClick={() => setShowShippingModal(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {showVideoModal && activeAsset && (
        <div style={modalOverlayStyle}>
          <div className="glass-panel" style={{...modalContentStyle, maxWidth: '800px', width: '90%'}}>
            <h3>▶️ {activeAsset.asset_type === 'COURSE' ? '課程串流播放' : '影片播放'} — {activeAsset.title}</h3>
            <video
              controls
              autoPlay
              style={{ width: '100%', borderRadius: '8px', background: '#000', maxHeight: '420px' }}
              src={`http://localhost:8000/api/assets/${activeAsset.asset_id}/stream?token=${token}`}
            >
              您的瀏覽器不支援影片播放。
            </video>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="danger" onClick={() => setShowVideoModal(false)}>關閉視窗</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
}

const modalContentStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  padding: '2rem',
  background: 'var(--bg-dark)'
}
