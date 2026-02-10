const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';

const buildGeminiUrl = (model: string): string =>
  `${GEMINI_BASE_URL}/${model}:generateContent`;

export interface GeminiConfig {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

/**
 * Simple call for string prompts (used by most Edge Functions)
 */
export async function callGemini(prompt: string, config: GeminiConfig = {}) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'undefined') {
    throw new Error('Missing GEMINI_API_KEY in Supabase Edge Function secrets');
  }

  const {
    model = DEFAULT_GEMINI_MODEL,
    temperature = 0.7,
    maxOutputTokens = 8192,
    responseMimeType = 'application/json'
  } = config;

  const response = await fetch(`${buildGeminiUrl(model)}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        topK: 40,
        topP: 0.95,
        maxOutputTokens,
        responseMimeType
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini');
  }

  // Parse JSON response
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Advanced call for full request objects (used by chatbot with function calling)
 * Supports: contents, tools, generationConfig, etc.
 */
export async function callGeminiAdvanced(request: {
  model?: string;
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  tools?: any[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topK?: number;
    topP?: number;
  };
}) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'undefined') {
    throw new Error('Missing GEMINI_API_KEY in Supabase Edge Function secrets');
  }

  const { model = DEFAULT_GEMINI_MODEL, ...payload } = request;

  const response = await fetch(`${buildGeminiUrl(model)}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  return response.json();
}
