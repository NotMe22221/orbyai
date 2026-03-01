import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { coordinate } from '@/lib/coordinator';
import { runAgentA } from '@/lib/agentA';
import { runAgentB } from '@/lib/agentB';
import { logAgentAction } from '@/lib/supabase';
import { validateAction, sanitizeAction } from '@/lib/safety';
import { VoiceRequest, VoiceResponse } from '@/types';

const VoiceRequestSchema = z.object({
  sessionId: z.string().min(1),
  transcript: z.string().min(1),
  pageContext: z.object({
    url: z.string(),
    title: z.string(),
    pageType: z.enum(['github', 'gmail', 'notion', 'linear', 'generic']),
    selectedText: z.string().optional(),
    bodyText: z.string().optional(),
  }),
  vapiRecording: z.string().nullable().optional(),
  screenshotBase64: z.string().nullable().optional(), // base64 PNG for vision
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = VoiceRequestSchema.parse(body);
    const request: VoiceRequest = validated;

    // Step 1: Coordinator routing (<10ms, no LLM)
    coordinate(request);

    await logAgentAction({
      sessionId: request.sessionId,
      agentName: 'coordinator',
      input: {
        transcript: request.transcript,
        pageType: request.pageContext.pageType,
        hasScreenshot: !!request.screenshotBase64,
      },
      output: {},
      timestamp: new Date().toISOString(),
      durationMs: 0,
    });

    // Step 2: Agent A — Voice Concierge
    const startA = Date.now();
    const agentAResult = await runAgentA(request);
    await logAgentAction({
      sessionId: request.sessionId,
      agentName: 'agent_a',
      input: { transcript: request.transcript },
      output: agentAResult as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startA,
    });

    if (agentAResult.route === 'agent_a_only') {
      return NextResponse.json({
        sessionId: request.sessionId,
        responseText: agentAResult.responseText || '',
        requiresApproval: false,
      } satisfies VoiceResponse);
    }

    // Step 3: Agent B — Workspace Executor (screenshot + recordingId chained)
    const requestWithContext: VoiceRequest = {
      ...request,
      vapiRecording: agentAResult.vapiRecording ?? request.vapiRecording,
    };

    const startB = Date.now();
    const agentBResult = await runAgentB(requestWithContext, agentAResult);
    await logAgentAction({
      sessionId: request.sessionId,
      agentName: 'agent_b',
      input: {
        intent: agentAResult.intent,
        recordingChained: !!requestWithContext.vapiRecording,
        hasScreenshot: !!requestWithContext.screenshotBase64,
      },
      output: agentBResult as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startB,
    });

    // Step 4: Safety gate
    let finalAction = agentBResult.action;
    let requiresApproval = agentBResult.requiresApproval;
    let actionDescription = agentBResult.actionDescription;

    if (finalAction) {
      const safetyResult = validateAction(finalAction);
      finalAction = sanitizeAction(finalAction);
      if (safetyResult.requiresApproval) requiresApproval = true;
      if (!safetyResult.safe) {
        actionDescription = `⚠️ ${safetyResult.reason}`;
      }
      await logAgentAction({
        sessionId: request.sessionId,
        agentName: 'safety_gate',
        input: { actionType: finalAction.type },
        output: safetyResult as unknown as Record<string, unknown>,
        timestamp: new Date().toISOString(),
        durationMs: 0,
      });
    }

    return NextResponse.json({
      sessionId: request.sessionId,
      responseText: agentBResult.responseText,
      action: finalAction,
      requiresApproval,
      actionDescription,
    } satisfies VoiceResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    console.error('[/api/voice]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
