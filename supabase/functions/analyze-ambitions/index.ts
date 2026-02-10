// =============================================================================
// ANALYZE AMBITIONS - Edge Function
// Analyzes user's manifestation dreams and generates preliminary prerequisites + intake questions
// First step in the manifestation journey
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { callGemini } from '../_shared/gemini.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'analyze-ambitions';

// Data limits
const DATA_LIMITS = {
  MAX_GOALS: 10,
  MAX_PREREQUISITES_PER_GOAL: 10,
  MIN_PREREQUISITES_PER_GOAL: 5,
  MIN_TIMELINE_WEEKS: 4,
  MAX_TIMELINE_WEEKS: 52,
};

interface AnalyzeAmbitionsRequest {
  ambitionText: string;
  isAddGoalMode?: boolean;
  existingGoals?: Array<{
    id?: string;
    title?: string;
    category?: string;
    timeline?: string;
    estimatedWeeks?: number;
    status?: string;
    frequency?: number;
    duration?: number;
  }>;
  userProfile?: {
    name?: string;
    role?: string;
    bio?: string;
    chronotype?: string;
    energyLevel?: string;
  };
}

type IntakeQuestionType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'single_select'
  | 'multi_select'
  | 'boolean'
  | 'date';

interface IntakeQuestionOption {
  id: string;
  label: string;
  value: string;
}

interface IntakeQuestion {
  id: string;
  fieldKey: string;
  question: string;
  helperText?: string;
  placeholder?: string;
  type: IntakeQuestionType;
  required: boolean;
  options?: IntakeQuestionOption[];
  min?: number;
  max?: number;
  unit?: string;
  sensitivity?: 'general' | 'health' | 'finance' | 'relationships';
}

const VALID_INTAKE_TYPES = new Set<IntakeQuestionType>([
  'short_text',
  'long_text',
  'number',
  'single_select',
  'multi_select',
  'boolean',
  'date',
]);

