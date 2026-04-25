import { useEffect, useRef } from 'react'

const API = 'https://ready-assuming-bool-mag.trycloudflare.com'
const WS  = 'wss://ready-assuming-bool-mag.trycloudflare.com'

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
  mode: 'new'
}

function classifyLog(line) {
  const l = line.toLowerCase()
  if (l.includes('[orch]') || l.includes('orchestrator') || l.includes('step 1')) return 'orch'
  if (l.includes('[db') || l.includes('schema') || l.includes('supabase setup') || l.includes('step 2')) return 'db'
  if (l.includes('[fe') || l.includes('frontend') || l.includes('react') || l.includes('step 3')) return 'fe'
  return 'all'
}

export default function BuildPage({ dark, buildState, setBuildState, wsRef }) {
  const { status, progress, prLink, netlifyUrl, agentLogs, activeAgent, mode, prompt, feature, repo } = buildState
  const set = (patch) => setBuildState(prev => ({ ...prev, ...patch }))

  const logRefs = { orch: useRef(null), db: useRef(null), fe: useRef(null) }

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
    const agent = classifyLog(line)
    if (agent !== 'all') {
      set({ activeAgent: agent })
      addLog(agent, line, false)
    } else {
      addLog('orch', line, false)
    }
    if (line.includes('Step 1')) set({ progress: 10 })
    if (line.includes('Step 2')) set({ progress: 35 })
    if (line.includes('Step 3')) set({ progress: 65 })
    if (line.includes('Step 4')) set({ progress: 85 })
    if (line.includes('Pipeline complete')) set({ progress: 100 })
    const prMatch = line.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)
    if (prMatch) set({ prLink: prMatch[0] })
    const nlMatch = line.match(/https:\/\/[^\s]+\.netlify\.app/)
    if (nlMatch) set({ netlifyUrl: nlMatch[0] })
  }

  async function handleBuild() {
    setBuildState(prev => ({
      ...prev,
      agentLogs: { orch: [], db: [], fe: [] },
      prLink: null,
      netlifyUrl: null,
      progress: 0,
      activeAgent: null,
      status: 'running'
    }))

    const body = mode === 'new' ? { prompt } : { feature, repo }
    const endpoint = mode === 'new' ? '/build' : '/feature'

    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    set({ jobId: data.jobId })

    const ws = new WebSocket(WS)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.jobId !== data.jobId) return
      if (msg.type === 'log' || msg.type === 'error') {
        handleLine(msg.line)
      }
      if (msg.type === 'done') {
        setBuildState(prev => ({
          ...prev,
          status: msg.status,
          progress: msg.status === 'done' ? 100 : prev.progress
        }))
        ws.close()
        wsRef.current = null
      }
    }

    ws.onerror = () => {
      addLog('orch', 'WebSocket error', true)
    }
  }

  function handleClear() {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setBuildState({ ...INITIAL_STATE, mode })
  }

  return (
    <div>
      {/* Mode tabs */}
      <div className="mode-tabs">
        <button className={`mode-tab ${mode === 'new' ? 'active' : ''}`} onClick={() => set({ mode: 'new' })}>🚀 New App</button>
        <button className={`mode-tab ${mode === 'feature' ? 'active' : ''}`} onClick={() => set({ mode: 'feature' })}>✨ Add Feature</button>
      </div>

      {/* Input */}
      <div className="card">
        {mode === 'new' ? (
          <textarea
            value={prompt}
            onChange={e => set({ prompt: e.target.value })}
            placeholder="Describe your app... e.g. Build a recipe book app"
          />
        ) : (
          <>
            <input value={repo} onChange={e => set({ repo: e.target.value })} placeholder="Repo slug — e.g. recipe-book" />
            <input value={feature} onChange={e => set({ feature: e.target.value })} placeholder="Feature — e.g. add dark mode toggle" />
          </>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="build-btn" onClick={handleBuild} disabled={status === 'running'}>
            {status === 'running' ? '⏳ Building...' : mode === 'new' ? '⚡ Build App' : '✨ Add Feature'}
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
          {status === 'running' && '⏳ Agents are working...'}
          {status === 'done' && '✅ Build complete! Your app is live.'}
          {status === 'failed' && '❌ Build failed. Check logs below.'}
        </div>
      )}

      {/* Links */}
      {(prLink || netlifyUrl) && (
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
    </div>
  )
}
