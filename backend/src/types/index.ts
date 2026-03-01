export type UIState = 'idle' | 'listening' | 'processing' | 'responding' | 'action_pending' | 'result' | 'error';
export type PageType = 'github' | 'gmail' | 'notion' | 'linear' | 'generic';
export type ActionType = 'fill_field' | 'click' | 'copy_clipboard' | 'inject_overlay' | 'navigate' | 'open_tab' | 'scroll_to';
export type AgentRoute = 'agent_a_only' | 'agent_a_then_b';

export interface PageContext {
  url: string;
  title: string;
  pageType: PageType;
  selectedText?: string;
  bodyText?: string;
}

export interface VoiceRequest {
  sessionId: string;
  transcript: string;
  pageContext: PageContext;
  vapiRecording?: string | null;
}

export interface BrowserAction {
  type: ActionType;
  selector?: string;
  value?: string;
  text?: string;
  html?: string;
  url?: string;
  x?: number;
  y?: number;
}

export interface AgentAResponse {
  intent: string;
  complexity: 'low' | 'medium' | 'high';
  confidence: number;
  route: AgentRoute;
  responseText?: string;
  vapiRecording?: string | null;
}

export interface AgentBResponse {
  action?: BrowserAction;
  requiresApproval: boolean;
  actionDescription?: string;
  responseText: string;
  reasoning?: string;
}

export interface VoiceResponse {
  sessionId: string;
  responseText: string;
  action?: BrowserAction;
  requiresApproval: boolean;
  actionDescription?: string;
  error?: string;
}

export interface AgentLogEntry {
  sessionId: string;
  agentName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: string;
  durationMs: number;
}
