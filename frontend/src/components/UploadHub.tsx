import { Image as ImageIcon, Sparkles, Gift } from 'lucide-react'

type Track = 'material' | 'creative' | 'benefit'

interface UploadHubProps {
  onSelect: (track: Track) => void
}

export default function UploadHub({ onSelect }: UploadHubProps) {
  const tracks = [
    {
      id: 'material' as Track,
      icon: <ImageIcon size={36} color="#818cf8" />,
      title: '素材上架',
      subtitle: '圖片・文件・原始素材',
      desc: '上傳圖片或文件，由 Gemini AI 自動審核品質、評分與分類。通過審核後可歸檔定價上架。',
      color: 'rgba(99,102,241,0.15)',
      border: 'rgba(99,102,241,0.35)',
    },
    {
      id: 'creative' as Track,
      icon: <Sparkles size={36} color="#f59e0b" />,
      title: 'AI 創意內容上架',
      subtitle: '形象影片・電子賀卡・線上課程',
      desc: '上傳透過外部 AI 工具（Veo / Imagen）製作的最終成品，搭配 AI 生成文案，一鍵直接發布。',
      color: 'rgba(245,158,11,0.12)',
      border: 'rgba(245,158,11,0.35)',
    },
    {
      id: 'benefit' as Track,
      icon: <Gift size={36} color="#10b981" />,
      title: '企業福利品上架',
      subtitle: '實體商品・兌換券・服務',
      desc: '填寫商品資訊與定價，上傳封面圖，員工可用個人福利點數直接兌換，系統自動生成兌換碼。',
      color: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.3)',
    },
  ]

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>選擇上架類型</h2>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)' }}>
          CAXN 平台提供三種獨立上架流程，請選擇符合您需求的類型。
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {tracks.map(t => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              background: t.color, border: `1.5px solid ${t.border}`,
              borderRadius: '14px', padding: '1.5rem 2rem',
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: '1.5rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateX(4px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'translateX(0)')}
          >
            <div style={{ flexShrink: 0, width: '56px', height: '56px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {t.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.3rem' }}>
                <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>{t.title}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.07)', borderRadius: '20px', padding: '0.15rem 0.6rem' }}>{t.subtitle}</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{t.desc}</p>
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', flexShrink: 0 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
