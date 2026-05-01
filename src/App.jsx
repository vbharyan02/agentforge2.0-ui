import { useState, useRef, useEffect } from 'react'
import BuildPage from './pages/BuildPage'
import JobsPage from './pages/JobsPage'
import PreviewPage from './pages/PreviewPage'
import './App.css'

const INITIAL_BUILD_STATE = {
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

export default function App() {
  const [page, setPage] = useState('build')
  const [dark, setDark] = useState(true)
  const [buildState, setBuildState] = useState(INITIAL_BUILD_STATE)
  const wsRef = useRef(null)

  useEffect(() => {
    const handler = (e) => setPage(e.detail)
    window.addEventListener('switch-tab', handler)
    return () => window.removeEventListener('switch-tab', handler)
  }, [])

  return (
    <div className={`app ${dark ? 'dark' : 'light'}`} style={{ minHeight: '100vh' }}>
      <nav className="navbar">
        <span className="logo">⚡ AgentForge</span>
        <div className="nav-right">
          <button
            className={`nav-btn ${page === 'build' ? 'active' : ''}`}
            onClick={() => setPage('build')}
          >
            Build {buildState.status === 'running' && '⏳'}
          </button>
          <button
            className={`nav-btn ${page === 'jobs' ? 'active' : ''}`}
            onClick={() => setPage('jobs')}
          >
            Jobs
          </button>
          <button
            className={`nav-btn ${page === 'preview' ? 'active' : ''}`}
            onClick={() => setPage('preview')}
          >
            🔍 Live Preview
          </button>
          <button className="theme-toggle" onClick={() => setDark(!dark)}>
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </nav>
      <div className="main">
        <div style={{ display: page === 'build' ? 'block' : 'none' }}>
          <BuildPage dark={dark} buildState={buildState} setBuildState={setBuildState} wsRef={wsRef} />
        </div>
        <div style={{ display: page === 'jobs' ? 'block' : 'none' }}>
          <JobsPage dark={dark} />
        </div>
        <div style={{ display: page === 'preview' ? 'block' : 'none' }}>
          <PreviewPage dark={dark} />
        </div>
      </div>
    </div>
  )
}
