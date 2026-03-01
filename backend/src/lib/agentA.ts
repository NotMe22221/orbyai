import { VoiceRequest, AgentAResponse } from '@/types';
import { callDeployAI } from './deployai';

const MOCK_MODE = process.env.USE_MOCKS === 'true';

export async function runAgentA(request: VoiceRequest): Promise<AgentAResponse> {
  if (MOCK_MODE) return getMockAgentAResponse(request);

  const startTime = Date.now();
  const prompt = `You are a Voice Concierge AI. Analyze this voice command and classify intent.

Page context:
- URL: ${request.pageContext.url}
- Type: ${request.pageContext.pageType}
- Title: ${request.pageContext.title}

User command: "${request.transcript}"
Vapi recording: ${request.vapiRecording ? 'yes' : 'no'}

Respond with ONLY valid JSON:
{
  "intent": "brief description",
  "complexity": "low" | "medium" | "high",
  "confidence": 0.0-1.0,
  "route": "agent_a_only" | "agent_a_then_b",
  "responseText": "conversational reply (only if route is agent_a_only)"
}

Rules:
- agent_a_only: simple Q&A, greetings, info
- agent_a_then_b: any browser actions or complex tasks
- high complexity triggers extended reasoning`;

  try {
    const raw = await callDeployAI(prompt);
    const parsed = parseJSON<AgentAResponse>(raw);
    console.log(`[AgentA] ${Date.now() - startTime}ms | intent: ${parsed.intent}`);
    return { ...parsed, vapiRecording: request.vapiRecording };
  } catch (error) {
    console.error('[AgentA] Error:', error);
    throw error;
  }
}

function parseJSON<T>(raw: string): T {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]) as T;
  throw new Error('No JSON found in response');
}

function getMockAgentAResponse(request: VoiceRequest): AgentAResponse {
  const t = request.transcript.toLowerCase();
  const actionWords = ['click', 'fill', 'navigate', 'open', 'scroll', 'type', 'submit'];
  const needsAction = actionWords.some(w => t.includes(w));

  if (needsAction) {
    return {
      intent: 'browser_action',
      complexity: 'medium',
      confidence: 0.95,
      route: 'agent_a_then_b',
      vapiRecording: request.vapiRecording,
    };
  }
  return {
    intent: 'information_request',
    complexity: 'low',
    confidence: 0.9,
    route: 'agent_a_only',
    responseText: `I understood: "${request.transcript}". How can I help?`,
    vapiRecording: request.vapiRecording,
  };
}
