export default function Home() {
  return (
    <main style={{
      fontFamily: 'monospace',
      padding: '2rem',
      background: '#0f0f19',
      color: 'white',
      minHeight: '100vh'
    }}>
      <h1 style={{ marginBottom: '4px' }}>&#x1F916; Resident Secretary API</h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 0, marginBottom: '2rem' }}>
        Backend is running — deploy to Vercel for production.
      </p>

      <h3 style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>Endpoints</h3>
      <ul style={{ lineHeight: 2.2, color: 'rgba(255,255,255,0.8)', paddingLeft: '1.2rem' }}>
        <li><code>POST /api/voice</code> — Main voice command pipeline (Agent A → B → Safety gate)</li>
        <li><code>POST /api/transcribe</code> — ElevenLabs STT (audio → transcript)</li>
        <li><code>POST /api/tts</code> — ElevenLabs TTS (text → audio)</li>
        <li><code>GET &nbsp;/api/agent-url</code> — ElevenLabs Conversational Agent signed URL</li>
        <li><code>GET &nbsp;/api/stream</code> — SSE real-time status updates</li>
        <li><code>GET &nbsp;/api/health</code> — Health check + env status</li>
      </ul>
    </main>
  );
}