function isValidAnalysisResult(result: any): result is {
  goals: Array<{
    title: string;
    category: string;
    timeline: string;
    estimatedWeeks?: number;
    prerequisites: Array<{ label: string; description?: string; order?: number }>;
    intakeQuestions?: IntakeQuestion[];
  }>;
} {
  if (!result || typeof result !== 'object' || !Array.isArray(result.goals)) return false;

  return result.goals.every((goal: any) => {
    if (!goal || typeof goal !== 'object') return false;
    if (typeof goal.title !== 'string' || goal.title.trim().length === 0) return false;
    if (typeof goal.category !== 'string' || goal.category.trim().length === 0) return false;
    if (typeof goal.timeline !== 'string' || goal.timeline.trim().length === 0) return false;
    if (!Array.isArray(goal.prerequisites)) return false;
    // Keep this structural check permissive. Detailed intake validation happens in normalizeAnalysisResult.
    return goal.prerequisites.every((item: any) =>
      item && typeof item === 'object' && typeof item.label === 'string' && item.label.trim().length > 0
    );
  });
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

const coerceQuestionType = (value: unknown): IntakeQuestionType => {
  if (typeof value === 'string' && VALID_INTAKE_TYPES.has(value as IntakeQuestionType)) {
    return value as IntakeQuestionType;
  }
  return 'short_text';
};

const sanitizeQuestionOptions = (options: unknown, questionId: string): IntakeQuestionOption[] | undefined => {
  if (!Array.isArray(options)) return undefined;
  const sanitized = options
    .map((option: any, index) => {
      const label = typeof option?.label === 'string' ? option.label.trim() : '';
      const value = typeof option?.value === 'string' ? option.value.trim() : label;
      if (!label || !value) return null;
      return {
        id: typeof option?.id === 'string' && option.id.trim().length > 0
          ? option.id
          : `${questionId}_opt_${index + 1}`,
        label,
        value,
      } as IntakeQuestionOption;
    })
    .filter(Boolean) as IntakeQuestionOption[];

  return sanitized.length > 0 ? sanitized : undefined;
};

const normalizeFieldKey = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const CANONICAL_INTAKE_FIELD_ALIASES: Record<string, string[]> = {
  current_state: ['current_state', 'current_status', 'starting_point', 'baseline_state', 'current_situation'],
  target_state: ['target_state', 'desired_state', 'goal_state', 'target_outcome', 'desired_outcome'],
  target_timeframe_weeks: [
    'target_timeframe_weeks',
    'timeframe_weeks',
    'timeline_weeks',
    'target_weeks',
    'deadline_weeks',
    'target_timeframe',
    'time_horizon_weeks',
    'target_date',
  ],
  current_weight_kg: ['current_weight_kg', 'current_weight', 'weight_kg', 'current_weight_lb', 'current_weight_lbs'],
  target_weight_kg: ['target_weight_kg', 'target_weight', 'goal_weight', 'goal_weight_kg', 'target_weight_lb', 'target_weight_lbs'],
  lifestyle_pattern: ['lifestyle_pattern', 'lifestyle', 'activity_level', 'daily_activity_level', 'routine_pattern'],
  age_group: ['age_group', 'age_range', 'age_bracket', 'age'],
  current_net_worth: ['current_net_worth', 'net_worth_current', 'starting_net_worth'],
  target_net_worth: ['target_net_worth', 'goal_net_worth', 'desired_net_worth'],
  monthly_income: ['monthly_income', 'income_monthly', 'monthly_take_home', 'take_home_monthly'],
  monthly_expenses: ['monthly_expenses', 'expenses_monthly', 'monthly_spend', 'monthly_spending'],
  current_relationship_state: ['current_relationship_state', 'relationship_status', 'relationship_context'],
  target_relationship_outcome: ['target_relationship_outcome', 'relationship_goal', 'desired_relationship_outcome'],
};

const INTAKE_FIELD_HINTS: Record<string, RegExp[]> = {
  current_state: [/where are you currently/i, /current (situation|status|state|level)/i, /baseline/i],
  target_state: [/target (state|outcome)/i, /desired (state|outcome|result)/i, /what (exact )?outcome/i],
  target_timeframe_weeks: [
    /time ?frame/i,
    /timeline/i,
    /\bdeadline\b/i,
    /by when/i,
    /\bhow long\b/i,
    /target date/i,
    /due date/i,
    /how many weeks/i,
    /weeks?\s+(to|until|from now|left|remaining|target|timeline)/i,
    /when do you want to achieve/i,
  ],
  current_weight_kg: [/current weight/i, /what do you weigh/i, /weight now/i],
  target_weight_kg: [/target weight/i, /goal weight/i, /want to weigh/i],
  lifestyle_pattern: [/lifestyle/i, /activity level/i, /daily routine/i, /how active/i],
  age_group: [/\bage\b/i, /age group/i, /age range/i],
  current_net_worth: [/current net worth/i, /net worth now/i, /assets minus liabilities/i],
  target_net_worth: [/target net worth/i, /goal net worth/i, /desired net worth/i],
  monthly_income: [/monthly income/i, /monthly take[- ]?home/i, /income per month/i],
  monthly_expenses: [/monthly expenses/i, /monthly spend/i, /expenses per month/i],
  current_relationship_state: [/current relationship/i, /relationship status/i, /relationship now/i],
  target_relationship_outcome: [/target relationship/i, /relationship outcome/i, /desired relationship/i],
};

const INTAKE_FIELD_ALIAS_LOOKUP = Object.entries(CANONICAL_INTAKE_FIELD_ALIASES)
  .reduce((lookup, [canonical, aliases]) => {
    aliases.forEach((alias) => {
      lookup.set(normalizeFieldKey(alias), canonical);
    });
    return lookup;
  }, new Map<string, string>());

const REQUIRED_INTAKE_FIELDS_BY_CATEGORY: Record<string, string[]> = {
  health: ['current_state', 'target_state', 'target_timeframe_weeks'],
  financial: ['current_state', 'target_state', 'target_timeframe_weeks'],
  relationships: ['current_relationship_state', 'target_relationship_outcome', 'target_timeframe_weeks'],
  career: ['current_state', 'target_state', 'target_timeframe_weeks'],
  learning: ['current_state', 'target_state', 'target_timeframe_weeks'],
  personal: ['current_state', 'target_state', 'target_timeframe_weeks'],
};

const REQUIRED_INTAKE_FIELD_GROUPS_BY_CATEGORY: Record<string, string[][]> = {
  health: [
    ['target_timeframe_weeks'],
    ['current_weight_kg', 'current_state'],
    ['target_weight_kg', 'target_state'],
  ],
  financial: [
    ['target_timeframe_weeks'],
    ['current_net_worth', 'current_state'],
    ['target_net_worth', 'target_state'],
  ],
  relationships: [
    ['current_relationship_state'],
    ['target_relationship_outcome'],
    ['target_timeframe_weeks'],
  ],
  career: [
    ['current_state'],
    ['target_state'],
    ['target_timeframe_weeks'],
  ],
  learning: [
    ['current_state'],
    ['target_state'],
    ['target_timeframe_weeks'],
  ],
  personal: [
    ['current_state'],
    ['target_state'],
    ['target_timeframe_weeks'],
  ],
};

const ALLOWED_GOAL_CATEGORIES = new Set([
  'health',
  'career',
  'learning',
  'personal',
  'financial',
  'relationships',
]);

const normalizeGoalCategory = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (ALLOWED_GOAL_CATEGORIES.has(normalized)) return normalized;
  return 'personal';
};

