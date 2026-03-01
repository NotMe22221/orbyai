import { VoiceRequest, AgentAResponse, AgentBResponse } from '@/types';
import { callDeployAI } from './deployai';

const MOCK_MODE = process.env.USE_MOCKS === 'true';

export async function runAgentB(
  request: VoiceRequest,
  agentAResult: AgentAResponse
): Promise<AgentBResponse> {
  if (MOCK_MODE) return getMockAgentBResponse(request, agentAResult);

  const startTime = Date.now();
  const extendedThinking = agentAResult.complexity === 'high';

  const prompt = `You are a Workspace Executor AI. Generate precise browser action payloads.
${extendedThinking ? 'Use extended reasoning for this complex task.\n' : ''}
Page:
- URL: ${request.pageContext.url}
- Type: ${request.pageContext.pageType}
- Title: ${request.pageContext.title}

User intent: ${agentAResult.intent}
Original command: "${request.transcript}"
Vapi recording chained: ${agentAResult.vapiRecording ? 'yes' : 'no'}
Selected text: ${request.pageContext.selectedText || 'none'}
Page sample: ${request.pageContext.bodyText?.slice(0, 800) || 'N/A'}

Page-specific selectors:
- GitHub: data-testid, aria-labels
- Gmail: aria-labels
- Notion: block selectors
- Linear: component identifiers

Respond with ONLY valid JSON:
{
  "action": {
    "type": "fill_field"|"click"|"copy_clipboard"|"inject_overlay"|"navigate"|"open_tab"|"scroll_to",
    "selector": "CSS selector",
    "value": "text value",
    "text": "clipboard text",
    "html": "injected html",
    "url": "target url"
  },
  "requiresApproval": true|false,
  "actionDescription": "human-readable description",
  "responseText": "conversational reply",
  "reasoning": "brief explanation"
}

Safety: requiresApproval=true for submissions/deletions/sends. Omit action if not needed.`;

  try {
    const raw = await callDeployAI(prompt);
    const parsed = parseJSON<AgentBResponse>(raw);
    console.log(`[AgentB] ${Date.now() - startTime}ms | action: ${parsed.action?.type || 'none'}`);
    return parsed;
  } catch (error) {
    console.error('[AgentB] Error:', error);
    throw error;
  }
}

function parseJSON<T>(raw: string): T {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]) as T;
  throw new Error('No JSON found in response');
}

function getMockAgentBResponse(request: VoiceRequest, _agentA: AgentAResponse): AgentBResponse {
  const t = request.transcript.toLowerCase();
  if (t.includes('fill') || t.includes('type')) {
    return {
      action: { type: 'fill_field', selector: 'input:first-of-type', value: 'example value' },
      requiresApproval: false,
      actionDescription: 'Fill the first input field',
      responseText: "I'll fill in that field for you.",
    };
  }
  if (t.includes('click') || t.includes('submit')) {
    return {
      action: { type: 'click', selector: 'button[type="submit"]' },
      requiresApproval: true,
      actionDescription: 'Click the submit button — requires approval',
      responseText: 'Ready to click submit. Please approve.',
    };
  }
  if (t.includes('navigate') || t.includes('go to')) {
    const urlMatch = request.transcript.match(/https?:\/\/\S+/);
    return {
      action: { type: 'navigate', url: urlMatch?.[0] || 'https://google.com' },
      requiresApproval: false,
      actionDescription: `Navigate to ${urlMatch?.[0] || 'google.com'}`,
      responseText: `Navigating now.`,
    };
  }
  return {
    requiresApproval: false,
    responseText: `Processing: "${request.transcript}"`,
  };
}
