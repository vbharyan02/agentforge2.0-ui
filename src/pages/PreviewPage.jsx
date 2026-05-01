import { useState, useRef, useEffect } from 'react'

const API = 'https://api.agentforge2.xyz'
const WS = 'wss://ws.agentforge2.xyz'
const PREVIEW_URL = 'https://preview.agentforge2.xyz'

export default function PreviewPage({ dark }) {
  const [prompt, setPrompt] = useState('')
  const [change, setChange] = useState('')
  const [status, setStatus] = useState(null)
  // null | 'building' | 'preview-ready' | 'changing' | 'deploying' | 'deployed'
  const [logs, setLogs] = useState([])
  const [previewUrl, setPreviewUrl] = useState(null)
  const [appName, setAppName] = useState(null)
  const [prLink, setPrLink] = useState(null)
  const [netlifyUrl, setNetlifyUrl] = useState(null)
  const [progress, setProgress] = useState(0)
  const wsRef = useRef(null)
  const logsEndRef = useRef(null)
  const iframeRef = useRef(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  function addLog(line, isError = false) {
    setLogs(prev => [...prev, { text: line, error: isError }])
    // Extract app name from logs
    if (line.includes('[PIPELINE] App slug')) {
      const match = line.match(/App slug[^:]*:\s*([\w-]+)/)
      if (match) setAppName(match[1])
    }
    if (line.includes('Step 1')) setProgress(15)
    if (line.includes('Step 2')) setProgress(35)
    if (line.includes('Step 3')) setProgress(60)
    if (line.includes('[PREVIEW] Building')) setProgress(80)
    if (line.includes('Preview URL')) setProgress(100)
  }

  function connectWS(jobId) {
    const ws = new WebSocket(WS)
    wsRef.current = ws

    // Heartbeat
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

      if (msg.type === 'log') addLog(msg.line)
      if (msg.type === 'error') addLog(msg.line, true)

      if (msg.type === 'preview-ready') {
        setPreviewUrl(msg.previewUrl)
        setStatus('preview-ready')
        setProgress(100)
      }

      if (msg.type === 'log' && msg.line.includes('PR link')) {
        const match = msg.line.match(/https:\/\/github\.com\/[^\s]+/)
        if (match) setPrLink(match[0].trim())
      }

      if (msg.type === 'log' && msg.line.includes('Netlify URL')) {
        const match = msg.line.match(/https:\/\/[\w-]+\.netlify\.app/)
        if (match) setNetlifyUrl(match[0].trim())
      }

      if (msg.type === 'done') {
        if (msg.status === 'failed') setStatus('failed')
        if (msg.status === 'done' && status === 'deploying') setStatus('deployed')
        clearInterval(ping)
        ws.close()
      }
    }

    ws.onerror = () => clearInterval(ping)
    ws.onclose = () => clearInterval(ping)
  }

  async function handleBuildPreview() {
    if (!prompt.trim()) return
    setLogs([])
    setPreviewUrl(null)
    setPrLink(null)
    setNetlifyUrl(null)
    setProgress(0)
    setAppName(null)
    setStatus('building')

    const res = await fetch(`${API}/preview-build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    })
    const data = await res.json()
    connectWS(data.jobId)
  }

  async function handleApplyChange() {
    if (!change.trim()) return
    setStatus('changing')
    setProgress(0)
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
    if (!appName) return
    setStatus('deploying')
    setProgress(0)
    setLogs(prev => [...prev,
      { text: '\n[DEPLOY] Pushing to GitHub + Netlify...\n', error: false }
    ])

    const res = await fetch(`${API}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName })
    })
    const data = await res.json()
    connectWS(data.jobId)
    setStatus('deploying')
  }

  function refreshPreview() {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src
    }
  }

  const isBuilding = status === 'building' ||
                     status === 'changing' ||
                     status === 'deploying'

  return (
    <div>
      {/* Header */}
      <div className="section-title">Live Preview</div>

      {/* Prompt input */}
      {!previewUrl && (
        <div className="card">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe your app... e.g. Build a habit tracker"
            disabled={isBuilding}
          />
          <button
            className="build-btn"
            onClick={handleBuildPreview}
            disabled={isBuilding || !prompt.trim()}
          >
            {status === 'building' ? '⏳ Building Preview...' : '🔍 Build Preview'}
          </button>
        </div>
      )}

      {/* Progress bar */}
      {status && (
        <div className="progress-bg">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Status */}
      {status && (
        <div className={`status-bar ${
          status === 'preview-ready' || status === 'deployed' ? 'status-done' :
          status === 'failed' ? 'status-failed' : 'status-running'
        }`}>
          {status === 'building'      && '⏳ Agents building your app...'}
          {status === 'preview-ready' && '✅ Preview ready! Review below.'}
          {status === 'changing'      && '⏳ Applying your changes...'}
          {status === 'deploying'     && '⏳ Deploying to production...'}
          {status === 'deployed'      && '🚀 App is live in production!'}
          {status === 'failed'        && '❌ Something went wrong. Check logs.'}
        </div>
      )}

      {/* Preview iframe */}
      {previewUrl && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '0.5px solid var(--color-border-tertiary)'
          }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>
              🔍 Preview — {previewUrl}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={refreshPreview}
                style={{
                  fontSize: 11, padding: '4px 10px',
                  borderRadius: 6, border: '0.5px solid var(--color-border-secondary)',
                  background: 'transparent', cursor: 'pointer',
                  color: 'var(--color-text-secondary)'
                }}
              >
                🔄 Refresh
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 11, padding: '4px 10px',
                  borderRadius: 6, background: '#6366f1',
                  color: '#fff', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center'
                }}
              >
                ↗ Open in new tab
              </a>
            </div>
          </div>
          <iframe
            ref={iframeRef}
            src={previewUrl}
            style={{
              width: '100%',
              height: 500,
              border: 'none',
              display: 'block'
            }}
            title="App Preview"
          />
        </div>
      )}

      {/* Change request */}
      {previewUrl && status !== 'deploying' && status !== 'deployed' && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
            Request Changes
          </div>
          <input
            value={change}
            onChange={e => setChange(e.target.value)}
            placeholder="e.g. Make the header blue, add a search bar..."
            disabled={isBuilding}
            onKeyDown={e => e.key === 'Enter' && handleApplyChange()}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              className="build-btn"
              onClick={handleApplyChange}
              disabled={isBuilding || !change.trim()}
              style={{ flex: 1 }}
            >
              {status === 'changing' ? '⏳ Applying...' : '✨ Apply Changes'}
            </button>
            <button
              onClick={handleDeploy}
              disabled={isBuilding}
              style={{
                flex: 1, padding: '11px 28px',
                borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: isBuilding ? 'not-allowed' : 'pointer',
                border: 'none',
                background: isBuilding ? '#999' : 'linear-gradient(135deg, #1D9E75, #0F6E56)',
                color: '#fff'
              }}
            >
              {status === 'deploying' ? '⏳ Deploying...' : '🚀 Deploy to Production'}
            </button>
          </div>
        </div>
      )}

      {/* Production links after deploy */}
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
          maxHeight: 300, overflowY: 'auto',
          fontFamily: 'monospace', fontSize: 11,
          marginTop: 16
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

      {/* Start over */}
      {previewUrl && (
        <button
          onClick={() => {
            setStatus(null)
            setPrompt('')
            setLogs([])
            setPreviewUrl(null)
            setPrLink(null)
            setNetlifyUrl(null)
            setProgress(0)
            setAppName(null)
          }}
          style={{
            marginTop: 12, fontSize: 12, padding: '6px 14px',
            borderRadius: 6, border: '0.5px solid var(--color-border-secondary)',
            background: 'transparent', cursor: 'pointer',
            color: 'var(--color-text-secondary)'
          }}
        >
          ← Start over
        </button>
      )}
    </div>
  )
}