const inferCanonicalFieldKey = (
  category: string,
  rawFieldKey: unknown,
  questionText: string
): string => {
  const normalizedRaw = normalizeFieldKey(rawFieldKey);
  if (normalizedRaw && INTAKE_FIELD_ALIAS_LOOKUP.has(normalizedRaw)) {
    return INTAKE_FIELD_ALIAS_LOOKUP.get(normalizedRaw)!;
  }
  if (normalizedRaw) {
    return normalizedRaw;
  }

  const categoryRequired = REQUIRED_INTAKE_FIELDS_BY_CATEGORY[category] || REQUIRED_INTAKE_FIELDS_BY_CATEGORY.personal;
  for (const requiredKey of categoryRequired) {
    const hints = INTAKE_FIELD_HINTS[requiredKey] || [];
    if (hints.some((pattern) => pattern.test(questionText))) {
      return requiredKey;
    }
  }

  for (const [canonical, patterns] of Object.entries(INTAKE_FIELD_HINTS)) {
    if (patterns.some((pattern) => pattern.test(questionText))) {
      return canonical;
    }
  }

  return normalizedRaw || `${slugify(questionText).slice(0, 40)}_field`;
};

const sanitizeIntakeQuestions = (
  goalTitle: string,
  category: string,
  questions: unknown
): IntakeQuestion[] => {
  if (!Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  const sanitized = questions
    .map((raw: any, index) => {
      const questionText = typeof raw?.question === 'string' ? raw.question.trim() : '';
      const type = coerceQuestionType(raw?.type);
      if (!questionText) return null;

      const baseId = typeof raw?.id === 'string' && raw.id.trim().length > 0
        ? raw.id
        : `${slugify(goalTitle)}_intake_${index + 1}`;
      const fieldKey = inferCanonicalFieldKey(category, raw?.fieldKey, questionText);

      return {
        id: baseId,
        fieldKey,
        question: questionText,
        helperText: typeof raw?.helperText === 'string' ? raw.helperText.trim() : undefined,
        placeholder: typeof raw?.placeholder === 'string' ? raw.placeholder.trim() : undefined,
        type,
        required: typeof raw?.required === 'boolean' ? raw.required : true,
        options: sanitizeQuestionOptions(raw?.options, baseId),
        min: Number.isFinite(Number(raw?.min)) ? Number(raw.min) : undefined,
        max: Number.isFinite(Number(raw?.max)) ? Number(raw.max) : undefined,
        unit: typeof raw?.unit === 'string' ? raw.unit.trim() : undefined,
        sensitivity: raw?.sensitivity === 'health' || raw?.sensitivity === 'finance' || raw?.sensitivity === 'relationships'
          ? raw.sensitivity
          : 'general',
      } as IntakeQuestion;
    })
    .filter(Boolean) as IntakeQuestion[];

  return sanitized.slice(0, 10);
};

function hasRequiredIntakeCoverage(
  category: string,
  questions: Array<{ fieldKey: string }>
): boolean {
  const requiredGroups = REQUIRED_INTAKE_FIELD_GROUPS_BY_CATEGORY[category]
    || REQUIRED_INTAKE_FIELD_GROUPS_BY_CATEGORY.personal;
  const fieldSet = new Set(
    (questions || [])
      .map((question) => question?.fieldKey)
      .filter((fieldKey): fieldKey is string => typeof fieldKey === 'string' && fieldKey.trim().length > 0)
  );

  return requiredGroups.every((group) => group.some((field) => fieldSet.has(field)));
}

const ensureRequiredIntakeCoverage = (
  category: string,
  questions: IntakeQuestion[]
): IntakeQuestion[] => {
  const requiredFields = REQUIRED_INTAKE_FIELDS_BY_CATEGORY[category] || REQUIRED_INTAKE_FIELDS_BY_CATEGORY.personal;
  const requiredFieldSet = new Set(requiredFields);
  const seenIds = new Set<string>();
  const deduped: IntakeQuestion[] = [];

  for (const question of questions) {
    if (!question?.id || seenIds.has(question.id)) continue;
    seenIds.add(question.id);
    deduped.push({
      ...question,
      required: requiredFieldSet.has(question.fieldKey) ? true : question.required,
    });
  }

  return deduped;
};

const normalizeAnalysisResult = (result: {
  goals: Array<{
    title: string;
    category: string;
    timeline: string;
    estimatedWeeks?: number;
    prerequisites: Array<{ label: string; description?: string; order?: number }>;
    intakeQuestions?: IntakeQuestion[];
  }>;
}) => {
  return {
    ...result,
    goals: result.goals.map((goal) => {
      const normalizedCategory = normalizeGoalCategory(goal.category);
      const sanitizedQuestions = ensureRequiredIntakeCoverage(
        normalizedCategory,
        sanitizeIntakeQuestions(goal.title, normalizedCategory, goal.intakeQuestions)
      );

      if (sanitizedQuestions.length < 3) {
        throw new Error(`Goal "${goal.title}" returned fewer than 3 valid intake questions.`);
      }

      if (!hasRequiredIntakeCoverage(normalizedCategory, sanitizedQuestions)) {
        throw new Error(`Goal "${goal.title}" is missing required intake question fields for category "${normalizedCategory}".`);
      }

      return {
        ...goal,
        category: normalizedCategory,
        intakeQuestions: sanitizedQuestions,
      };
    }),
  };
};

const parseAnalysisResponse = (raw: unknown): any | null => {
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
      // Try next candidate
    }
  }

  return null;
};

