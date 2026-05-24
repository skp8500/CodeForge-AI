import { GoogleGenAI } from '@google/genai';

export const GEMINI_CLIENT = 'GEMINI_CLIENT';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

export function getGeminiText(response: { text?: string }): string {
  return response.text ?? '';
}
