// Returns a signed WebSocket URL for ElevenLabs Conversational Agent
// Used by the extension to initiate a real-time voice session
import { NextResponse } from 'next/server';
import { getConversationalAgentSignedUrl } from '@/lib/elevenlabs';

export async function GET() {
  try {
    const USE_MOCKS = process.env.USE_MOCKS === 'true';
    if (USE_MOCKS) {
      return NextResponse.json({ signedUrl: null, agentId: 'mock_agent', mock: true });
    }
    const signedUrl = await getConversationalAgentSignedUrl();
    return NextResponse.json({ signedUrl, agentId: process.env.ELEVENLABS_AGENT_ID });
  } catch (error) {
    console.error('[/api/agent-url]', error);
    return NextResponse.json({ error: 'Failed to get agent URL' }, { status: 500 });
  }
}
