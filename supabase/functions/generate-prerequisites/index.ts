// =============================================================================
// GENERATE PREREQUISITES - Edge Function
// Generates personalized status-check prerequisites using intake answers
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { callGemini } from '../_shared/gemini.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'generate-prerequisites';

const DATA_LIMITS = {
  MIN_PREREQUISITES: 5,
  MAX_PREREQUISITES: 10,
};

type IntakeAnswerValue = string | number | boolean | string[] | null;

interface GeneratePrerequisitesRequest {
  goal?: {
    title?: string;
    category?: string;
    timeline?: string;
    estimatedWeeks?: number;
    originalInput?: string;
  };
  intakeAnswers?: Record<string, IntakeAnswerValue>;
  userProfile?: {
    role?: string;
    bio?: string;
    chronotype?: string;
    energyLevel?: string;
  };
}

interface PrerequisiteResult {
  prerequisites: Array<{ label: string; order: number }>;
}

const ALLOWED_GOAL_CATEGORIES = new Set([
  'health',
  'career',
  'learning',
  'personal',
  'financial',
  'relationships',
]);

const truncate = (value: string, maxLen: number): string =>
  value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;

const isLikelyRateLimitError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes('429')
    || normalized.includes('resource_exhausted')
    || normalized.includes('rate limit')
    || normalized.includes('ratelimit');
};

const normalizeGoalCategory = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (ALLOWED_GOAL_CATEGORIES.has(normalized)) return normalized;
  return 'personal';
};

