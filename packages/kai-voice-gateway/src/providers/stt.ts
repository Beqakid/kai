// ── STT Provider Abstraction ──

import { STTProviderName, Env, Ai } from '../types';
import { Errors } from '../errors';

/** Result shape all STT providers return */
export interface STTResult {
  transcript: string;
  confidence: number;
  language: string;
  durationMs: number;
}

/** Interface all STT providers must implement */
export interface STTProvider {
  readonly name: STTProviderName;
  transcribe(
    audio: ArrayBuffer,
    sessionId: string,
    mimeType: string,
  ): Promise<STTResult>;
}

// ── Mock STT ──

export class MockSTTProvider implements STTProvider {
  readonly name: STTProviderName = 'mock';

  async transcribe(
    _audio: ArrayBuffer,
    _sessionId: string,
    _mimeType: string,
  ): Promise<STTResult> {
    await new Promise((r) => setTimeout(r, 300));
    return {
      transcript: 'What should I work on today?',
      confidence: 0.95,
      language: 'en',
      durationMs: 2400,
    };
  }
}

// ── Cloudflare Workers AI STT ──
// Uses @cf/openai/whisper model via the AI binding

export class CloudflareAISTTProvider implements STTProvider {
  readonly name: STTProviderName = 'cloudflare-ai';

  constructor(private readonly ai: Ai) {}

  async transcribe(
    audio: ArrayBuffer,
    _sessionId: string,
    _mimeType: string,
  ): Promise<STTResult> {
    const startTime = Date.now();

    try {
      const result = await this.ai.run('@cf/openai/whisper', {
        audio: [...new Uint8Array(audio)],
      }) as {
        text?: string;
        words?: Array<{ word: string; start: number; end: number }>;
        vtt?: string;
      };

      const durationMs = Date.now() - startTime;
      const transcript = (result?.text ?? '').trim();

      if (!transcript) {
        throw Errors.gatewayFailure('Cloudflare AI STT returned empty transcript.');
      }

      // Estimate confidence — Cloudflare Whisper doesn't return a score,
      // so we use a heuristic based on word count and transcript length
      const wordCount = transcript.split(/\s+/).length;
      const confidence = wordCount > 2 ? 0.9 : 0.7;

      return {
        transcript,
        confidence,
        language: 'en', // Whisper auto-detects but doesn't expose language in CF binding
        durationMs,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'KaiGatewayError') throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.gatewayFailure(`Cloudflare AI STT failed: ${msg}`);
    }
  }
}

// ── OpenAI Whisper STT ──
// Calls the OpenAI Whisper API (v1/audio/transcriptions)

export class WhisperSTTProvider implements STTProvider {
  readonly name: STTProviderName = 'whisper';

  constructor(private readonly apiKey: string) {}

  async transcribe(
    audio: ArrayBuffer,
    _sessionId: string,
    mimeType: string,
  ): Promise<STTResult> {
    const startTime = Date.now();

    // Determine file extension from MIME type
    const extMap: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
    };
    const ext = extMap[mimeType] || 'webm';

    const formData = new FormData();
    const blob = new Blob([audio], { type: mimeType });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('language', 'en');

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw Errors.gatewayFailure(`OpenAI Whisper returned ${response.status}: ${errorBody}`);
      }

      const result = await response.json() as {
        text: string;
        language: string;
        duration: number;
      };

      const durationMs = Date.now() - startTime;

      return {
        transcript: result.text.trim(),
        confidence: 0.92, // Whisper API doesn't return confidence
        language: result.language || 'en',
        durationMs,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'KaiGatewayError') throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.gatewayFailure(`OpenAI Whisper STT failed: ${msg}`);
    }
  }
}

// ── Deepgram STT ──
// Calls the Deepgram Nova-2 API

export class DeepgramSTTProvider implements STTProvider {
  readonly name: STTProviderName = 'deepgram';

  constructor(private readonly apiKey: string) {}

  async transcribe(
    audio: ArrayBuffer,
    _sessionId: string,
    mimeType: string,
  ): Promise<STTResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${this.apiKey}`,
            'Content-Type': mimeType || 'audio/webm',
          },
          body: audio,
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw Errors.gatewayFailure(`Deepgram returned ${response.status}: ${errorBody}`);
      }

      const result = await response.json() as {
        results?: {
          channels?: Array<{
            alternatives?: Array<{
              transcript: string;
              confidence: number;
            }>;
          }>;
        };
        metadata?: {
          duration: number;
          language?: string;
        };
      };

      const durationMs = Date.now() - startTime;
      const alt = result?.results?.channels?.[0]?.alternatives?.[0];

      if (!alt || !alt.transcript) {
        throw Errors.gatewayFailure('Deepgram returned empty transcript.');
      }

      return {
        transcript: alt.transcript.trim(),
        confidence: alt.confidence ?? 0.9,
        language: result?.metadata?.language || 'en',
        durationMs,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'KaiGatewayError') throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.gatewayFailure(`Deepgram STT failed: ${msg}`);
    }
  }
}

// ── Factory ──

export function getSTTProvider(name: STTProviderName, env: Env): STTProvider {
  switch (name) {
    case 'mock':
      return new MockSTTProvider();

    case 'cloudflare-ai':
      if (!env.AI) {
        throw Errors.gatewayFailure(
          'Cloudflare AI binding (AI) is not configured. Add [ai] to wrangler.toml.',
        );
      }
      return new CloudflareAISTTProvider(env.AI);

    case 'whisper':
      if (!env.OPENAI_API_KEY) {
        throw Errors.gatewayFailure(
          'OPENAI_API_KEY is not set. Run: wrangler secret put OPENAI_API_KEY',
        );
      }
      return new WhisperSTTProvider(env.OPENAI_API_KEY);

    case 'deepgram':
      if (!env.DEEPGRAM_API_KEY) {
        throw Errors.gatewayFailure(
          'DEEPGRAM_API_KEY is not set. Run: wrangler secret put DEEPGRAM_API_KEY',
        );
      }
      return new DeepgramSTTProvider(env.DEEPGRAM_API_KEY);

    default:
      throw Errors.unsupportedProvider('STT', name);
  }
}
