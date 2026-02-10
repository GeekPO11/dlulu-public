
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'analyze-goal-strategy';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(requestOrigin);
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const requestId = getRequestId(req);
    const responseContext = { requestId, origin: requestOrigin || undefined };

    try {
        const { user, error: authError } = await verifyAuth(req);
        if (authError || !user) {
            logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'No user found', { requestId });
            return Errors.unauthorized(undefined, responseContext);
        }

        const { goal, userProfile } = await req.json();

        if (!goal || !userProfile) {
            logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'Goal and User Profile are required', { requestId, userId: user.id });
            return Errors.validationError('Goal and User Profile are required', responseContext);
        }

        logInfo(FUNCTION_NAME, 'Analyzing goal strategy', { requestId, goalId: goal.id, userId: user.id });

        const prompt = `
        Analyze this goal for scheduling: "${goal.title}"
        Type: ${goal.category}
        Overview: ${goal.strategyOverview || goal.description}
        
        User Profile:
        - Focus Time: ${userProfile.preferredFocusTime}
        - Sleep: ${userProfile.sleepStart}:00 to ${userProfile.sleepEnd}:00
        - Work: ${userProfile.workStart}:00 to ${userProfile.workEnd}:00

        Determine the "Scheduling Archetype":
        1. HABIT_BUILDING (e.g., Gym, Meditation) -> High frequency, fixed duration.
        2. DEEP_WORK_PROJECT (e.g., Coding, Writing) -> Long blocks, low frequency.
        3. SKILL_ACQUISITION (e.g., Learning Language) -> Spaced repetition.
        4. MAINTENANCE (e.g., Chores) -> Periodic, low energy.

        Return JSON:
        {
            "archetype": "HABIT_BUILDING" | "DEEP_WORK_PROJECT" | "SKILL_ACQUISITION" | "MAINTENANCE",
            "frequencyPerWeek": number,
            "sessionDurationMin": number,
            "preferredDays": ["Mon", "Tue"...],
            "groupingLogic": "BATCH_TASKS" | "ATOMIC_BITE_SIZED" | "LONG_SESSION"
        }
        `;

        if (!GEMINI_API_KEY) {
            throw new Error('Missing GEMINI_API_KEY');
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error('Failed to get response from Gemini');
        }

        // Parse JSON
        const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
        const strategy = JSON.parse(jsonStr);

        return createSuccessResponse(strategy, responseContext);

    } catch (error) {
        logError(FUNCTION_NAME, 'GEMINI_ERROR', error.message, { requestId });
        // Fallback strategy if AI fails
        return createSuccessResponse({
            archetype: 'DEEP_WORK_PROJECT',
            frequencyPerWeek: 3,
            sessionDurationMin: 60,
            preferredDays: ['Mon', 'Wed', 'Fri'],
            groupingLogic: 'BATCH_TASKS',
            _isFallback: true
        }, responseContext);
    }
});
