// Conversational chat endpoint — uses OpenAI GPT-4o
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateAction, sanitizeAction } from '@/lib/safety';
import { logAgentAction } from '@/lib/supabase';
import { BrowserAction } from '@/types';

const SYSTEM_PROMPT = `You are Orby, an AI assistant built into OrbyAI Resident Secretary — a browser automation tool.

CRITICAL: respond with ONLY valid JSON. No markdown, no backticks, no extra text.

For conversations (greetings, questions, general chat):
{"type":"chat","response":"your natural reply"}

For browser tasks (fill, click, navigate, open, scroll, copy, inject):
{"type":"task","response":"brief description","action":{"type":"ACTION_TYPE","selector":"css selector","value":"text","url":"https://...","text":"clipboard text"},"requiresApproval":false,"actionDescription":"human-readable description"}

ACTION_TYPES: fill_field | click | copy_clipboard | inject_overlay | navigate | open_tab | scroll_to

RULES:
- Greetings, questions, opinions, general chat → type: "chat"
- Any browser interaction request → type: "task" with action immediately, no hedging
- Be DIRECT. Never say "I'd be happy to", "Certainly!", or "Of course!"
- requiresApproval: true ONLY for: form submissions, sending emails, deleting content, purchases
- Omit action fields not relevant to the action type`;

const ChatSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
  chatId: z.string().optional(),
});

type ParsedResponse = {
  type: 'chat' | 'task';
  response: string;
  action?: Record<string, string | undefined>;
  requiresApproval?: boolean;
  actionDescription?: string;
};

const conversations = new Map<string, { role: 'user' | 'assistant'; content: string }[]>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, sessionId, chatId } = ChatSchema.parse(body);
    const sId = sessionId || `chat-${Date.now()}`;
    const cId = chatId || `orby-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const start = Date.now();

    if (process.env.USE_MOCKS === 'true') {
      const m = message.toLowerCase();
      const isTask = ['click','fill','navigate','open','scroll','type','submit','go to','copy'].some(w => m.includes(w));
      if (!isTask) {
        const replies: Record<string, string> = {
          'what can you do': "I can fill forms, click elements, navigate pages, copy text, open tabs, scroll, and inject overlays.",
          'hello': "Hey! What would you like me to do?",
          'hi': "Hi! Need me to automate something?",
        };
        return NextResponse.json({ type: 'chat', response: replies[m] || "What would you like me to do?", chatId: cId, sessionId: sId });
      }
      if (m.includes('navigate') || m.includes('go to')) {
        const url = message.match(/https?:\/\/\S+/)?.[0] || 'https://google.com';
        return NextResponse.json({ type: 'task', response: `Navigating to ${url}.`, action: { type: 'navigate', url }, requiresApproval: false, actionDescription: `Navigate to ${url}`, chatId: cId, sessionId: sId });
      }
      return NextResponse.json({ type: 'task', response: 'Executing that action.', action: { type: 'scroll_to', selector: 'body' }, requiresApproval: false, actionDescription: 'Scroll to top', chatId: cId, sessionId: sId });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    if (!conversations.has(cId)) conversations.set(cId, []);
    const history = conversations.get(cId)!;
    history.push({ role: 'user', content: message });

    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history.slice(-20)],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!oaiRes.ok) throw new Error(`OpenAI error ${oaiRes.status}: ${await oaiRes.text()}`);

    const oaiData = await oaiRes.json() as { choices: { message: { content: string } }[] };
    const raw = oaiData.choices[0]?.message?.content || '';
    history.push({ role: 'assistant', content: raw });

    let parsed: ParsedResponse;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const candidate = JSON.parse(jsonMatch?.[0] || raw) as ParsedResponse;
      parsed = { type: candidate.type === 'task' ? 'task' : 'chat', response: candidate.response || raw, action: candidate.action, requiresApproval: candidate.requiresApproval ?? false, actionDescription: candidate.actionDescription };
    } catch {
      parsed = { type: 'chat', response: raw };
    }

    if (parsed.type === 'task' && parsed.action) {
      const safetyResult = validateAction(parsed.action as unknown as BrowserAction);
      parsed.action = sanitizeAction(parsed.action as unknown as BrowserAction) as unknown as Record<string, string | undefined>;
      if (safetyResult.requiresApproval) parsed.requiresApproval = true;
      if (!safetyResult.safe) parsed.actionDescription = `⚠️ ${safetyResult.reason}`;
    }

    await logAgentAction({ sessionId: sId, agentName: 'orby_chat', input: { message }, output: parsed as unknown as Record<string, unknown>, timestamp: new Date().toISOString(), durationMs: Date.now() - start });

    return NextResponse.json({ ...parsed, chatId: cId, sessionId: sId });

  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    console.error('[/api/chat]', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
