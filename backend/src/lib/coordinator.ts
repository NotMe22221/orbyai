import { VoiceRequest, AgentRoute } from '@/types';

// Deterministic router — no LLM, <10ms routing
export function coordinate(request: VoiceRequest): AgentRoute {
  const transcript = request.transcript.toLowerCase();

  const browserActionKeywords = [
    'click', 'fill', 'submit', 'navigate', 'open', 'go to', 'scroll',
    'type', 'enter', 'select', 'copy', 'paste', 'search', 'find'
  ];

  const complexKeywords = [
    'draft', 'write', 'compose', 'summarize', 'analyze', 'explain',
    'create', 'generate', 'review', 'compare', 'suggest'
  ];

  const hasBrowserAction = browserActionKeywords.some(k => transcript.includes(k));
  const isComplex = complexKeywords.some(k => transcript.includes(k));

  if (hasBrowserAction || isComplex) return 'agent_a_then_b';
  return 'agent_a_only';
}
