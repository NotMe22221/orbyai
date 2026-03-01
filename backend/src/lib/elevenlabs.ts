// ElevenLabs — Full Voice Pipeline (STT + TTS + Conversational Agent)
// Agent ID: configured via ELEVENLABS_AGENT_ID env var

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// ─── TTS ──────────────────────────────────────────────────────────────────

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
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: options.text,
      model_id: modelId,
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
      },
    }),
  });

  if (!response.ok) throw new Error(`ElevenLabs TTS error ${response.status}: ${await response.text()}`);
  return await response.arrayBuffer();
}

export async function synthesizeSpeechBase64(options: TTSOptions): Promise<string> {
  const buffer = await synthesizeSpeech(options);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// ─── STT ──────────────────────────────────────────────────────────────────

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

  if (!response.ok) throw new Error(`ElevenLabs STT error ${response.status}: ${await response.text()}`);

  const data = await response.json();
  return {
    transcript: data.text ?? '',
    confidence: data.confidence,
    recordingId: `el_rec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
  };
}

// ─── CONVERSATIONAL AGENT ───────────────────────────────────────────────
// Uses ElevenLabs Conversational AI agent for real-time voice sessions
// Agent ID: process.env.ELEVENLABS_AGENT_ID

export async function getConversationalAgentSignedUrl(): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  if (!agentId) throw new Error('ELEVENLABS_AGENT_ID not set');

  const response = await fetch(
    `${ELEVENLABS_API_URL}/convai/conversation/get_signed_url?agent_id=${agentId}`,
    { headers: { 'xi-api-key': apiKey } }
  );

  if (!response.ok) throw new Error(`ElevenLabs signed URL error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.signed_url;
}

export async function getAgentConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) throw new Error('ElevenLabs credentials not set');

  const response = await fetch(`${ELEVENLABS_API_URL}/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': apiKey },
  });

  if (!response.ok) throw new Error(`ElevenLabs agent config error ${response.status}`);
  return await response.json();
}

// ─── RECORDING CHAIN ──────────────────────────────────────────────────────

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

// ─── GREETING ────────────────────────────────────────────────────────────

export const GREETING_TEXT =
  "Hello, I'm your Resident Secretary. I'm ready to help you with any task on this page.";
