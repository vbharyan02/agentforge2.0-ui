import { useState, useRef } from 'react'
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
        {page === 'build' && <BuildPage dark={dark} buildState={buildState} setBuildState={setBuildState} wsRef={wsRef} />}
        {page === 'jobs' && <JobsPage dark={dark} />}
        {page === 'preview' && <PreviewPage dark={dark} />}
      </div>
    </div>
  )
}
