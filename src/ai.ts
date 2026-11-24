import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  type GenerativeModel,
} from 'firebase/ai';
import type { FirebaseApp } from 'firebase/app';
import { jsonSchema, responseSchema, DEVICE_PROMPT, CLOUD_PROMPT } from './schema';
import type { AltResult, Source } from './types';

export const CLOUD_MODEL = 'gemini-3.5-flash-lite';

export interface Handles {
  /** prefer-on-device, falls back to cloud by itself */
  hybrid: GenerativeModel;
  /** only-in-cloud */
  cloud: GenerativeModel;
}

const inCloudParams = {
  model: CLOUD_MODEL,
  generationConfig: { responseMimeType: 'application/json', responseSchema },
};

export function createHandles(app: FirebaseApp): Handles {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const hybrid = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: 'image' }, { type: 'text' }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
      promptOptions: { responseConstraint: jsonSchema },
    },
    inCloudParams,
  });
  const cloud = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams });
  return { hybrid, cloud };
}

type ChromeLanguageModel = {
  availability(opts?: unknown): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
};

/** Chrome Prompt API status, or null when `LanguageModel` does not exist in this browser. */
export async function deviceAvailability(): Promise<string | null> {
  const lm = (globalThis as unknown as { LanguageModel?: ChromeLanguageModel }).LanguageModel;
  if (!lm) return null;
  try {
    return await lm.availability({
      expectedInputs: [{ type: 'image' }, { type: 'text' }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
  } catch {
    return 'unavailable';
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(bin);
}

export function parseResult(text: string): AltResult {
  const o = JSON.parse(text) as Partial<AltResult>;
  const kind = o.kind === 'chart' || o.kind === 'decorative' ? o.kind : 'photo';
  const out: AltResult = { kind, alt: String(o.alt ?? '').trim() };
  if (o.longDescription) out.longDescription = String(o.longDescription).trim();
  return out;
}

/** Runs one request and reports where it actually ran (`inferenceSource`). */
export async function describe(
  model: GenerativeModel,
  blob: Blob,
  mime: string,
  cloudPrompt: boolean,
): Promise<{ result: AltResult; source: Source }> {
  const data = await blobToBase64(blob);
  const res = await model.generateContent([
    cloudPrompt ? CLOUD_PROMPT : DEVICE_PROMPT,
    { type: 'inlineData', inlineData: { mimeType: mime, data } },
  ]);
  const source: Source = res.response.inferenceSource === InferenceSource.ON_DEVICE ? 'device' : 'cloud';
  return { result: parseResult(res.response.text()), source };
}