const parsePrerequisitesResponse = (raw: unknown): any | null => {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withoutFences = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const candidates = [withoutFences];
  const firstBrace = withoutFences.indexOf('{');
  const lastBrace = withoutFences.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(withoutFences.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return null;
};

const isValidPrerequisitesShape = (result: any): result is {
  prerequisites: Array<{ label: string; order?: number }>;
} => {
  if (!result || typeof result !== 'object' || !Array.isArray(result.prerequisites)) return false;
  return result.prerequisites.every((item: any) =>
    item && typeof item === 'object' && typeof item.label === 'string' && item.label.trim().length > 0
  );
};

const normalizePrerequisitesResult = (result: {
  prerequisites: Array<{ label: string; order?: number }>;
}): PrerequisiteResult => {
  const dedupedByLabel = new Map<string, { label: string; order?: number }>();

  for (const item of result.prerequisites || []) {
    const label = typeof item?.label === 'string' ? item.label.trim() : '';
    if (!label) continue;
    const key = label.toLowerCase();
    if (!dedupedByLabel.has(key)) {
      dedupedByLabel.set(key, {
        label,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : undefined,
      });
    }
  }

  const normalized = Array.from(dedupedByLabel.values())
    .sort((a, b) => {
      const aOrder = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.POSITIVE_INFINITY;
      const bOrder = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.POSITIVE_INFINITY;
      if (aOrder === bOrder) return a.label.localeCompare(b.label);
      return aOrder - bOrder;
    })
    .slice(0, DATA_LIMITS.MAX_PREREQUISITES)
    .map((item, index) => ({
      label: item.label,
      order: index + 1,
    }));

  if (normalized.length < DATA_LIMITS.MIN_PREREQUISITES) {
    throw new Error(
      `AI returned too few prerequisites (${normalized.length}). Expected at least ${DATA_LIMITS.MIN_PREREQUISITES}.`
    );
  }

  return { prerequisites: normalized };
};

const stringifyAnswer = (value: IntakeAnswerValue): string => {
  if (value === null || value === undefined) return 'Not provided';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const asString = String(value).trim();
  return asString.length > 0 ? asString : 'Not provided';
};

const formatIntakeAnswers = (intakeAnswers: Record<string, IntakeAnswerValue> | undefined): string => {
  if (!intakeAnswers || Object.keys(intakeAnswers).length === 0) {
    return '- None provided';
  }

  return Object.entries(intakeAnswers)
    .map(([key, value]) => `- ${key}: ${stringifyAnswer(value)}`)
    .join('\n');
};

const buildPrerequisitesPrompt = (
  goal: NonNullable<GeneratePrerequisitesRequest['goal']>,
  intakeAnswers: Record<string, IntakeAnswerValue>,
  userProfile: NonNullable<GeneratePrerequisitesRequest['userProfile']>
): string => {
  const category = normalizeGoalCategory(goal.category);
  const sensitiveCategory = category === 'health' || category === 'financial' || category === 'relationships';

  return `You are generating the final Status Check checklist for Dlulu onboarding.
The intake step is complete. Intake answers are the latest and most authoritative context.
Preliminary prerequisites from earlier analysis may be outdated. Regenerate now from intake.

Your job is to produce a checklist that is accurate, non-generic, and useful for real execution.
Do not assume the same prerequisite template applies to every goal. Infer what matters from the goal + intake.

## GOAL
- Title: ${goal.title || 'Untitled goal'}
- Category: ${category}
- Original Input: ${goal.originalInput || goal.title || 'Not provided'}
- Timeline: ${goal.timeline || `${goal.estimatedWeeks || '?'} weeks`}
- Estimated Weeks: ${goal.estimatedWeeks || 'Not provided'}

## USER PROFILE
- Role: ${userProfile.role || 'Not provided'}
- Life Context: ${userProfile.bio || 'Not provided'}
- Chronotype: ${userProfile.chronotype || 'flexible'}
- Energy Level: ${userProfile.energyLevel || 'balanced'}

## INTAKE ANSWERS (AUTHORITATIVE)
${formatIntakeAnswers(intakeAnswers)}

## TASK
Generate a personalized prerequisite checklist that the user will mark as already done vs not done.

STRICT REQUIREMENTS:
1. Return ${DATA_LIMITS.MIN_PREREQUISITES}-${DATA_LIMITS.MAX_PREREQUISITES} prerequisites.
2. Prerequisites must be specific and checkbox-ready (clear done/not-done statements).
3. Order from beginner/foundation to advanced (order 1 is most basic).
4. Use intake context directly:
   - If intake indicates beginner/no baseline, start from scratch foundations.
   - If intake shows prior experience/resources, do not waste items on obvious basics.
   - If intake reveals constraints (time, money, environment), adapt prerequisites to realistic setup.
5. Keep language practical and non-generic.
6. Make prerequisites cover the highest-leverage dimensions for THIS goal:
   - Before writing items, silently infer the 5-7 dimensions that determine success (examples: skills, logistics, distribution, measurement, stakeholders, resources, compliance, rehearsal, risk).
   - Ensure the checklist spans those dimensions; do not over-focus on just one (e.g., "coding") if the goal requires more (e.g., distribution, KPIs).
6. Do not include illegal or harmful instructions.
${sensitiveCategory ? '7. For sensitive goals (health/financial/relationships), include safety-oriented preparation steps and avoid prescriptive medical/legal/financial directives.' : '7. Include at least one realism/resource setup prerequisite when relevant.'}

## OUTPUT FORMAT (JSON)
{
  "prerequisites": [
    { "label": "Specific prerequisite", "order": 1 },
    { "label": "Next prerequisite", "order": 2 }
  ]
}

Return ONLY valid JSON, no markdown.`;
};

const buildPrerequisitesRepairPrompt = (
  goal: NonNullable<GeneratePrerequisitesRequest['goal']>,
  intakeAnswers: Record<string, IntakeAnswerValue>,
  userProfile: NonNullable<GeneratePrerequisitesRequest['userProfile']>,
  rawResponse: unknown,
  validationError?: string
): string => {
  const rawText = typeof rawResponse === 'string'
    ? rawResponse
    : JSON.stringify(rawResponse || {});
  const clippedRawText = rawText.length > 18000 ? `${rawText.slice(0, 18000)}...` : rawText;

  return `You are a strict JSON repair engine.
Your task: repair/transform the candidate output into a valid generate-prerequisites response JSON.

GOAL:
- Title: ${goal.title || 'Untitled goal'}
- Category: ${normalizeGoalCategory(goal.category)}
- Timeline: ${goal.timeline || `${goal.estimatedWeeks || '?'} weeks`}

USER PROFILE:
- Role: ${userProfile.role || 'Not provided'}
- Life Context: ${userProfile.bio || 'Not provided'}
- Chronotype: ${userProfile.chronotype || 'flexible'}
- Energy Level: ${userProfile.energyLevel || 'balanced'}

INTAKE ANSWERS:
${formatIntakeAnswers(intakeAnswers)}

PREVIOUS VALIDATION ERROR: ${validationError || 'unknown'}

CANDIDATE OUTPUT TO REPAIR:
${clippedRawText}

REQUIRED OUTPUT JSON SHAPE:
{
  "prerequisites": [
    { "label": "string", "order": 1 }
  ]
}

STRICT REQUIREMENTS:
- Return ${DATA_LIMITS.MIN_PREREQUISITES}-${DATA_LIMITS.MAX_PREREQUISITES} prerequisites.
- Non-empty labels only.
- Order must start at 1 and progress logically beginner -> advanced.
- Keep prerequisites specific and checkable.
- Intake answers are authoritative.

Return ONLY valid JSON, no markdown.`;
};

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(requestOrigin) });
  }

  const requestId = getRequestId(req);
  const responseContext = { requestId, origin: requestOrigin || undefined };

  try {
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'No user found', { requestId });
      return Errors.unauthorized(undefined, responseContext);
    }

    const { goal, intakeAnswers = {}, userProfile = {} }: GeneratePrerequisitesRequest = await req.json();

    if (!goal || typeof goal !== 'object' || !goal.title || goal.title.trim().length === 0) {
      logError(FUNCTION_NAME, 'MISSING_FIELD', 'goal.title is required', { requestId, userId: user.id });
      return Errors.missingField('goal.title', responseContext);
    }

    logInfo(FUNCTION_NAME, 'Generating personalized prerequisites', {
      requestId,
      userId: user.id,
      goalTitle: goal.title,
      category: normalizeGoalCategory(goal.category),
      intakeFieldsCount: Object.keys(intakeAnswers || {}).length,
    });

    const prompt = buildPrerequisitesPrompt(goal, intakeAnswers || {}, userProfile || {});

	    let rawResult: unknown;
	    try {
	      rawResult = await callGemini(prompt, {
	        temperature: 0.1,
	        maxOutputTokens: 4096,
	        responseMimeType: 'application/json',
	      });
	    } catch (geminiError: any) {
      const geminiMessage = geminiError?.message || String(geminiError);
      logError(FUNCTION_NAME, 'GEMINI_ERROR', geminiMessage, {
        requestId,
        userId: user.id,
      });

      if (isLikelyRateLimitError(geminiMessage)) {
        return Errors.rateLimited(
          'AI is rate limited right now. Please wait 30-60 seconds and retry.',
          responseContext
        );
      }

      return Errors.geminiError(
        `Prerequisite generation failed: ${truncate(geminiMessage, 600)}`,
        responseContext
      );
    }

    const attemptNormalize = (candidate: unknown): PrerequisiteResult => {
      const parsed = parsePrerequisitesResponse(candidate);
      if (!parsed || !isValidPrerequisitesShape(parsed)) {
        throw new Error('Invalid AI prerequisites response shape');
      }
      return normalizePrerequisitesResult(parsed);
    };

    let normalizedResult: PrerequisiteResult;
    let primaryValidationError: string | undefined;

    try {
      normalizedResult = attemptNormalize(rawResult);
    } catch (validationError: any) {
      primaryValidationError = validationError?.message || 'Failed to normalize AI prerequisite response';
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', primaryValidationError, {
        requestId,
        userId: user.id,
        stage: 'primary',
      });

      const repairPrompt = buildPrerequisitesRepairPrompt(
        goal,
        intakeAnswers || {},
        userProfile || {},
        rawResult,
        primaryValidationError
      );

	      let repairedRawResult: unknown;
	      try {
	        repairedRawResult = await callGemini(repairPrompt, {
	          temperature: 0.1,
	          maxOutputTokens: 4096,
	          responseMimeType: 'application/json',
	        });
	      } catch (repairGeminiError: any) {
        const geminiMessage = repairGeminiError?.message || String(repairGeminiError);
        logError(FUNCTION_NAME, 'GEMINI_ERROR', geminiMessage, {
          requestId,
          userId: user.id,
          stage: 'repair',
          primaryValidationError,
        });

        if (isLikelyRateLimitError(geminiMessage)) {
          return Errors.rateLimited(
            'AI is rate limited right now. Please wait 30-60 seconds and retry.',
            responseContext
          );
        }

        return Errors.geminiError(
          `Prerequisite generation failed: ${truncate(geminiMessage, 600)}`,
          responseContext
        );
      }

      try {
        normalizedResult = attemptNormalize(repairedRawResult);
      } catch (repairValidationError: any) {
        const repairErrorMessage = repairValidationError?.message || 'Failed to normalize repaired AI prerequisite response';
        logError(FUNCTION_NAME, 'VALIDATION_ERROR', repairErrorMessage, {
          requestId,
          userId: user.id,
          stage: 'repair',
          primaryValidationError,
        });
        return Errors.validationError('AI returned an invalid prerequisite structure. Please retry.', responseContext);
      }
    }

    logInfo(FUNCTION_NAME, 'Personalized prerequisites generated', {
      requestId,
      userId: user.id,
      goalTitle: goal.title,
      prerequisitesCount: normalizedResult.prerequisites.length,
    });

    return createSuccessResponse(normalizedResult, responseContext);
  } catch (error: any) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error?.message || String(error), {
      requestId,
      stack: error?.stack,
    });
    return Errors.internalError('Failed to generate prerequisites: ' + (error?.message || String(error)), responseContext);
  }
});
