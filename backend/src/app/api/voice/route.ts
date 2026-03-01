import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { coordinate } from '@/lib/coordinator';
import { runAgentA } from '@/lib/agentA';
import { runAgentB } from '@/lib/agentB';
import { logAgentAction } from '@/lib/supabase';
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
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = VoiceRequestSchema.parse(body);
    const request: VoiceRequest = validated;

    // Step 1: Coordinator routing (<10ms, no LLM)
    coordinate(request); // determines route for logging

    await logAgentAction({
      sessionId: request.sessionId,
      agentName: 'coordinator',
      input: { transcript: request.transcript, pageType: request.pageContext.pageType },
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

    // If agent A handles it alone, return early
    if (agentAResult.route === 'agent_a_only') {
      const response: VoiceResponse = {
        sessionId: request.sessionId,
        responseText: agentAResult.responseText || '',
        requiresApproval: false,
      };
      return NextResponse.json(response);
    }

    // Step 3: Agent B — Workspace Executor (Vapi recording chained)
    const requestWithRecording: VoiceRequest = {
      ...request,
      vapiRecording: agentAResult.vapiRecording ?? request.vapiRecording,
    };

    const startB = Date.now();
    const agentBResult = await runAgentB(requestWithRecording, agentAResult);
    await logAgentAction({
      sessionId: request.sessionId,
      agentName: 'agent_b',
      input: {
        intent: agentAResult.intent,
        vapiRecording: !!requestWithRecording.vapiRecording,
      },
      output: agentBResult as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startB,
    });

    const response: VoiceResponse = {
      sessionId: request.sessionId,
      responseText: agentBResult.responseText,
      action: agentBResult.action,
      requiresApproval: agentBResult.requiresApproval,
      actionDescription: agentBResult.actionDescription,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
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
