import { useState, useRef, useEffect } from 'react'

const API = 'https://api.agentforge2.xyz'
const WS = 'wss://ws.agentforge2.xyz'
const PREVIEW_URL = 'https://preview.agentforge2.xyz'

export default function PreviewPage({ dark }) {
  const [change, setChange] = useState('')
  const [status, setStatus] = useState('ready')
  const [logs, setLogs] = useState([])
  const [prLink, setPrLink] = useState(null)
  const [netlifyUrl, setNetlifyUrl] = useState(null)
  const [iframeKey, setIframeKey] = useState(0)
  const wsRef = useRef(null)
  const logsEndRef = useRef(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  function connectWS(jobId) {
    const ws = new WebSocket(WS)
    wsRef.current = ws

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 25000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', jobId }))
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.jobId !== jobId) return

      if (msg.type === 'log') {
        setLogs(prev => [...prev, { text: msg.line, error: false }])
        if (msg.line.includes('PR link')) {
          const match = msg.line.match(/https:\/\/github\.com\/[^\s]+/)
          if (match) setPrLink(match[0].trim())
        }
        if (msg.line.includes('Netlify URL')) {
          const match = msg.line.match(/https:\/\/[\w-]+\.netlify\.app/)
          if (match) setNetlifyUrl(match[0].trim())
        }
      }

      if (msg.type === 'error') {
        setLogs(prev => [...prev, { text: msg.line, error: true }])
      }

      if (msg.type === 'preview-ready') {
        setIframeKey(k => k + 1)
        setStatus('ready')
      }

      if (msg.type === 'done') {
        if (msg.status === 'done') setStatus('ready')
        if (msg.status === 'failed') setStatus('failed')
        clearInterval(ping)
        ws.close()
      }
    }

    ws.onclose = () => clearInterval(ping)
    ws.onerror = () => clearInterval(ping)
  }

  async function handleApplyChange() {
    if (!change.trim()) return
    setStatus('changing')
    setLogs(prev => [...prev,
      { text: `\n[CHANGE] Applying: "${change}"\n`, error: false }
    ])

    const res = await fetch(`${API}/preview-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ change })
    })
    const data = await res.json()
    setChange('')
    connectWS(data.jobId)
  }

  async function handleDeploy() {
    setStatus('deploying')
    setLogs(prev => [...prev,
      { text: '\n[DEPLOY] Pushing to GitHub + Netlify...\n', error: false }
    ])

    const res = await fetch(`${API}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName: 'current' })
    })
    const data = await res.json()
    connectWS(data.jobId)
  }

  const isWorking = status === 'changing' || status === 'deploying'

  return (
    <div>
      <div className="section-title">Live Preview</div>

      {/* Status */}
      {status !== 'ready' && (
        <div className={`status-bar ${
          status === 'failed' ? 'status-failed' : 'status-running'
        }`}>
          {status === 'changing'  && '⏳ Applying your changes...'}
          {status === 'deploying' && '⏳ Deploying to production...'}
          {status === 'failed'    && '❌ Something went wrong. Check logs.'}
        </div>
      )}

      {/* Info message */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          This shows the app built in the <strong>Build tab</strong>.
          Request changes below or deploy when ready.
        </div>
      </div>

      {/* iframe */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '0.5px solid var(--color-border-tertiary)'
        }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            🔍 preview.agentforge2.xyz
          </span>
          <a
            href={PREVIEW_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 11, padding: '4px 10px',
              borderRadius: 6, background: '#6366f1',
              color: '#fff', textDecoration: 'none'
            }}
          >
            ↗ Open in new tab
          </a>
        </div>
        <iframe
          key={iframeKey}
          src={PREVIEW_URL}
          style={{ width: '100%', height: 500, border: 'none', display: 'block' }}
          title="App Preview"
        />
      </div>

      {/* Change request + Deploy */}
      {!netlifyUrl && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
            Not happy? Request changes
          </div>
          <input
            value={change}
            onChange={e => setChange(e.target.value)}
            placeholder="e.g. Make the header blue, add a search bar..."
            disabled={isWorking}
            onKeyDown={e => e.key === 'Enter' && !isWorking && handleApplyChange()}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              className="build-btn"
              onClick={handleApplyChange}
              disabled={isWorking || !change.trim()}
              style={{ flex: 1 }}
            >
              {status === 'changing' ? '⏳ Applying...' : '✨ Apply Changes'}
            </button>
            <button
              onClick={handleDeploy}
              disabled={isWorking}
              style={{
                flex: 1, padding: '11px 28px',
                borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: isWorking ? 'not-allowed' : 'pointer',
                border: 'none',
                background: isWorking ? '#999' :
                  'linear-gradient(135deg, #1D9E75, #0F6E56)',
                color: '#fff'
              }}
            >
              {status === 'deploying' ? '⏳ Deploying...' : '🚀 Deploy to Production'}
            </button>
          </div>
        </div>
      )}

      {/* Production links */}
      {(prLink || netlifyUrl) && (
        <div className="links-row">
          {prLink && (
            <a href={prLink} target="_blank" rel="noreferrer"
               className="link-btn link-github">
              🔗 GitHub PR →
            </a>
          )}
          {netlifyUrl && (
            <a href={netlifyUrl} target="_blank" rel="noreferrer"
               className="link-btn link-netlify">
              🚀 Live App →
            </a>
          )}
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div style={{
          background: '#0d0d0d', borderRadius: 10, padding: 16,
          maxHeight: 250, overflowY: 'auto',
          fontFamily: 'monospace', fontSize: 11, marginTop: 16
        }}>
          {logs.map((log, i) => (
            <div key={i} style={{
              color: log.error ? '#ff6b6b' : '#00ff88',
              marginBottom: 2, whiteSpace: 'pre-wrap'
            }}>
              {log.text}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  )
}
