// ElevenLabs STT endpoint
// Receives raw audio from extension, returns transcript + recordingId
import { NextRequest, NextResponse } from 'next/server';
import { transcribeSpeech } from '@/lib/elevenlabs';

export async function POST(req: NextRequest) {
  try {
    const { audioBase64, mimeType } = await req.json();
    if (!audioBase64) return NextResponse.json({ error: 'Missing audioBase64' }, { status: 400 });

    // Convert base64 to Blob
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const audioBlob = new Blob([bytes], { type: mimeType || 'audio/webm' });

    const USE_MOCKS = process.env.USE_MOCKS === 'true';
    if (USE_MOCKS) {
      return NextResponse.json({
        transcript: 'Mock transcript: click the submit button',
        recordingId: `el_rec_mock_${Date.now()}`,
      });
    }

    const result = await transcribeSpeech({ audioBlob });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/transcribe]', error);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
