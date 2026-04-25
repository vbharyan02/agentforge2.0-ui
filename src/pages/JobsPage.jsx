import { useState, useEffect } from 'react'

const API = 'https://api.agentforge2.xyz'

export default function JobsPage({ dark }) {
  const [jobs, setJobs] = useState({})

  useEffect(() => {
    fetch(`${API}/jobs`)
      .then(r => r.json())
      .then(setJobs)
      .catch(() => {})
  }, [])

  const entries = Object.entries(jobs).reverse()

  return (
    <div>
      <div className="section-title">Build History</div>
      {entries.length === 0 && (
        <div className="card" style={{ textAlign: 'center', opacity: 0.5, padding: 40 }}>
          No jobs yet. Go build something!
        </div>
      )}
      {entries.map(([id, job]) => (
        <div key={id} className="job-item">
          <div>
            <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
              {job.prompt || job.feature || 'Unknown'}
            </div>
            <div style={{ fontSize: 12, opacity: 0.5 }}>
              {new Date(job.startedAt).toLocaleString()}
              {job.repo && ` · ${job.repo}`}
            </div>
          </div>
          <span className={`job-badge badge-${job.status}`}>{job.status}</span>
        </div>
      ))}
    </div>
  )
}
