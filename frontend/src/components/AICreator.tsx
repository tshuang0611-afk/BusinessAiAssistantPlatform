import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sparkles, Video, Image as ImageIcon, Send, Copy, Check, RefreshCw } from  'lucide-react'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';;

interface Asset {
  asset_id: string;
  title: string;
  asset_type: string;
}

interface VideoScene {
  scene_number: number;
  duration: number;
  visual_description_en: string;
  narration_zh: string;
  camera_angle: string;
}

interface VideoResult {
  title?: string;
  duration_seconds?: number;
  style?: string;
  scenes?: VideoScene[];
  veo_main_prompt?: string;
  tagline?: string;
}

interface EcardResult {
  title?: string;
  occasion?: string;
  main_copy_zh?: string;
  signature?: string;
  image_prompt_en?: string;
  color_palette?: string;
  font_suggestion?: string;
}

type CreativeResult = VideoResult | EcardResult | Record<string, unknown>;

export default function AICreator() {
  const { token } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState('');
  const [prompt, setPrompt] = useState('');
  const [outputType, setOutputType] = useState<'VIDEO' | 'ECARD'>('VIDEO');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ output_type: string; result: CreativeResult; fee_charged: number } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/assets`)
      .then(r => r.json())
      .then(d => {
        if (d.status === 'success') {
          setAssets(d.data.filter((a: Asset) => a.asset_type === 'IMAGE'));
        }
      })
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) { setError('請輸入需求描述'); return; }
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(`${API}/api/ai/generate-creative`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          asset_id: selectedAsset,
          prompt,
          output_type: outputType,
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setResult(data);
      } else {
        setError(data.detail || 'AI 生成失敗，請重試');
      }
    } catch {
      setError('網路錯誤，請確認後端已啟動');
    }
    setLoading(false);
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const CopyButton = ({ text, copyKey }: { text: string; copyKey: string }) => (
    <button
      onClick={() => copyText(text, copyKey)}
      title="複製到剪貼簿"
      style={{
        background: 'rgba(255,255,255,0.08)', border: '1px solid var(--glass-border)',
        borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer',
        color: copied === copyKey ? '#10b981' : 'var(--text-secondary)',
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem',
        transition: 'all 0.2s',
      }}
    >
      {copied === copyKey ? <><Check size={12} /> 已複製</> : <><Copy size={12} /> 複製</>}
    </button>
  );

  const renderVideoResult = (r: VideoResult) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--accent-color)', fontSize: '1.15rem' }}>🎬 {r.title}</h3>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            建議時長：{r.duration_seconds} 秒 ｜ 品牌標語：{r.tagline}
          </p>
        </div>
      </div>

      {/* Veo 主 Prompt */}
      {r.veo_main_prompt && (
        <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ fontWeight: 600, color: '#818cf8', fontSize: '0.9rem' }}>🚀 Veo 主 Prompt（直接貼入使用）</span>
            <CopyButton text={r.veo_main_prompt} copyKey="veo_main" />
          </div>
          <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.6, fontSize: '0.9rem', fontFamily: 'monospace' }}>
            {r.veo_main_prompt}
          </p>
        </div>
      )}

      {/* 風格 */}
      {r.style && (
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>畫面風格</div>
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '0.75rem', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            {r.style}
          </div>
        </div>
      )}

      {/* 場景 */}
      {r.scenes && r.scenes.length > 0 && (
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontWeight: 600 }}>📽️ 分鏡腳本</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {r.scenes.map((scene: VideoScene) => (
              <div key={scene.scene_number} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                borderRadius: '8px', padding: '0.9rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-color)', fontSize: '0.9rem' }}>
                    Scene {scene.scene_number}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', padding: '0.15rem 0.5rem' }}>
                    {scene.duration}s ｜ {scene.camera_angle}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>📢 旁白：</strong>{scene.narration_zh}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  <strong>Visual：</strong>{scene.visual_description_en}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderEcardResult = (r: EcardResult) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: 0, color: 'var(--accent-color)', fontSize: '1.15rem' }}>🎴 {r.title}</h3>
        <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>場合：{r.occasion}</p>
      </div>

      {/* 主文案 */}
      {r.main_copy_zh && (
        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ fontWeight: 600, color: '#34d399', fontSize: '0.9rem' }}>✍️ 主文案</span>
            <CopyButton text={r.main_copy_zh} copyKey="main_copy" />
          </div>
          <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.8, fontSize: '1rem' }}>{r.main_copy_zh}</p>
          {r.signature && <p style={{ margin: '0.75rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'right' }}>— {r.signature}</p>}
        </div>
      )}

      {/* Imagen Prompt */}
      {r.image_prompt_en && (
        <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ fontWeight: 600, color: '#818cf8', fontSize: '0.9rem' }}>🖼️ 背景圖 Prompt（貼入 Imagen/Nano）</span>
            <CopyButton text={r.image_prompt_en} copyKey="img_prompt" />
          </div>
          <p style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.875rem', lineHeight: 1.6 }}>{r.image_prompt_en}</p>
        </div>
      )}

      {/* 色系與字型 */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {r.color_palette && (
          <div style={{ flex: 1, minWidth: '200px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>🎨 建議色系</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>{r.color_palette}</div>
          </div>
        )}
        {r.font_suggestion && (
          <div style={{ flex: 1, minWidth: '200px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>🔤 字型建議</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{r.font_suggestion}</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* 標頭 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Sparkles size={24} color="var(--accent-color)" /> AI 創作坊
        </h2>
        <p style={{ margin: '0.4rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          輸入需求，讓 Gemini AI 為您產出專業的影片分鏡腳本或電子賀卡方案。每次消耗 20 點。
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* 左欄：輸入區 */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem' }}>⚙️ 創作設定</div>

          {/* 輸出類型 */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}>產出格式</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {(['VIDEO', 'ECARD'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setOutputType(type)}
                  style={{
                    flex: 1, padding: '0.65rem', borderRadius: '10px', cursor: 'pointer',
                    border: outputType === type ? '2px solid var(--accent-color)' : '2px solid transparent',
                    background: outputType === type ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                    color: outputType === type ? 'var(--accent-color)' : 'var(--text-secondary)',
                    fontWeight: outputType === type ? 700 : 400,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    transition: 'all 0.2s',
                  }}
                >
                  {type === 'VIDEO' ? <Video size={16} /> : <ImageIcon size={16} />}
                  {type === 'VIDEO' ? '形象影片腳本' : '電子賀卡方案'}
                </button>
              ))}
            </div>
          </div>

          {/* 素材選擇 */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              參考素材圖片 <span style={{ fontWeight: 400, opacity: 0.7 }}>（選填）</span>
            </label>
            <select
              value={selectedAsset}
              onChange={e => setSelectedAsset(e.target.value)}
              style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem' }}
            >
              <option value="">不選擇素材（純文字生成）</option>
              {assets.map(a => (
                <option key={a.asset_id} value={a.asset_id}>{a.title}</option>
              ))}
            </select>
          </div>

          {/* 需求描述 */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 600 }}>需求描述</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={5}
              placeholder={outputType === 'VIDEO'
                ? '例：幫我製作一支適合春節氛圍的品牌形象宣傳影片腳本，風格要現代科技感，主打我們的 AI 資源共享服務...'
                : '例：製作一張中秋節的電子賀卡，傳遞感謝合作夥伴一年來支持的心意，要溫暖、有質感...'}
              style={{ width: '100%', resize: 'vertical', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.75rem', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.6, boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <button
            className="primary"
            onClick={handleGenerate}
            disabled={loading}
            style={{ padding: '0.85rem', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}
          >
            {loading
              ? <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Gemini 生成中...</>
              : <><Send size={18} /> 開始 AI 生成（扣 20 點）</>
            }
          </button>
        </div>

        {/* 右欄：結果區 */}
        <div className="glass-panel" style={{ padding: '1.5rem', minHeight: '400px' }}>
          {!result && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', opacity: 0.5, paddingTop: '4rem' }}>
              <Sparkles size={48} color="var(--accent-color)" />
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.95rem' }}>
                填寫左側設定並<br />點擊「開始 AI 生成」
              </div>
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', paddingTop: '4rem' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                border: '3px solid rgba(99,102,241,0.2)',
                borderTopColor: 'var(--accent-color)',
                animation: 'spin 1s linear infinite',
              }} />
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', textAlign: 'center' }}>
                Gemini 正在思考中<br /><span style={{ fontSize: '0.8rem', opacity: 0.7 }}>通常需要 10-20 秒...</span>
              </div>
            </div>
          )}

          {result && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>✨ 生成結果</span>
                <span style={{ fontSize: '0.8rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: '6px', padding: '0.2rem 0.6rem' }}>
                  已扣除 {result.fee_charged} 點
                </span>
              </div>
              {result.output_type === 'VIDEO'
                ? renderVideoResult(result.result as VideoResult)
                : renderEcardResult(result.result as EcardResult)
              }
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
