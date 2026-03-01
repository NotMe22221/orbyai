// Health check endpoint — used by Vercel to verify deployment
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'resident-secretary-api',
    timestamp: new Date().toISOString(),
    env: {
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      elevenlabsAgent: !!process.env.ELEVENLABS_AGENT_ID,
      deployAI: !!process.env.CLIENT_ID,
      supabase: !!process.env.SUPABASE_URL,
      mocks: process.env.USE_MOCKS === 'true',
    },
  });
}
