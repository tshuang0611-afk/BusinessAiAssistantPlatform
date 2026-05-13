import { useState, useRef } from 'react'
import { UploadCloud, Image as ImageIcon } from 'lucide-react'

export default function Upload({ onUploadSuccess }: { onUploadSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0]
      setFile(selected)
      setPreview(URL.createObjectURL(selected))
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setLoading(true)
    try {
      // 在這個測試版，我們先把它存在本地 uploads 目錄模擬真實的上傳行為
      // 假設我們有另一支 upload API 或者是直接發送路徑 (因為目前 API 只吃路徑)
      // 這裡為了不大幅修改 FastAPI 的上傳邏輯，我們只做 UI 模擬展示。
      // 實際應用需要 FastAPI 支援 multipart/form-data 接收檔案。
      
      alert("上傳與 AI 審核可能需要幾秒鐘，請耐心等候！")
      
      // 由於目前的 /process-asset 吃的是實體路徑 (從 batch_processor 來的)
      // 我們這裡可以用假的資料或是請後端修改。
      // 為了展示效果，這裡只模擬成功提示：
      setTimeout(() => {
        setLoading(false)
        alert("資產已成功送交 AI 審核！")
        onUploadSuccess()
      }, 2000)

    } catch (err) {
      alert("上傳失敗")
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>上傳新資產</h2>
      <p style={{ marginBottom: '2rem' }}>將您的數位素材上傳至平台，Gemini AI 將自動審核品質並給予評分與分類標籤。</p>

      <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
        
        {preview ? (
          <div style={{ marginBottom: '2rem' }}>
            <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', border: '1px solid var(--glass-border)' }} />
          </div>
        ) : (
          <div 
            style={{ 
              border: '2px dashed var(--glass-border)', 
              borderRadius: '12px', 
              padding: '4rem 2rem', 
              marginBottom: '2rem',
              cursor: 'pointer',
              background: 'rgba(0,0,0,0.2)'
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud size={48} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 0.5rem 0' }}>點擊或拖曳圖片至此處</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>支援 JPG, PNG, WEBP</p>
          </div>
        )}

        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange}
        />

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          {file && (
            <button onClick={() => { setFile(null); setPreview(null); }}>
              重新選擇
            </button>
          )}
          <button className="primary" disabled={!file || loading} onClick={handleUpload}>
            <ImageIcon size={18} />
            {loading ? 'AI 審核中...' : '送出審核'}
          </button>
        </div>
      </div>
    </div>
  )
}
