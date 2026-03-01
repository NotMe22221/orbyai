// ElevenLabs TTS endpoint
// Receives text, returns base64 audio for playback in extension
import { NextRequest, NextResponse } from 'next/server';
import { synthesizeSpeechBase64 } from '@/lib/elevenlabs';

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId } = await req.json();
    if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 });

    const USE_MOCKS = process.env.USE_MOCKS === 'true';
    if (USE_MOCKS) {
      // Return empty audio in mock mode — extension handles gracefully
      return NextResponse.json({ audioBase64: '', mock: true });
    }

    const audioBase64 = await synthesizeSpeechBase64({ text, voiceId });
    return NextResponse.json({ audioBase64 });
  } catch (error) {
    console.error('[/api/tts]', error);
    return NextResponse.json({ error: 'TTS failed' }, { status: 500 });
  }
}
