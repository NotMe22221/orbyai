// Vapi WebRTC client integration
// Handles voice session lifecycle, turn detection, and transcript forwarding
// TASK-1051: Vapi SDK integration

export interface VapiConfig {
  apiKey: string;
  assistantId: string;
  onTranscript: (transcript: string, recording: string | null) => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  onError: (error: Error) => void;
}

export interface VapiSession {
  start: () => Promise<void>;
  stop: () => void;
  isMuted: () => boolean;
  mute: () => void;
  unmute: () => void;
}

// NOTE: Install @vapi-ai/web SDK: npm install @vapi-ai/web
// import Vapi from '@vapi-ai/web';

export function createVapiSession(config: VapiConfig): VapiSession {
  // let vapiClient: Vapi | null = null;
  let muted = false;

  return {
    async start() {
      try {
        config.onStatusChange('connecting');

        // --- Uncomment when @vapi-ai/web is installed ---
        // vapiClient = new Vapi(config.apiKey);
        //
        // vapiClient.on('call-start', () => {
        //   config.onStatusChange('connected');
        // });
        //
        // vapiClient.on('call-end', () => {
        //   config.onStatusChange('disconnected');
        // });
        //
        // vapiClient.on('transcript', (t: { role: string; transcript: string }) => {
        //   if (t.role === 'user') {
        //     // Pass transcript + recording reference to next agent
        //     config.onTranscript(t.transcript, `vapi_recording_${Date.now()}`);
        //   }
        // });
        //
        // vapiClient.on('error', (e: Error) => {
        //   config.onStatusChange('error');
        //   config.onError(e);
        // });
        //
        // await vapiClient.start(config.assistantId);

        // MOCK: simulate connection for development
        setTimeout(() => config.onStatusChange('connected'), 800);
      } catch (err) {
        config.onStatusChange('error');
        config.onError(err instanceof Error ? err : new Error(String(err)));
      }
    },

    stop() {
      // vapiClient?.stop();
      config.onStatusChange('disconnected');
    },

    isMuted: () => muted,
    mute() { muted = true; /* vapiClient?.setMuted(true); */ },
    unmute() { muted = false; /* vapiClient?.setMuted(false); */ },
  };
}

/**
 * CRITICAL: Vapi recording chain
 * Every Vapi interaction must be recorded and forwarded as an initiative item
 * to the next agent (Agent A → Agent B → Browser Action Executor)
 */
export function buildVapiInitiativeItem(
  transcript: string,
  recordingId: string | null,
  pageContext: { url: string; pageType: string }
) {
  return {
    source: 'vapi',
    transcript,
    recordingId,
    pageContext,
    timestamp: new Date().toISOString(),
    chainId: `chain_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
  };
}
