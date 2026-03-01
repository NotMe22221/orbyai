export default function Home() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem', background: '#0f0f19', color: 'white', minHeight: '100vh' }}>
      <h1>&#x1F916; Resident Secretary API</h1>
      <p style={{ color: 'rgba(255,255,255,0.6)' }}>Backend is running.</p>
      <ul style={{ lineHeight: 2, color: 'rgba(255,255,255,0.8)' }}>
        <li><code>POST /api/voice</code> — Main voice command endpoint</li>
        <li><code>GET /api/stream?sessionId=X</code> — SSE real-time updates</li>
      </ul>
    </main>
  );
}
