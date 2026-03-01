// ElevenLabs TTS integration
// TASK-1052: Voice synthesis for agent responses

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export interface TTSOptions {
  text: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

export async function synthesizeSpeech(options: TTSOptions): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const voiceId = options.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? 'Rachel';
  const modelId = options.modelId ?? 'eleven_turbo_v2';

  const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: options.text,
      model_id: modelId,
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error ${response.status}: ${err}`);
  }

  return await response.arrayBuffer();
}

export async function synthesizeSpeechBase64(options: TTSOptions): Promise<string> {
  const buffer = await synthesizeSpeech(options);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// Greeting played on extension activation
export const GREETING_TEXT = "Hello, I'm your Resident Secretary. I'm ready to help you with any task on this page.";