const buildAnalysisRepairPrompt = (
  ambitionText: string,
  existingGoals: AnalyzeAmbitionsRequest['existingGoals'],
  isAddGoalMode: boolean,
  rawResponse: unknown,
  validationError?: string
): string => {
  const rawText = typeof rawResponse === 'string'
    ? rawResponse
    : JSON.stringify(rawResponse || {});
  const clippedRawText = rawText.length > 18000 ? `${rawText.slice(0, 18000)}...` : rawText;

  const existingGoalTitles = Array.isArray(existingGoals)
    ? existingGoals
      .map((goal) => goal?.title)
      .filter((title): title is string => typeof title === 'string' && title.trim().length > 0)
      .slice(0, 20)
    : [];

  return `You are a strict JSON repair engine.
Your task: repair/transform the candidate output into a valid analyze-ambitions response JSON.

USER AMBITION:
"${ambitionText}"

${existingGoalTitles.length > 0 ? `EXISTING ACTIVE GOALS (avoid duplicates in add-goal mode):
${existingGoalTitles.map((title, index) => `${index + 1}. ${title}`).join('\n')}
` : ''}

ADD GOAL MODE: ${isAddGoalMode ? 'true' : 'false'}
PREVIOUS VALIDATION ERROR: ${validationError || 'unknown'}

CANDIDATE OUTPUT TO REPAIR:
${clippedRawText}

REQUIRED OUTPUT JSON SHAPE:
{
  "goals": [
    {
      "title": "string",
      "originalInput": "string",
      "category": "health|career|learning|personal|financial|relationships",
      "timeline": "string",
      "estimatedWeeks": 1,
      "prerequisites": [{ "label": "string", "order": 1 }],
      "intakeQuestions": [
        {
          "id": "string",
          "fieldKey": "string",
          "question": "string",
          "type": "short_text|long_text|number|single_select|multi_select|boolean|date",
          "required": true,
          "helperText": "string (optional)",
          "placeholder": "string (optional)",
          "options": [{ "id": "string", "label": "string", "value": "string" }],
          "min": 0,
          "max": 100,
          "unit": "string",
          "sensitivity": "general|health|finance|relationships"
        }
      ]
    }
  ]
}

STRICT REQUIREMENTS:
- 1 to ${DATA_LIMITS.MAX_GOALS} goals.
- Each goal needs 5-10 prerequisites with non-empty labels and ascending order.
- Each goal needs 3-6 intakeQuestions.
- Required fieldKey coverage by category:
  - health: target_timeframe_weeks + either (current_weight_kg + target_weight_kg) OR (current_state + target_state)
  - financial: target_timeframe_weeks + either (current_net_worth + target_net_worth) OR (current_state + target_state)
  - relationships: current_relationship_state, target_relationship_outcome, target_timeframe_weeks
  - career/learning/personal: current_state, target_state, target_timeframe_weeks
- Lifestyle, age, income, and expense questions are encouraged when relevant but not mandatory.
- For single_select or multi_select, provide non-empty options.
- If add-goal mode is true, do not output duplicates of existing active goal titles.

Return ONLY valid JSON. No markdown or extra text.`;
};

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(requestOrigin) });
  }

  const requestId = getRequestId(req);
  const responseContext = { requestId, origin: requestOrigin || undefined };

  try {
    // Verify authentication
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'No user found', { requestId });
      return Errors.unauthorized(undefined, responseContext);
    }

    // Parse request body
    const {
      ambitionText,
      userProfile,
      existingGoals = [],
      isAddGoalMode = false,
    }: AnalyzeAmbitionsRequest = await req.json();

    if (!ambitionText || ambitionText.trim().length === 0) {
      logError(FUNCTION_NAME, 'MISSING_FIELD', 'ambitionText is required', { requestId, userId: user.id });
      return Errors.missingField('ambitionText', responseContext);
    }

    logInfo(FUNCTION_NAME, 'Processing request', {
      requestId,
      userId: user.id,
      textLength: ambitionText.length,
      existingGoalsCount: Array.isArray(existingGoals) ? existingGoals.length : 0,
      isAddGoalMode: !!isAddGoalMode,
    });

    // Build prompt for Gemini
    const prompt = buildAnalysisPrompt(ambitionText, userProfile, existingGoals, !!isAddGoalMode);

    // Call Gemini API. Intake questions must come from AI; do not silently substitute generic fallbacks.
    let rawAnalysisResult: any;
    try {
      // Planning/intake generation should be low-variance and specific.
      rawAnalysisResult = await callGemini(prompt, { temperature: 0.1 });
    } catch (geminiError: any) {
      logError(FUNCTION_NAME, 'GEMINI_ERROR', geminiError?.message || String(geminiError), {
        requestId,
        userId: user.id,
      });
      return Errors.geminiError(
        'AI intake generation is temporarily unavailable. Please retry in a moment.',
        responseContext
      );
    }

    const attemptNormalize = (candidate: unknown): ReturnType<typeof normalizeAnalysisResult> => {
      const parsed = parseAnalysisResponse(candidate);
      if (!isValidAnalysisResult(parsed)) {
        throw new Error('Invalid AI analysis response shape');
      }
      return normalizeAnalysisResult(parsed);
    };

    let normalizedResult: ReturnType<typeof normalizeAnalysisResult>;
    let primaryValidationError: string | undefined;

    try {
      normalizedResult = attemptNormalize(rawAnalysisResult);
    } catch (normalizationError: any) {
      primaryValidationError = normalizationError?.message || 'Failed to normalize AI intake response';
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', primaryValidationError, {
        requestId,
        userId: user.id,
        stage: 'primary',
      });

      let repairedRawResult: unknown;
      const repairPrompt = buildAnalysisRepairPrompt(
        ambitionText,
        existingGoals,
        !!isAddGoalMode,
        rawAnalysisResult,
        primaryValidationError
      );

      try {
        repairedRawResult = await callGemini(repairPrompt, { temperature: 0.1 });
      } catch (repairGeminiError: any) {
        logError(FUNCTION_NAME, 'GEMINI_ERROR', repairGeminiError?.message || String(repairGeminiError), {
          requestId,
          userId: user.id,
          stage: 'repair',
          primaryValidationError,
        });
        return Errors.geminiError(
          'AI intake generation is temporarily unavailable. Please retry in a moment.',
          responseContext
        );
      }

      try {
        normalizedResult = attemptNormalize(repairedRawResult);
      } catch (repairValidationError: any) {
        const repairErrorMessage = repairValidationError?.message || 'Failed to normalize repaired AI intake response';
        logError(FUNCTION_NAME, 'VALIDATION_ERROR', repairErrorMessage, {
          requestId,
          userId: user.id,
          stage: 'repair',
          primaryValidationError,
        });
        return Errors.validationError(
          'AI returned an invalid intake/question structure. Please retry.',
          responseContext
        );
      }
    }

    logInfo(FUNCTION_NAME, 'Analysis complete', { requestId, userId: user.id, goalsCount: normalizedResult?.goals?.length || 0 });

    // Return success response
    return createSuccessResponse(normalizedResult, responseContext);

  } catch (error) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message, { requestId, stack: error.stack });
    return Errors.internalError('Failed to analyze ambitions: ' + error.message, responseContext);
  }
});

