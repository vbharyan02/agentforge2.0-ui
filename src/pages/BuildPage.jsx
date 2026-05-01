import { useEffect, useRef, useState } from 'react'

const API = 'https://api.agentforge2.xyz'
const WS  = 'wss://ws.agentforge2.xyz'

const AGENTS = [
  { key: 'orch', label: 'Orchestrator', cls: 'orch' },
  { key: 'db',   label: 'DB Agent',     cls: 'db'   },
  { key: 'fe',   label: 'Frontend',     cls: 'fe'   },
]

const INITIAL_STATE = {
  status: null,
  progress: 0,
  prLink: null,
  netlifyUrl: null,
  agentLogs: { orch: [], db: [], fe: [] },
  activeAgent: null,
  jobId: null,
  prompt: '',
  feature: '',
  repo: '',
  mode: 'new',
  previewVisible: false,
  previewKey: 0,
}

function classifyLog(line) {
  // DB Agent lines
  if (line.includes('[DB Agent]') ||
      line.includes('[DB SETUP]') ||
      line.includes('Step 2') ||
      line.includes('DB Agent writing') ||
      line.includes('DB schema ready') ||
      line.includes('schema.sql') ||
      line.includes('rls.sql') ||
      line.includes('seed.sql') ||
      line.includes('Tables:')) {
    return 'db'
  }

  // Frontend Agent lines
  if (line.includes('[Frontend Agent]') ||
      line.includes('Step 3') ||
      line.includes('Frontend Agent building') ||
      line.includes('Frontend ready') ||
      line.includes('Pages:') ||
      line.includes('fe_done')) {
    return 'fe'
  }

  // Everything else → Orchestrator panel
  // This includes [Orchestrator], [PIPELINE], git output,
  // GitHub lines, Netlify lines, Step 1, Step 4
  return 'orch'
}

