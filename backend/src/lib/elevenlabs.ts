// ElevenLabs — Full Voice Pipeline (STT + TTS)
// Replaces Vapi. Handles both speech input and voice output.
// TASK-1051 + TASK-1052

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// ─── TTS ────────────────────────────────────────────────────────────────────

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
    throw new Error(`ElevenLabs TTS error ${response.status}: ${err}`);
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

// ─── STT ────────────────────────────────────────────────────────────────────
// ElevenLabs Speech-to-Text API

export interface STTOptions {
  audioBlob: Blob;
  modelId?: string;
  languageCode?: string;
}

export interface STTResult {
  transcript: string;
  confidence?: number;
  recordingId: string;
}

export async function transcribeSpeech(options: STTOptions): Promise<STTResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const formData = new FormData();
  formData.append('file', options.audioBlob, 'recording.webm');
  formData.append('model_id', options.modelId ?? 'scribe_v1');
  if (options.languageCode) formData.append('language_code', options.languageCode);

  const response = await fetch(`${ELEVENLABS_API_URL}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs STT error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const recordingId = `el_rec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  return {
    transcript: data.text ?? '',
    confidence: data.confidence,
    recordingId,
  };
}

// ─── RECORDING CHAIN ────────────────────────────────────────────────────────
// Critical: recording must be forwarded through Agent A → Agent B → Browser Action

export function buildRecordingChainItem(
  transcript: string,
  recordingId: string,
  pageContext: { url: string; pageType: string }
) {
  return {
    source: 'elevenlabs',
    transcript,
    recordingId,
    pageContext,
    timestamp: new Date().toISOString(),
    chainId: `chain_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
  };
}

// ─── GREETING ───────────────────────────────────────────────────────────────

export const GREETING_TEXT =
  "Hello, I'm your Resident Secretary. I'm ready to help you with any task on this page.";
