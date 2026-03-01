// Conversational chat endpoint for the OrbyAI dashboard
// Maintains a persistent DeployAI session per browser conversation.
// Classifies each message as "chat" (conversational) or "task" (browser action).
// Tasks go through the safety gate; chat responses come back naturally.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callDeployAIInSession } from '@/lib/deployai';
import { validateAction, sanitizeAction } from '@/lib/safety';
import { logAgentAction } from '@/lib/supabase';
import { BrowserAction } from '@/types';

// ── System prompt injected once when the session is created ─────────────────
const SYSTEM_PROMPT = `You are Orby, an AI assistant built into OrbyAI Resident Secretary — a browser automation tool.

CRITICAL: respond with ONLY valid JSON for every message. No markdown, no backticks, no extra text.

For conversations (greetings, questions, general chat):
{"type":"chat","response":"your natural reply"}

For browser tasks (fill, click, navigate, open, scroll, copy, inject):
{"type":"task","response":"brief description of what you are doing","action":{"type":"ACTION_TYPE","selector":"css selector","value":"text","url":"https://...","text":"clipboard text"},"requiresApproval":false,"actionDescription":"human-readable description"}

ACTION_TYPES: fill_field | click | copy_clipboard | inject_overlay | navigate | open_tab | scroll_to

RULES:
- Greetings, questions, opinions, general chat → type: "chat"
- Any browser interaction request → type: "task" — include action immediately, no hedging
- Be DIRECT. Never say "I'd be happy to", "Certainly!", "Of course!", or "I can help with that"
- requiresApproval: true ONLY for: form submissions, sending emails, deleting content, purchases
- Omit action fields that are not relevant to the action type
- For tasks: response field is 1 short sentence describing what you just did / will do`;

// ── Request schema ────────────────────────────────────────────────────────────
const ChatSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
  chatId: z.string().optional(), // DeployAI chat thread — returned by prior calls
});

type ParsedResponse = {
  type: 'chat' | 'task';
  response: string;
  action?: Record<string, string | undefined>;
  requiresApproval?: boolean;
  actionDescription?: string;
};

// ── Mock responses (USE_MOCKS=true) ──────────────────────────────────────────
function mockResponse(message: string, chatId: string, sessionId: string) {
  const m = message.toLowerCase();
  const taskWords = ['click', 'fill', 'navigate', 'open', 'scroll', 'type', 'submit', 'go to', 'copy'];
  const isTask = taskWords.some(w => m.includes(w));

  if (!isTask) {
    const replies: Record<string, string> = {
      hello: "Hey! What would you like me to do?",
      hi: "Hi! Need me to automate something?",
      'how are you': "Running at full capacity. What can I do for you?",
      'what can you do': "I can fill forms, click elements, navigate pages, copy text, open tabs, scroll, and inject overlays — just tell me what you need.",
    };
    const reply = replies[m] || `Understood. What would you like me to do?`;
    return { type: 'chat' as const, response: reply, chatId, sessionId };
  }

  if (m.includes('fill') || m.includes('type')) {
    return {
      type: 'task' as const,
      response: "Filling in the field now.",
      action: { type: 'fill_field', selector: 'input:first-of-type', value: 'example value' },
      requiresApproval: false,
      actionDescription: 'Fill the first input field with \'example value\'',
      chatId, sessionId,
    };
  }
  if (m.includes('navigate') || m.includes('go to')) {
    const urlMatch = message.match(/https?:\/\/\S+/);
    const url = urlMatch?.[0] || 'https://google.com';
    return {
      type: 'task' as const,
      response: `Navigating to ${url}.`,
      action: { type: 'navigate', url },
      requiresApproval: false,
      actionDescription: `Navigate to ${url}`,
      chatId, sessionId,
    };
  }
  if (m.includes('click') || m.includes('submit')) {
    return {
      type: 'task' as const,
      response: 'Clicking the button — needs your approval first.',
      action: { type: 'click', selector: 'button[type="submit"]' },
      requiresApproval: true,
      actionDescription: 'Click the submit button',
      chatId, sessionId,
    };
  }
  if (m.includes('copy')) {
    return {
      type: 'task' as const,
      response: 'Copied to clipboard.',
      action: { type: 'copy_clipboard', text: 'Copied content from the page' },
      requiresApproval: false,
      actionDescription: 'Copy text to clipboard',
      chatId, sessionId,
    };
  }
  return {
    type: 'task' as const,
    response: 'Executing that action.',
    action: { type: 'scroll_to', selector: 'body' },
    requiresApproval: false,
    actionDescription: 'Scroll to top of page',
    chatId, sessionId,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const USE_MOCKS = process.env.USE_MOCKS === 'true';

  try {
    const body = await req.json();
    const { message, sessionId, chatId } = ChatSchema.parse(body);
    const sId = sessionId || `chat-${Date.now()}`;
    const start = Date.now();

    // ── Mock mode ──────────────────────────────────────────────────────────
    if (USE_MOCKS) {
      const mockChatId = chatId || `mock-${Date.now()}`;
      return NextResponse.json(mockResponse(message, mockChatId, sId));
    }

    // ── Real mode: call DeployAI with persistent session ───────────────────
    const { response: raw, chatId: newChatId } = await callDeployAIInSession(
      message,
      chatId,
      !chatId ? SYSTEM_PROMPT : undefined  // inject system prompt only on first message
    );

    // ── Parse response ────────────────────────────────────────────────────
    let parsed: ParsedResponse;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const candidate = JSON.parse(jsonMatch?.[0] || raw) as ParsedResponse;
      parsed = {
        type: candidate.type === 'task' ? 'task' : 'chat',
        response: candidate.response || raw,
        action: candidate.action,
        requiresApproval: candidate.requiresApproval ?? false,
        actionDescription: candidate.actionDescription,
      };
    } catch {
      // AI didn't return JSON — treat as conversational reply
      parsed = { type: 'chat', response: raw };
    }

    // ── Safety gate for task actions ──────────────────────────────────────
    if (parsed.type === 'task' && parsed.action) {
      const safetyResult = validateAction(parsed.action as unknown as BrowserAction);
      parsed.action = sanitizeAction(parsed.action as unknown as BrowserAction) as unknown as Record<string, string | undefined>;
      if (safetyResult.requiresApproval) parsed.requiresApproval = true;
      if (!safetyResult.safe) {
        parsed.actionDescription = `⚠️ ${safetyResult.reason}${parsed.actionDescription ? ': ' + parsed.actionDescription : ''}`;
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await logAgentAction({
      sessionId: sId,
      agentName: 'orby_chat',
      input: { message, existingChatId: chatId || null },
      output: parsed as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    });

    return NextResponse.json({ ...parsed, chatId: newChatId, sessionId: sId });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    console.error('[/api/chat]', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