export default function BuildPage({ dark, buildState, setBuildState, wsRef }) {
  const { status, progress, prLink, netlifyUrl, agentLogs, activeAgent, mode, prompt, feature, repo, previewVisible, previewKey } = buildState
  const set = (patch) => setBuildState(prev => ({ ...prev, ...patch }))

  const logRefs = { orch: useRef(null), db: useRef(null), fe: useRef(null) }
  const [changeText, setChangeText] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)

  useEffect(() => {
    Object.keys(logRefs).forEach(k => {
      logRefs[k].current?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [agentLogs])

  function addLog(agent, line, isError) {
    setBuildState(prev => ({
      ...prev,
      agentLogs: {
        ...prev.agentLogs,
        [agent]: [...(prev.agentLogs[agent] || []), { text: line, error: isError }]
      }
    }))
  }

  function handleLine(line) {
    // Extract GitHub PR link - multiple patterns
    const prPatterns = [
      /https:\/\/github\.com\/[^\s]+\/pull\/\d+/,
      /PR created:\s*(https:\/\/github\.com\/[^\s]+)/,
      /PR link\s*:\s*(https:\/\/github\.com\/[^\s]+)/
    ]
    for (const pattern of prPatterns) {
      const match = line.match(pattern)
      if (match) {
        const url = match[1] || match[0]
        setBuildState(prev => ({ ...prev, prLink: url.trim() }))
        break
      }
    }

    // Extract Netlify URL
    // Pattern 1: [PIPELINE] Netlify URL: https://xxx.netlify.app
    if (line.includes('Netlify URL:')) {
      const match = line.match(/https:\/\/[\w-]+\.netlify\.app/)
      if (match) {
        setBuildState(prev => ({ ...prev, netlifyUrl: match[0] }))
      }
    }

    // Pattern 2: Netlify site created: https://xxx.netlify.app
    if (line.includes('Netlify site created:')) {
      const match = line.match(/https:\/\/[\w-]+\.netlify\.app/)
      if (match) {
        setBuildState(prev => ({ ...prev, netlifyUrl: match[0] }))
      }
    }

    // Pattern 3: feature mode — do NOT set netlifyUrl, PR link is enough

    // Progress tracking
    if (line.includes('Step 1') || line.includes('Orchestrator')) {
      setBuildState(prev => ({ ...prev, progress: 10 }))
    }
    if (line.includes('Step 2') || line.includes('DB Agent')) {
      setBuildState(prev => ({ ...prev, progress: 35 }))
    }
    if (line.includes('Step 3') || line.includes('Frontend Agent')) {
      setBuildState(prev => ({ ...prev, progress: 65 }))
    }
    if (line.includes('Step 4') || line.includes('GitHub')) {
      setBuildState(prev => ({ ...prev, progress: 85 }))
    }
    if (line.includes('Pipeline complete') || line.includes('complete!') || line.includes('Preview build complete') || line.includes('Preview updated')) {
      setBuildState(prev => ({ ...prev, progress: 100 }))
    }

    // Classify log to correct agent panel
    const agent = classifyLog(line)
    set({ activeAgent: agent })
    addLog(agent, line, false)
  }

  async function handleBuild() {
    // Reset state
    setBuildState(prev => ({
      ...prev,
      agentLogs: { orch: [], db: [], fe: [] },
      prLink: null,
      netlifyUrl: null,
      progress: 0,
      activeAgent: null,
      status: 'running',
      previewVisible: false,
      previewKey: 0,
    }))

    // 1. Connect WebSocket FIRST
    const ws = new WebSocket(WS)
    wsRef.current = ws
    let currentJobId = null

    ws.onopen = async () => {
      // Keep connection alive with ping every 25 seconds
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        } else {
          clearInterval(pingInterval)
        }
      }, 25000)

      // Store interval so we can clear it on close
      ws.pingInterval = pingInterval

      // 2. Make POST request after WS is open
      const isPreview = buildState.mode === 'preview'
      const body = buildState.mode === 'feature'
        ? { feature: buildState.feature, repo: buildState.repo }
        : { prompt: buildState.prompt }
      const endpoint = buildState.mode === 'feature' ? '/feature'
        : isPreview ? '/preview-build'
        : '/build'

      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      currentJobId = data.jobId
      set({ jobId: data.jobId })

      // Subscribe to get any logs we missed
      ws.send(JSON.stringify({ type: 'subscribe', jobId: currentJobId }))
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      // Accept messages for our job
      if (currentJobId && msg.jobId !== currentJobId) return
      if (msg.type === 'log' || msg.type === 'error') {
        handleLine(msg.line)
      }
      if (msg.type === 'done') {
        setBuildState(prev => ({
          ...prev,
          status: msg.status,
          progress: (msg.status === 'done' || msg.status === 'preview_ready') ? 100 : prev.progress,
          previewVisible: msg.status === 'preview_ready' ? true : prev.previewVisible,
        }))
        ws.close()
        wsRef.current = null
      }
    }

    ws.onerror = (e) => {
      console.error('WebSocket error', e)
      addLog('orch', 'WebSocket error', true)
    }

    ws.onclose = () => {
      console.log('WebSocket closed')
      if (ws.pingInterval) clearInterval(ws.pingInterval)
    }
  }

  async function handlePreviewChange() {
    if (!changeText.trim()) return
    setPreviewBusy(true)

    const ws = new WebSocket(WS)
    let changeJobId = null

    ws.onopen = async () => {
      const res = await fetch(`${API}/preview-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: buildState.jobId, change: changeText })
      })
      const data = await res.json()
      changeJobId = data.jobId
      ws.send(JSON.stringify({ type: 'subscribe', jobId: changeJobId }))
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (changeJobId && msg.jobId !== changeJobId) return
      if (msg.type === 'log' || msg.type === 'error') {
        handleLine(msg.line)
      }
      if (msg.type === 'done') {
        if (msg.status === 'preview_updated') {
          // Force iframe refresh by bumping the key
          setBuildState(prev => ({ ...prev, previewKey: prev.previewKey + 1 }))
          setChangeText('')
        }
        setPreviewBusy(false)
        ws.close()
      }
    }

    ws.onerror = () => { setPreviewBusy(false) }
    ws.onclose = () => {}
  }

  async function handleDeploy() {
    setPreviewBusy(true)

    const ws = new WebSocket(WS)
    let deployJobId = null

    ws.onopen = async () => {
      const res = await fetch(`${API}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: buildState.jobId })
      })
      const data = await res.json()
      deployJobId = data.jobId
      ws.send(JSON.stringify({ type: 'subscribe', jobId: deployJobId }))
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (deployJobId && msg.jobId !== deployJobId) return
      if (msg.type === 'log' || msg.type === 'error') {
        handleLine(msg.line)
      }
      if (msg.type === 'done') {
        if (msg.status === 'deployed') {
          setBuildState(prev => ({ ...prev, previewVisible: false, status: 'done' }))
        }
        setPreviewBusy(false)
        ws.close()
      }
    }

    ws.onerror = () => { setPreviewBusy(false) }
    ws.onclose = () => {}
  }

  function handleClear() {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setChangeText('')
    setPreviewBusy(false)
    setBuildState({ ...INITIAL_STATE, mode })
  }

  return (
    <div>
      {/* Mode tabs */}
      <div className="mode-tabs">
        <button className={`mode-tab ${mode === 'new' ? 'active' : ''}`} onClick={() => set({ mode: 'new' })}>🚀 New App</button>
        <button className={`mode-tab ${mode === 'feature' ? 'active' : ''}`} onClick={() => set({ mode: 'feature' })}>✨ Add Feature</button>
        <button className={`mode-tab ${mode === 'preview' ? 'active' : ''}`} onClick={() => set({ mode: 'preview' })}>👁 Preview Build</button>
      </div>

      {/* Input */}
      <div className="card">
        {mode === 'new' || mode === 'preview' ? (
          <textarea
            value={prompt}
            onChange={e => set({ prompt: e.target.value })}
            placeholder={mode === 'preview'
              ? 'Describe your app... preview will be served locally before deploying'
              : 'Describe your app... e.g. Build a recipe book app'}
          />
        ) : (
          <>
            <input value={repo} onChange={e => set({ repo: e.target.value })} placeholder="Repo slug — e.g. recipe-book" />
            <input value={feature} onChange={e => set({ feature: e.target.value })} placeholder="Feature — e.g. add dark mode toggle" />
          </>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="build-btn" onClick={handleBuild} disabled={status === 'running'}>
            {status === 'running' ? '⏳ Building...'
              : mode === 'new' ? '⚡ Build App'
              : mode === 'preview' ? '👁 Preview Build'
              : '✨ Add Feature'}
          </button>
          {status && (
            <button
              onClick={handleClear}
              disabled={status === 'running'}
              style={{
                padding: '11px 20px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: status === 'running' ? 'not-allowed' : 'pointer',
                border: '1px solid #444',
                background: 'transparent',
                color: status === 'running' ? '#555' : '#aaa',
                transition: 'all 0.15s'
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {status && (
        <div className="progress-bg">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Status */}
      {status && (
        <div className={`status-bar status-${status}`}>
          {status === 'running'       && '⏳ Agents are working...'}
          {status === 'done'          && '✅ Build complete! Your app is live.'}
          {status === 'failed'        && '❌ Build failed. Check logs below.'}
          {status === 'preview_ready' && '👁 Preview ready — review below, then apply changes or deploy.'}
        </div>
      )}

      {/* Links — shown after deploy completes */}
      {(prLink || netlifyUrl) && !previewVisible && (
        <div className="links-row">
          {prLink && <a href={prLink} target="_blank" rel="noreferrer" className="link-btn link-github">GitHub PR →</a>}
          {netlifyUrl && <a href={netlifyUrl} target="_blank" rel="noreferrer" className="link-btn link-netlify">Live App →</a>}
        </div>
      )}

      {/* Agent panels */}
      {status && (
        <>
          <div className="section-title">Agent Logs</div>
          <div className="agents-grid">
            {AGENTS.map(agent => (
              <div key={agent.key} className="agent-panel">
                <div className={`agent-header ${agent.cls}`}>
                  <span className={`agent-dot ${activeAgent === agent.key ? 'pulse' : ''}`} />
                  {agent.label}
                </div>
                <div className="agent-logs">
                  {agentLogs[agent.key].map((log, i) => (
                    <div key={i} className={`log-line ${log.error ? 'error' : 'active'}`}>
                      {log.text}
                    </div>
                  ))}
                  <div ref={logRefs[agent.key]} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Preview Panel — shown after preview-build completes */}
      {previewVisible && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>Preview</div>

          <a
            href="https://preview.agentforge2.xyz"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 13, color: '#7c5cfc', marginBottom: 10, display: 'inline-block' }}
          >
            Open in new tab ↗
          </a>

          <iframe
            key={previewKey}
            src="https://preview.agentforge2.xyz"
            style={{
              width: '100%',
              height: 480,
              border: '1px solid #333',
              borderRadius: 8,
              background: '#111',
              display: 'block',
            }}
            title="App Preview"
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={changeText}
              onChange={e => setChangeText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !previewBusy && handlePreviewChange()}
              placeholder="Request a change... e.g. Make the header blue"
              disabled={previewBusy}
              style={{ flex: 1 }}
            />
            <button
              className="build-btn"
              onClick={handlePreviewChange}
              disabled={previewBusy || !changeText.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {previewBusy ? '⏳ Applying...' : 'Apply Changes'}
            </button>
          </div>

          <button
            className="build-btn"
            onClick={handleDeploy}
            disabled={previewBusy}
            style={{
              marginTop: 10,
              width: '100%',
              background: previewBusy ? '#444' : '#16a34a',
              justifyContent: 'center',
            }}
          >
            {previewBusy ? '⏳ Working...' : '🚀 Deploy to Prod'}
          </button>
        </div>
      )}
    </div>
  )
}