function buildAnalysisPrompt(
  ambitionText: string,
  userProfile?: AnalyzeAmbitionsRequest['userProfile'],
  existingGoals: AnalyzeAmbitionsRequest['existingGoals'] = [],
  isAddGoalMode = false
) {
  const profileContext = userProfile ? `
## USER CONTEXT
${userProfile.name ? `- Name: ${userProfile.name}` : ''}
${userProfile.role ? `- Role/Profession: ${userProfile.role}` : ''}
${userProfile.bio ? `- Life Context: ${userProfile.bio}` : ''}
${userProfile.chronotype ? `- Productivity Style: ${userProfile.chronotype}` : ''}
${userProfile.energyLevel ? `- Energy Level: ${userProfile.energyLevel}` : ''}
` : '';

  const existingGoalsContext = Array.isArray(existingGoals) && existingGoals.length > 0
    ? `
## EXISTING ACTIVE GOALS
${existingGoals.slice(0, 12).map((goal, index) =>
      `${index + 1}. ${goal?.title || 'Untitled'} (${goal?.category || 'unknown'}) - ${goal?.timeline || `${goal?.estimatedWeeks || '?'} weeks`} | status: ${goal?.status || 'unknown'} | cadence: ${goal?.frequency || '?'}x/week @ ${goal?.duration || '?'} min`
    ).join('\n')}
- These goals are already in flight. Avoid duplicates and account for overlapping commitments.
`
    : '';

  return `You are a manifestation coach AI - helping users understand what it takes to achieve their dreams.
Your role is to analyze their manifestations and create a clear picture of the journey ahead.

${profileContext}
${existingGoalsContext}

## USER'S MANIFESTATION DREAMS
"${ambitionText}"

## YOUR ANALYSIS TASK

**Step 1: Identify Distinct Manifestations**
Parse the user's input and identify separate, independent goals. One sentence might contain multiple goals.
Maximum ${DATA_LIMITS.MAX_GOALS} manifestations.

**Step 2: Categorize Each Manifestation**
Use ONLY these categories:
- health (fitness, nutrition, medical, mental health, wellness)
- career (job, promotion, professional skills, business, side hustles)
- learning (education, courses, skills, languages, certifications)
- personal (hobbies, lifestyle, habits, creativity)
- financial (savings, investments, income, debt freedom)
- relationships (family, friends, networking, dating, community)

**Step 3: Estimate Realistic Timeline**
Based on complexity and user's context:
- Minimum ${DATA_LIMITS.MIN_TIMELINE_WEEKS} weeks
- Maximum ${DATA_LIMITS.MAX_TIMELINE_WEEKS} weeks
- Be realistic, not optimistic

	**Step 4: Generate Preliminary Prerequisites Checklist**
	For EACH manifestation, create ${DATA_LIMITS.MIN_PREREQUISITES_PER_GOAL}-${DATA_LIMITS.MAX_PREREQUISITES_PER_GOAL} prerequisites:
	- These are preliminary foundation steps the user might have already done
	- Order from BEGINNER (order: 1) to ADVANCED (highest number)
	- Make them SPECIFIC to the goal domain (not generic)
	- Use the user's role/bio ONLY to adapt realism (time, money, environment) — don’t assume the goal matches their profession
	- User will check off what they've already achieved
	- These items are a draft baseline and may be regenerated after intake answers for personalization

			**Step 5: Generate Dynamic Intake Questions**
			For EACH manifestation, create the MINIMUM number of discovery questions needed to build an accurate, non-generic plan.
			- Typical range: 4-10 questions. Simple logistics can be 3-5; complex ambitions can be 7-10.
			- Questions MUST be specific to the goal domain and the user's segment implied by the goal.
			- Use typed schema so UI can render deterministic inputs.
			- Use sensible types: short_text, long_text, number, single_select, multi_select, boolean, date.
			- Avoid generic, recycled question sets. Each goal should feel tailored.
			- Field keys must be stable and reusable by downstream planning logic; do not invent random keys for core fields.
			- IMPORTANT: you may add extra domain-specific fieldKeys beyond the required ones when needed for quality.
			- Your questions should surface the plan-shaping unknowns, but stay fluid (do not force the same template every time):
			  - Definition of done / success criteria
			  - Baseline (what exists today)
			  - Constraints (time, money, energy, environment)
			  - Dependencies / resources / stakeholders (when relevant)
			  - Timeline flexibility (hard deadline vs flexible)
			  - Measurement / KPIs / feedback loop (when relevant)
			  - Risks / edge cases (when relevant)
		- If category is health, required keys must include target_timeframe_weeks and either:
		  a) current_weight_kg + target_weight_kg (weight goals), or
		  b) current_state + target_state (other health goals like endurance/strength).
		- If category is financial, required keys must include target_timeframe_weeks and either:
		  a) current_net_worth + target_net_worth, or
		  b) current_state + target_state.
		- If category is relationships, required field keys must include: current_relationship_state, target_relationship_outcome, target_timeframe_weeks.
		- If category is career/learning/personal, required field keys must include: current_state, target_state, target_timeframe_weeks.
		- Every manifestation MUST include a required target timeframe question (weeks/date target).
			- For health goals, include additional context questions (for example lifestyle pattern, age group, constraints) when helpful.
			- For financial goals, include additional context questions (for example monthly income, monthly expenses, savings behavior) when helpful.
			- For relationship goals, include context, boundaries, and timeframe for reassessment when helpful.
		- If the user requested an extreme/impossible deadline, still ask clarifying questions and keep timeline realistic in output.

## OUTPUT FORMAT (JSON)
{
  "goals": [
    {
      "title": "Clear, inspiring manifestation title (not too long)",
      "originalInput": "The specific phrase from user input that relates to this",
      "category": "health|career|learning|personal|financial|relationships",
      "timeline": "e.g., 6 months",
      "estimatedWeeks": 24,
      "prerequisites": [
        { "label": "Beginner foundation step (most basic)", "order": 1 },
        { "label": "Next logical step up", "order": 2 },
        { "label": "Intermediate milestone", "order": 3 },
        { "label": "More advanced requirement", "order": 4 },
        { "label": "Near-completion level", "order": 5 },
        { "label": "Final prerequisite before full competency", "order": 6 }
      ],
	      "intakeQuestions": [
	        {
	          "id": "goal_current_state",
	          "fieldKey": "current_state",
	          "question": "Where are you currently for this goal?",
	          "helperText": "Include measurable baseline if available.",
	          "type": "long_text",
	          "required": true,
	          "sensitivity": "general"
	        },
	        {
	          "id": "goal_target_state",
	          "fieldKey": "target_state",
	          "question": "What exact outcome do you want?",
	          "type": "short_text",
	          "required": true,
	          "sensitivity": "general"
	        },
	        {
	          "id": "goal_timeframe",
	          "fieldKey": "target_timeframe_weeks",
	          "question": "By when do you want to achieve this goal?",
	          "type": "number",
	          "required": true,
	          "min": 1,
	          "max": 520,
	          "unit": "weeks",
	          "sensitivity": "general"
	        }
	      ]
    }
  ]
}

## EXAMPLE for "I want to get a visa to work abroad"
{
  "goals": [
    {
      "title": "Secure Work Visa for International Career",
      "originalInput": "get a visa to work abroad",
      "category": "career",
      "timeline": "6 months",
      "estimatedWeeks": 26,
      "prerequisites": [
        { "label": "Research target countries and their visa requirements", "order": 1 },
        { "label": "Ensure passport is valid for at least 2 years", "order": 2 },
        { "label": "Gather educational documents and transcripts", "order": 3 },
        { "label": "Get professional work experience letters", "order": 4 },
        { "label": "Take required language proficiency tests (IELTS/TOEFL)", "order": 5 },
        { "label": "Build a portfolio or proof of specialized skills", "order": 6 },
        { "label": "Connect with potential employers in target country", "order": 7 },
        { "label": "Understand financial requirements and proof of funds", "order": 8 }
      ]
    }
  ]
}

	## IMPORTANT RULES:
	- Prerequisites should progress logically from absolute beginner to advanced
	- Be SPECIFIC - not "learn basics" but "Complete introductory course on X"
	- If the user’s profession is unrelated (e.g., a doctor learning salsa), don’t force profession-specific steps; keep prerequisites grounded in the goal itself
	- Include at least one prerequisite about time commitment (e.g., setting a realistic weekly cadence) and one about access/resources (e.g., equipment, classes, workspace) when relevant
	- Treat prerequisites as a preliminary status-check draft; downstream flow may regenerate them after intake responses
	- Keep timelines honest. Do not promise impossible outcomes.
	- Refuse unsafe/illegal intent and steer to safe alternatives.
	- Each manifestation MUST have its own prerequisites array
	- Each manifestation MUST include intakeQuestions with enough questions to plan accurately (typically 4-10)
	- Avoid duplicate intake questions across manifestations unless truly necessary
	- For complex goals, cover all major requirement areas
	- Make prerequisites things user can "check off" as already done or not
	- If this is add-goal mode (${isAddGoalMode ? 'true' : 'false'}), avoid creating goals that are duplicates of existing active goals

Return ONLY valid JSON, no markdown.`;
}
