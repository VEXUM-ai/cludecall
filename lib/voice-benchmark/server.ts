import { Buffer } from "node:buffer";

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

import { DENTAL_DEMO_VOICE_ID } from "@/lib/agent-demo-config";
import { getServerConfig } from "@/lib/env";
import {
  buildWavFromPcm16,
  estimatePcm16DurationMs,
} from "@/lib/voice-benchmark/audio";
import {
  ELEVEN_TTS_REPLAY_MODEL_ID,
  GEMINI_LIVE_MODEL_ID,
  GEMINI_TTS_MODEL_ID,
  GEMINI_TTS_VOICE_NAME,
  findVoiceScriptCase,
} from "@/lib/voice-benchmark/scripts";
import { computeWerLikeDiff } from "@/lib/voice-benchmark/text";
import type { VoiceProviderId, VoiceReplayResult } from "@/lib/types";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

function assertVoiceBenchmarkEnabled() {
  if (!getServerConfig().voiceBenchmarkEnabled) {
    throw new Error(
      "Voice benchmark is disabled. Set VOICE_BENCHMARK_ENABLED=true to use this feature."
    );
  }
}

function requireGeminiApiKey() {
  const apiKey = getServerConfig().geminiApiKey;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }
  return apiKey;
}

function createGeminiClient(apiVersion: "v1alpha" | "v1beta" = "v1beta") {
  return new GoogleGenAI({
    apiKey: requireGeminiApiKey(),
    apiVersion,
  });
}

async function transcribeAudioWithScribe(
  audioBuffer: Buffer,
  fileName: string,
  mimeType: string,
  keyterms: string[]
) {
  const formData = new FormData();
  formData.append("model_id", "scribe_v2");
  formData.append(
    "file",
    new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
    fileName
  );
  formData.append("language_code", "ja");
  formData.append("timestamps_granularity", "word");
  formData.append("tag_audio_events", "false");

  if (keyterms.length > 0) {
    for (const keyterm of keyterms) {
      formData.append("keyterms", keyterm);
    }
  }

  const response = await fetch(`${ELEVENLABS_API_BASE}/speech-to-text`, {
    method: "POST",
    headers: {
      "xi-api-key": getServerConfig().apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to transcribe replay audio: ${message}`);
  }

  const payload = (await response.json()) as { text?: string };
  return payload.text?.trim() ?? null;
}

function computeBestWerLikeDiff(expectedText: string, alternatives: string[], actualText: string | null) {
  const candidates = [expectedText, ...alternatives].filter(
    (value, index, list) => list.indexOf(value) === index
  );
  return candidates.reduce<number | null>((best, candidate) => {
    const score = computeWerLikeDiff(candidate, actualText);
    if (best === null || score < best) {
      return score;
    }
    return best;
  }, null);
}

async function synthesizeWithEleven(text: string) {
  const url = new URL(
    `${ELEVENLABS_API_BASE}/text-to-speech/${DENTAL_DEMO_VOICE_ID}`
  );
  url.searchParams.set("output_format", "mp3_44100_128");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": getServerConfig().apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: ELEVEN_TTS_REPLAY_MODEL_ID,
      language_code: "ja",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to synthesize Eleven replay audio: ${await response.text()}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return {
    audioBuffer,
    audioMimeType: "audio/mpeg",
    durationMs: null,
  };
}

async function synthesizeWithGemini(text: string) {
  const ai = createGeminiClient("v1beta");
  const response = await ai.models.generateContent({
    model: GEMINI_TTS_MODEL_ID,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: GEMINI_TTS_VOICE_NAME,
          },
        },
      },
    },
  });

  const pcmBase64 =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
  if (!pcmBase64) {
    throw new Error("Gemini TTS did not return audio data.");
  }

  const pcmBuffer = Buffer.from(pcmBase64, "base64");
  const wavBuffer = buildWavFromPcm16(pcmBuffer, 24000);

  return {
    audioBuffer: wavBuffer,
    audioMimeType: "audio/wav",
    durationMs: estimatePcm16DurationMs(pcmBuffer, 24000),
  };
}

export async function createGeminiEphemeralToken() {
  assertVoiceBenchmarkEnabled();

  const ai = createGeminiClient("v1alpha");
  const tokenClient = ai as unknown as {
    tokens: {
      create: (params: { config: Record<string, unknown> }) => Promise<{
        name?: string;
        expireTime?: string;
        newSessionExpireTime?: string;
      }>;
    };
  };
  const now = Date.now();
  const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(now + 60 * 1000).toISOString();
  const token = await tokenClient.tokens.create({
    config: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      liveConnectConstraints: {
        model: GEMINI_LIVE_MODEL_ID,
        config: {
          responseModalities: ["AUDIO"],
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
        },
      },
      lockAdditionalFields: [],
    },
  });

  return {
    token: token.name,
    model: GEMINI_LIVE_MODEL_ID,
    expireTime: token.expireTime ?? expireTime,
    newSessionExpireTime: token.newSessionExpireTime ?? newSessionExpireTime,
  };
}

export async function runVoiceReplay(
  providerId: VoiceProviderId,
  scriptId: string,
  textOverride?: string | null
): Promise<VoiceReplayResult> {
  assertVoiceBenchmarkEnabled();

  const scriptCase = findVoiceScriptCase(scriptId);
  if (!scriptCase) {
    throw new Error(`Unknown scriptId: ${scriptId}`);
  }

  const expectedText = textOverride?.trim() || scriptCase.expectedText;

  if (
    providerId !== "eleven_tts_v3" &&
    providerId !== "gemini_2_5_flash_tts_preview"
  ) {
    throw new Error(`Unsupported replay provider: ${providerId}`);
  }

  const replay =
    providerId === "eleven_tts_v3"
      ? await synthesizeWithEleven(expectedText)
      : await synthesizeWithGemini(expectedText);

  const transcriptionHints = [
    "えみは総合歯科 大阪梅田院",
    "THP",
    "インプラント",
    "グラングリーン大阪",
    ...(scriptCase.keyterms ?? []),
  ].filter((value, index, list) => list.indexOf(value) === index);

  const providerTranscript = await transcribeAudioWithScribe(
    replay.audioBuffer,
    `${providerId}-${scriptCase.id}.${replay.audioMimeType.includes("mpeg") ? "mp3" : "wav"}`,
    replay.audioMimeType,
    transcriptionHints
  );

  return {
    providerId,
    scriptId: scriptCase.id,
    title: scriptCase.title,
    expectedText,
    audioMimeType: replay.audioMimeType,
    audioBase64: replay.audioBuffer.toString("base64"),
    providerTranscript,
    werLikeDiff: computeBestWerLikeDiff(
      expectedText,
      scriptCase.expectedAlternatives ?? [],
      providerTranscript
    ),
    durationMs: replay.durationMs,
  };
}
