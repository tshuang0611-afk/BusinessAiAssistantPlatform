import { useEffect, useRef, useState } from 'react'
import { Bell, Check, CheckCheck, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface Notification {
  notification_id: string
  type: string
  title: string
  content: string
  related_id: string
  is_read: boolean
  created_at: string
}

const TYPE_ICON: Record<string, string> = {
  POINT_RECEIVED: '💰',
  ASSET_REVIEWED: '🎨',
  ORDER_RECEIVED: '📦',
  ORDER_SHIPPED: '📬',
  TOPUP_SUCCESS: '✅',
  DEFAULT: '🔔',
}

export default function NotificationBell() {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const esRef = useRef<EventSource | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // SSE 連線
  useEffect(() => {
    if (!token) return
    fetchNotifications()

    // 建立 SSE
    const es = new EventSource(`http://localhost:8000/api/notifications/stream?token=${token}`)
    esRef.current = es
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'connected') return
        setNotifications(prev => [{ ...data, is_read: false } as Notification, ...prev])
        setUnread(c => c + 1)
      } catch {}
    }
    es.onerror = () => { es.close() }
    return () => { es.close() }
  }, [token])

  // 點擊外部關閉
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchNotifications = async () => {
    const res = await fetch('http://localhost:8000/api/notifications', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (data.status === 'success') {
      setNotifications(data.data)
      setUnread(data.data.filter((n: Notification) => !n.is_read).length)
    }
  }

  const markRead = async (id: string) => {
    await fetch(`http://localhost:8000/api/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
    setNotifications(prev => prev.map(n => n.notification_id === id ? { ...n, is_read: true } : n))
    setUnread(c => Math.max(0, c - 1))
  }

  const markAllRead = async () => {
    await fetch('http://localhost:8000/api/notifications/read-all', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
  }

  const timeAgo = (ts: string) => {
    const diff = (Date.now() - new Date(ts).getTime()) / 1000
    if (diff < 60) return '剛剛'
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`
    return `${Math.floor(diff / 86400)} 天前`
  }

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => { setOpen(v => !v); if (!open) fetchNotifications() }}
        style={{ position: 'relative', padding: '0.4rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}
      >
        <Bell size={18} color={unread > 0 ? '#f59e0b' : 'var(--text-secondary)'} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: 'white', fontSize: '0.65rem', fontWeight: 700, borderRadius: '50%', width: '17px', height: '17px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '360px', zIndex: 2000,
          background: 'rgba(15,23,42,0.97)', border: '1px solid var(--glass-border)',
          borderRadius: '14px', boxShadow: '0 16px 48px rgba(0,0,0,0.5)', overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--glass-border)' }}>
            <strong style={{ fontSize: '0.9rem' }}>🔔 通知中心 {unread > 0 && <span style={{ color: '#f59e0b' }}>（{unread} 則未讀）</span>}</strong>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {unread > 0 && (
                <button onClick={markAllRead} style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <CheckCheck size={13} /> 全部已讀
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ padding: '0.25rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <Bell size={32} opacity={0.3} style={{ display: 'block', margin: '0 auto 0.75rem' }} />
                目前沒有通知
              </div>
            ) : notifications.map(n => (
              <div key={n.notification_id}
                style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: n.is_read ? 'transparent' : 'rgba(245,158,11,0.05)', cursor: 'pointer', transition: 'background 0.15s' }}
                onClick={() => { if (!n.is_read) markRead(n.notification_id) }}
              >
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.25rem', flexShrink: 0, marginTop: '1px' }}>{TYPE_ICON[n.type] || TYPE_ICON.DEFAULT}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                      <p style={{ margin: 0, fontWeight: n.is_read ? 400 : 600, fontSize: '0.87rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>{n.title}</p>
                      {!n.is_read && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />}
                    </div>
                    {n.content && <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.content}</p>}
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: 'rgba(148,163,184,0.6)' }}>{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
