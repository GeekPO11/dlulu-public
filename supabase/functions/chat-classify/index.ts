// =============================================================================
// CHAT-CLASSIFY Edge Function - Intent Classification for Two-Step AI
// Classifies user intent before passing to main chat function
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { callGemini } from '../_shared/gemini.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'chat-classify';

// =============================================================================
// INTENT TYPES
// =============================================================================

export type IntentType =
    | 'CHAT'      // Greetings, casual conversation → No tools needed
    | 'QUESTION'  // General information questions → No tools, just answer
    | 'QUERY'     // Questions about their data → Coaching tools only
    | 'ACTION'    // Explicit action requests → All tools available
    | 'CLARIFY';  // Ambiguous intent → Need to ask clarifying question

export interface ClassificationResult {
    intent: IntentType;
    confidence: number;
    reasoning: string;
    suggestedResponse?: string; // For CHAT/QUESTION/CLARIFY - can respond directly
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(requestOrigin);
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const requestId = getRequestId(req);
    const responseContext = { requestId, origin: requestOrigin || undefined };

    try {
        // Verify authentication
        const { user, error: authError } = await verifyAuth(req);
        if (authError) {
            logError(FUNCTION_NAME, 'UNAUTHORIZED', authError, { requestId });
            return Errors.unauthorized(undefined, responseContext);
        }

        // Parse request body
        const { message, conversationHistory, hasGoals } = await req.json();

        if (!message) {
            logError(FUNCTION_NAME, 'MISSING_FIELD', 'message is required', { requestId, userId: user?.id });
            return Errors.missingField('message', responseContext);
        }

        logInfo(FUNCTION_NAME, 'Processing request', { requestId, userEmail: user?.email, messagePreview: message.substring(0, 80) });

        // Build classification prompt
        const prompt = buildClassificationPrompt(message, conversationHistory, hasGoals);

        // Call Gemini for classification
        const startTime = Date.now();
        const result = await callGemini(prompt, {
            temperature: 0.3, // Lower temp for more consistent classification
            maxOutputTokens: 1024
        });
        const latencyMs = Date.now() - startTime;

        logInfo(FUNCTION_NAME, 'Classification complete', { requestId, intent: result.intent, confidence: result.confidence, latencyMs });

        return createSuccessResponse({
            intent: result.intent || 'CLARIFY',
            confidence: result.confidence || 0.5,
            reasoning: result.reasoning || '',
            suggestedResponse: result.suggestedResponse,
            latencyMs,
        }, responseContext);

    } catch (error) {
        logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message || 'Classification failed', { requestId, stack: error.stack });
        return Errors.internalError('Classification failed: ' + error.message, responseContext);
    }
});

// =============================================================================
// CLASSIFICATION PROMPT
// =============================================================================

function buildClassificationPrompt(
    message: string,
    conversationHistory: any[] = [],
    hasGoals: boolean = false
): string {
    const recentContext = conversationHistory
        .slice(-5)
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

    return `You are an intent classifier for a goal manifestation app called "Dlulu Life".
Your job is to classify the user's message into one of these categories:

## INTENT CATEGORIES

**CHAT** - Use for:
- Greetings: "hi", "hello", "hey", "good morning"
- Thanks: "thanks", "thank you", "great"
- Casual: "how are you", "what's up"
- Acknowledgments: "ok", "cool", "got it"

**QUESTION** - Use for:
- General knowledge: "what is...", "how does...", "explain..."
- Advice seeking: "what would it take to...", "how should I..."
- Conceptual: "why is...", "what are the benefits of..."
- NOT about their specific goals/data

**QUERY** - Use for:
- Questions about THEIR data: "show my goals", "what's my progress"
- Status checks: "how am I doing", "what should I focus on today"
- Reports: "give me a summary", "what did I accomplish this week"

**ACTION** - Use for:
- Explicit action words: "create", "add", "delete", "schedule", "update", "edit"
- Goal creation: "I want to start...", "help me achieve...", "set up a goal for..."
- Direct requests: "mark this done", "reschedule my event"

**CLARIFY** - Use when:
- Intent is ambiguous between QUESTION and ACTION
- User might be asking OR requesting
- More context needed

## IMPORTANT RULES
1. If user says "hi" or greets → ALWAYS return CHAT
2. If user asks "what is X" or "how does X work" → QUESTION (general knowledge)
3. If user asks about THEIR goals, progress, schedule → QUERY
4. If user says "create", "add", "delete", etc. → ACTION
5. When unsure between QUESTION and ACTION → prefer CLARIFY

## CONTEXT
User has goals: ${hasGoals ? 'Yes' : 'No'}

Recent conversation:
${recentContext || '(No prior messages)'}

## USER MESSAGE
"${message}"

## RESPONSE FORMAT (JSON)
{
  "intent": "CHAT" | "QUESTION" | "QUERY" | "ACTION" | "CLARIFY",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this classification",
  "suggestedResponse": "If CHAT/QUESTION/CLARIFY, provide a direct response. Otherwise null."
}

Respond with only the JSON object.`;
}
