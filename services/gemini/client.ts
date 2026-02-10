// =============================================================================
// Gemini Client Configuration
// =============================================================================
// 
// Model: Gemini 3 Flash (Released Dec 17, 2025)
// - 3x faster than Gemini 2.5 Pro
// - 75% cost reduction (uses 30% fewer tokens)
// - SWE-bench Verified score: 78%
// - Context window: 1,048,576 input tokens, 65,536 output tokens
// - Supports: text, image, video, audio, PDF inputs
// - Pricing: $0.50/1M input, $3.00/1M output tokens
//
// Docs: https://ai.google.dev/gemini-api/docs/models/gemini
// =============================================================================

import { GoogleGenAI } from "@google/genai";
import { logger } from "../../lib/logger";

// Lazy-initialize AI Client (only when API key is available)
// This prevents app crash when using Supabase Edge Functions for AI
let _ai: GoogleGenAI | null = null;

export const getAI = (): GoogleGenAI => {
  if (!_ai) {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('[Gemini] No API key set. AI features will use Supabase Edge Functions.');
      // Return a dummy instance that will fail on use - Edge Functions should be used instead
      _ai = new GoogleGenAI({ apiKey: 'placeholder-will-use-edge-functions' });
    } else {
      _ai = new GoogleGenAI({ apiKey });
    }
  }
  return _ai;
};

// Legacy export for compatibility (lazy-initialized)
export const ai = new Proxy({} as GoogleGenAI, {
  get: (_, prop) => {
    return (getAI() as any)[prop];
  }
});

// Model selection - All using Gemini 3 Flash (latest, fastest, most capable)
export const MODELS = {
  // Complex planning tasks (strategy, gap analysis, roadmap generation)
  // Uses thinking budget for deeper reasoning
  PLANNING: 'gemini-3-flash-preview',
  
  // Quick responses (chat, suggestions, quotes)
  FAST: 'gemini-3-flash-preview',
  
  // Multimodal - Image/PDF understanding (roster parsing, vision board)
  VISION: 'gemini-3-flash-preview',
  
  // Text-to-speech (preview feature)
  TTS: 'gemini-3-flash-preview-tts',
  
  // Audio transcription
  TRANSCRIPTION: 'gemini-3-flash-preview',
  
  // Live audio dialog (voice coach - preview feature)
  LIVE_AUDIO: 'gemini-3-flash-preview-native-audio-dialog',
} as const;

// Helper to clean JSON from markdown code blocks
export const cleanJson = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
};

// Extract valid JSON object from potentially malformed response
// Handles cases where Gemini appends garbage like }}}}}} at the end
export const extractValidJson = (text: string): string => {
  if (!text) return "";
  
  const cleaned = cleanJson(text);
  
  // Find the opening brace
  const startIndex = cleaned.indexOf('{');
  if (startIndex === -1) return cleaned;
  
  // Track brace depth to find the matching closing brace
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = startIndex; i < cleaned.length; i++) {
    const char = cleaned[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          // Found the matching closing brace
          const validJson = cleaned.substring(startIndex, i + 1);
          // Extracted valid JSON
          return validJson;
        }
      }
    }
  }
  
  // If we couldn't find balanced braces, return the cleaned text
  logger.warn("[Gemini] Could not find balanced JSON braces, returning cleaned text");
  return cleaned;
};

// Parse JSON safely with error logging and smart extraction
export const parseJsonSafe = <T>(text: string, fallback: T): T => {
  try {
    // First try: direct parse after cleaning
    const cleaned = cleanJson(text);
    return JSON.parse(cleaned) as T;
  } catch (firstError) {
    logger.warn("[Gemini] Direct JSON parse failed, attempting extraction...");
    
    try {
      // Second try: extract valid JSON portion
      const extracted = extractValidJson(text);
      const result = JSON.parse(extracted) as T;
      // Successfully parsed JSON
      return result;
    } catch (secondError) {
      logger.error("[Gemini] JSON parse error after extraction", secondError, {
        textLength: text.length,
      });
      return fallback;
    }
  }
};
