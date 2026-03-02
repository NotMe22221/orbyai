'use client';
import { useEffect, useState } from 'react';

interface HealthData {
  status: string;
  service: string;
  timestamp: string;
  env: {
    elevenlabs: boolean;
    elevenlabsAgent: boolean;
    deployAI: boolean;
    supabase: boolean;
    mocks: boolean;
  };
}

export default function Dashboard() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setApiError(`API returned ${res.status} (non-JSON). Routes may not be deployed yet.`);
        setHealth(null);
        return;
      }
      const data = await res.json();
      setHealth(data);
      setApiError(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setApiError(`Could not reach /api/health: ${msg}`);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const StatusDot = ({ active }: { active: boolean }) => (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: active ? '#22d3a6' : '#ef4444',
      boxShadow: active ? '0 0 8px #22d3a6aa' : '0 0 8px #ef4444aa',
      marginRight: 8, flexShrink: 0,
    }} />
  );

  const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16, padding: '1.5rem', backdropFilter: 'blur(12px)', ...style,
    }}>
      {children}
    </div>
  );

  const endpoints = [
    { method: 'POST', path: '/api/voice',      desc: 'Main pipeline — Coordinator → AgentA → AgentB → Safety Gate' },
    { method: 'POST', path: '/api/transcribe', desc: 'ElevenLabs STT — audio → transcript' },
    { method: 'POST', path: '/api/tts',        desc: 'ElevenLabs TTS — text → audio stream' },
    { method: 'GET',  path: '/api/agent-url',  desc: 'Signed WebSocket URL for Conversational Agent' },
    { method: 'GET',  path: '/api/stream',     desc: 'SSE real-time status updates' },
    { method: 'GET',  path: '/api/health',     desc: 'Health check + env status' },
  ];

  const pipeline = [
    { name: 'Coordinator',    color: '#818cf8', desc: 'Deterministic router <10ms' },
    { name: 'Agent A',        color: '#34d399', desc: 'Voice Concierge — intent classification' },
    { name: 'Agent B',        color: '#f472b6', desc: 'Workspace Executor — action payloads' },
    { name: 'Safety Gate',    color: '#fbbf24', desc: 'Rule-based approval layer' },
    { name: 'Browser Action', color: '#60a5fa', desc: 'Chrome API execution' },
  ];

  const uiStates = ['idle', 'listening', 'processing', 'responding', 'action_pending', 'result', 'error'];
  const stateColors: Record<string, string> = {
    idle: '#475569', listening: '#22d3a6', processing: '#818cf8',
    responding: '#34d399', action_pending: '#fbbf24', result: '#60a5fa', error: '#ef4444',
  };

  const systemOk = !loading && !apiError && health?.status === 'ok';
  const systemLabel = loading ? 'Checking…'
    : apiError ? 'API Unavailable'
    : health?.status === 'ok' ? 'All Systems Operational' : 'Degraded';
  const systemColor = loading ? '#fbbf24' : apiError ? '#ef4444' : systemOk ? '#22d3a6' : '#ef4444';

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#0a0a0f', color: '#e2e8f0', minHeight: '100vh' }}>

      {/* Header */}
      <header style={{
        background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #818cf8, #22d3a6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>🤖</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em' }}>OrbyAI</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: -2 }}>Resident Secretary Backend</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {lastUpdated && <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>Updated {lastUpdated}</span>}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: `${systemColor}18`, border: `1px solid ${systemColor}33`,
            borderRadius: 20, padding: '4px 12px', fontSize: '0.75rem', color: systemColor,
          }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: systemColor, marginRight: 4,
              animation: loading ? 'spin 1s linear infinite' : 'none',
            }} />
            {systemLabel}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem' }}>

        {/* API Error Banner */}
        {apiError && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12, padding: '0.875rem 1.25rem', marginBottom: '1.5rem',
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fca5a5', marginBottom: 2 }}>Health API Unavailable</div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>{apiError}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                Set <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>ELEVENLABS_API_KEY</code> and other env vars in Vercel, then redeploy.
              </div>
            </div>
            <button onClick={fetchHealth} style={{
              marginLeft: 'auto', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6, padding: '4px 10px', fontSize: '0.72rem', color: '#fca5a5', cursor: 'pointer',
            }}>Retry</button>
          </div>
        )}

        {/* Service Health Grid */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>Service Status</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {([
              { key: 'deployAI',       label: 'Deploy AI',          icon: '🧠' },
              { key: 'elevenlabs',     label: 'ElevenLabs STT/TTS', icon: '🎙️' },
              { key: 'elevenlabsAgent',label: 'ElevenLabs Agent',   icon: '🔊' },
              { key: 'supabase',       label: 'Supabase DB',        icon: '🗄️' },
              { key: 'mocks',          label: 'Mock Mode',          icon: '🧪' },
            ] as const).map(({ key, label, icon }) => {
              const active = health?.env?.[key] ?? false;
              const unknown = !health || !!apiError;
              return (
                <Card key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.25rem' }}>{icon}</span>
                    {!unknown && <StatusDot active={active} />}
                    {unknown && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', marginRight: 8 }} />}
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: '0.75rem', color: unknown ? 'rgba(255,255,255,0.3)' : active ? '#22d3a6' : '#ef4444', marginTop: 4 }}>
                    {unknown ? 'Unknown' : key === 'mocks' ? (active ? 'Enabled' : 'Disabled') : active ? 'Connected' : 'Not configured'}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Pipeline */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>Agent Pipeline</h2>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🎤</div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Voice</div>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '1.2rem' }}>→</div>
              {pipeline.map((step, i) => (
                <div key={step.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ padding: '8px 14px', borderRadius: 10, background: `${step.color}18`, border: `1px solid ${step.color}44`, fontSize: '0.8rem', fontWeight: 600, color: step.color, whiteSpace: 'nowrap' }}>
                      {step.name}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: 4, maxWidth: 100 }}>{step.desc}</div>
                  </div>
                  {i < pipeline.length - 1 && <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '1.2rem' }}>→</div>}
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* Bottom grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <section>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>API Endpoints</h2>
            <Card style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {endpoints.map(({ method, path, desc }) => (
                  <div key={path} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: method === 'POST' ? 'rgba(129,140,248,0.2)' : 'rgba(34,211,166,0.2)', color: method === 'POST' ? '#818cf8' : '#22d3a6', flexShrink: 0, marginTop: 1 }}>{method}</span>
                    <div>
                      <code style={{ fontSize: '0.78rem', color: '#e2e8f0' }}>{path}</code>
                      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <section>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>Extension UI States</h2>
            <Card style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {uiStates.map(state => (
                  <div key={state} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: stateColors[state], boxShadow: `0 0 6px ${stateColors[state]}88` }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 500, color: stateColors[state] }}>{state}</span>
                  </div>
                ))}
              </div>
            </Card>
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>⌨️</span>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#818cf8' }}>Extension Hotkey</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)' }}>⌘</kbd>{' + '}
                  <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)' }}>⇧</kbd>{' + '}
                  <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)' }}>Space</kbd>
                  {' — Toggle overlay'}
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' }}>OrbyAI · Resident Secretary v1.0</span>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' }}>Next.js 14 · TypeScript · DeployAI · ElevenLabs · Supabase</span>
        </footer>
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
