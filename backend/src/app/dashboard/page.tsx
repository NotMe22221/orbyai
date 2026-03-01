'use client';
import { useEffect, useState, useRef, useCallback } from 'react';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0a0f',
  surface: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  text: '#e2e8f0',
  muted: 'rgba(255,255,255,0.4)',
  dim: 'rgba(255,255,255,0.22)',
  accent: '#818cf8',
  green: '#22d3a6',
  pink: '#f472b6',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  red: '#ef4444',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'chat' | 'task';
  action?: Record<string, string | undefined>;
  requiresApproval?: boolean;
  actionDescription?: string;
  timestamp: number;
}

interface HealthEnv {
  elevenlabs: boolean;
  elevenlabsAgent: boolean;
  deployAI: boolean;
  supabase: boolean;
  mocks: boolean;
}

interface HealthData {
  status: string;
  env: HealthEnv;
}

// ── StatusDot ─────────────────────────────────────────────────────────────────
function StatusDot({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7,
      borderRadius: '50%', flexShrink: 0,
      background: active ? C.green : C.red,
      boxShadow: active ? `0 0 5px ${C.green}88` : `0 0 5px ${C.red}88`,
    }} />
  );
}

// ── ActionCard ────────────────────────────────────────────────────────────────
function ActionCard({
  action, description, requiresApproval,
}: {
  action: Record<string, string | undefined>;
  description?: string;
  requiresApproval?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify(action, null, 2))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <div style={{
      padding: '10px 12px',
      background: 'rgba(34,211,166,0.05)',
      border: '1px solid rgba(34,211,166,0.2)',
      borderRadius: 10, fontSize: '0.8rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.green, fontWeight: 600 }}>
          <span>⚡</span>
          <span>action: {action.type}</span>
        </div>
        <button
          onClick={copy}
          style={{
            background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 5, padding: '2px 8px',
            fontSize: '0.63rem', color: copied ? C.green : C.dim,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}
        >
          {copied ? '✓ copied' : 'copy json'}
        </button>
      </div>
      {description && (
        <div style={{ color: C.muted, marginBottom: 8, fontSize: '0.73rem', lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      <div style={{
        background: 'rgba(0,0,0,0.35)', borderRadius: 6,
        padding: '8px 10px', fontFamily: 'monospace',
        fontSize: '0.71rem', color: '#94a3b8', lineHeight: 1.75,
      }}>
        {Object.entries(action)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => (
            <div key={k}>
              <span style={{ color: C.accent }}>{k}</span>
              <span style={{ color: C.dim }}>: </span>
              <span style={{ color: C.green }}>{v}</span>
            </div>
          ))}
      </div>
      <div style={{ marginTop: 8, fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 5 }}>
        {requiresApproval ? (
          <span style={{ color: C.yellow }}>⚠️ Requires approval before executing in extension</span>
        ) : (
          <span style={{ color: C.green }}>✓ Safe to auto-execute</span>
        )}
      </div>
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      gap: 8, alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2,
          background: 'linear-gradient(135deg, #818cf8, #22d3a6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
        }}>🤖</div>
      )}
      <div style={{ maxWidth: '68%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          padding: '10px 14px', lineHeight: 1.65, fontSize: '0.875rem',
          background: isUser
            ? 'linear-gradient(135deg, rgba(129,140,248,0.2), rgba(129,140,248,0.1))'
            : C.surface,
          border: `1px solid ${isUser ? 'rgba(129,140,248,0.3)' : C.border}`,
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          color: C.text,
        }}>
          {!isUser && message.type === 'task' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'rgba(34,211,166,0.1)', border: '1px solid rgba(34,211,166,0.2)',
              borderRadius: 4, padding: '1px 7px',
              fontSize: '0.63rem', color: C.green,
              marginBottom: 6, marginRight: 6,
            }}>⚡ task</span>
          )}
          {message.content}
        </div>
        {message.type === 'task' && message.action && (
          <ActionCard
            action={message.action}
            description={message.actionDescription}
            requiresApproval={message.requiresApproval}
          />
        )}
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hey! I'm Orby. Ask me anything — or tell me what to do and I'll do it.",
      type: 'chat',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | undefined>();
  const [sessionId] = useState(() => `dashboard-${Date.now()}`);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Health polling
  useEffect(() => {
    const poll = () =>
      fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const addMsg = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(p => [
      ...p,
      {
        ...msg,
        id: `${msg.role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const sendMessage = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    if (!override) setInput('');

    addMsg({ role: 'user', content: text, type: 'chat' });
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId, chatId }),
      });
      const data = await res.json();
      if (data.chatId) setChatId(data.chatId);

      addMsg({
        role: 'assistant',
        content: data.response || data.error || 'Something went wrong.',
        type: data.type || 'chat',
        action: data.action,
        requiresApproval: data.requiresApproval,
        actionDescription: data.actionDescription,
      });
    } catch {
      addMsg({ role: 'assistant', content: 'Connection error. Please try again.', type: 'chat' });
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, sessionId, chatId, addMsg]);

  // ── Static data ─────────────────────────────────────────────────────────
  const services: { key: keyof HealthEnv; label: string; icon: string }[] = [
    { key: 'deployAI', label: 'Deploy AI', icon: '🧠' },
    { key: 'elevenlabs', label: 'ElevenLabs', icon: '🎙️' },
    { key: 'supabase', label: 'Supabase', icon: '🗄️' },
    { key: 'mocks', label: 'Mocks', icon: '🧪' },
  ];

  const pipeline = [
    { name: 'Coordinator', color: C.accent, desc: '< 10ms routing' },
    { name: 'Agent A', color: C.green, desc: 'Intent classifier' },
    { name: 'Agent B', color: C.pink, desc: 'Action executor' },
    { name: 'Safety Gate', color: C.yellow, desc: 'Approval layer' },
  ];

  const suggestions = [
    'What can you do?',
    'Navigate to github.com',
    'Fill the first input with "Hello World"',
    'Click the submit button',
  ];

  const isOnlyWelcome = messages.length === 1;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      background: C.bg, color: C.text,
      height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{
        background: 'rgba(255,255,255,0.02)',
        borderBottom: `1px solid ${C.border}`,
        padding: '0.6rem 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #818cf8, #22d3a6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>🤖</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', letterSpacing: '-0.02em' }}>OrbyAI</div>
            <div style={{ fontSize: '0.63rem', color: C.muted }}>Resident Secretary</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {services.map(({ key, label, icon }) => (
            <div key={key} title={label} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 20, padding: '3px 9px', fontSize: '0.68rem',
            }}>
              <span style={{ fontSize: '0.78rem' }}>{icon}</span>
              <StatusDot active={health?.env[key] ?? false} />
              <span style={{ color: C.muted }}>{label}</span>
            </div>
          ))}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: health?.status === 'ok' ? 'rgba(34,211,166,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${health?.status === 'ok' ? 'rgba(34,211,166,0.2)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: 20, padding: '3px 9px', fontSize: '0.68rem',
          }}>
            <StatusDot active={health?.status === 'ok'} />
            <span style={{ color: health?.status === 'ok' ? C.green : C.red }}>
              {health ? (health.status === 'ok' ? 'Live' : 'Offline') : '...'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside style={{
          width: 220, flexShrink: 0,
          borderRight: `1px solid ${C.border}`,
          overflowY: 'auto', padding: '1rem 0.875rem',
          display: 'flex', flexDirection: 'column', gap: '1.25rem',
        }}>

          {/* Pipeline */}
          <div>
            <div style={{
              fontSize: '0.58rem', fontWeight: 700, color: C.dim,
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem',
            }}>Pipeline</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {pipeline.map((step, i, arr) => (
                <div key={step.name}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 8px', borderRadius: 7,
                    background: `${step.color}10`, border: `1px solid ${step.color}22`,
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: step.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: step.color }}>{step.name}</div>
                      <div style={{ fontSize: '0.58rem', color: C.dim }}>{step.desc}</div>
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ width: 1, height: 6, background: C.border, marginLeft: 13 }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action types */}
          <div>
            <div style={{
              fontSize: '0.58rem', fontWeight: 700, color: C.dim,
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem',
            }}>Action Types</div>
            {['fill_field', 'click', 'navigate', 'open_tab', 'scroll_to', 'copy_clipboard', 'inject_overlay'].map(a => (
              <div key={a} style={{
                padding: '3px 0', fontSize: '0.68rem',
                borderBottom: `1px solid ${C.border}`,
                fontFamily: 'monospace', color: C.blue,
              }}>{a}</div>
            ))}
          </div>

          {/* Hotkey */}
          <div style={{
            padding: '8px', background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 8,
            fontSize: '0.68rem', color: C.muted, lineHeight: 1.7,
          }}>
            <div style={{ color: C.accent, fontWeight: 600, marginBottom: 3 }}>Extension Hotkey</div>
            <kbd style={{
              background: 'rgba(255,255,255,0.08)', padding: '1px 5px',
              borderRadius: 3, border: `1px solid ${C.border}`, color: C.text,
            }}>⌘⇧Space</kbd>
            {' '}toggles overlay
          </div>
        </aside>

        {/* ── Chat ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '1.25rem 1.5rem',
            display: 'flex', flexDirection: 'column', gap: '1rem',
          }}>
            {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg, #818cf8, #22d3a6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                }}>🤖</div>
                <div style={{
                  padding: '10px 14px',
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: '12px 12px 12px 4px',
                  display: 'flex', gap: 4, alignItems: 'center',
                }}>
                  {[0, 0.18, 0.36].map((delay, i) => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: '50%', background: C.accent,
                      animation: `orby-bounce 0.9s ease-in-out ${delay}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestion chips — shown only on empty state */}
          {isOnlyWelcome && !loading && (
            <div style={{ padding: '0 1.5rem 0.75rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  style={{
                    padding: '5px 12px',
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 20, fontSize: '0.73rem', color: C.muted,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    const t = e.currentTarget;
                    t.style.borderColor = C.accent;
                    t.style.color = C.text;
                  }}
                  onMouseLeave={e => {
                    const t = e.currentTarget;
                    t.style.borderColor = C.border;
                    t.style.color = C.muted;
                  }}
                >{s}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '0.875rem 1.5rem',
            borderTop: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,0.01)',
            flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: '0.6rem 0.75rem',
            }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                placeholder="Ask something or give a command..."
                disabled={loading}
                autoFocus
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: C.text, fontSize: '0.875rem', fontFamily: 'inherit',
                  opacity: loading ? 0.5 : 1,
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none', flexShrink: 0,
                  background: input.trim() && !loading ? C.accent : 'rgba(255,255,255,0.07)',
                  color: input.trim() && !loading ? '#fff' : C.muted,
                  cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                  fontSize: '1.1rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s', fontFamily: 'inherit',
                }}
              >↑</button>
            </div>
            <p style={{
              margin: '0.35rem 0 0', fontSize: '0.62rem',
              color: C.dim, textAlign: 'center',
            }}>
              Orby responds conversationally — tasks execute only when you ask for them
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes orby-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40%            { transform: translateY(-5px); opacity: 1; }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
