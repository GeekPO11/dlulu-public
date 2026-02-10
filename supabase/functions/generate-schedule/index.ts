// =============================================================================
// GENERATE SCHEDULE - Edge Function
// Creates calendar events for all tasks/subtasks in a goal
// 
// ARCHITECTURE:
// - AI does NOT calculate dates/times (AI is bad at date math)
// - We deterministically calculate available time slots
// - We assign tasks to slots in order
// - This ensures correct, non-overlapping events
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { resolveEntitlements } from '../_shared/entitlements.ts';
import { track } from '../_shared/analytics.ts';
import { logInfo, logWarn, logError, Errors, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'generate-schedule';

const createUpgradeResponse = (
  message: string,
  requestId?: string,
  corsHeaders?: Record<string, string>
) => {
  const body = {
    success: false,
    error: {
      errorcode: 403000,
      errorkey: 'upgrade_required',
      errormessage: message,
    },
    upgrade: {
      reason: 'calendar_sync',
      cta_label: 'Upgrade to Pro',
      cta_url: '/pricing',
    },
  };

  return new Response(JSON.stringify(body), {
    status: 403,
    headers: {
      ...(corsHeaders || {}),
      'Content-Type': 'application/json',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
  });
};

// =============================================================================
// TYPES
// =============================================================================

interface TaskItem {
  id: string;
  title: string;
  phaseId: string;
  phaseTitle: string;
  phaseNumber: number;
  phaseStartWeek: number;
  phaseEndWeek: number;
  milestoneId: string;
  milestoneTitle: string;
  milestoneOrder: number;
  milestoneTargetWeek: number | null;
  taskId?: string;  // Task table ID (if scheduling a subtask)
  taskTitle?: string;
  subtaskId?: string;  // Subtask table ID
  order: number;
  durationMinutes: number;
  cognitiveType: CognitiveType;
  difficulty: number; // 1-5
}

type CognitiveType = 'deep_work' | 'shallow_work' | 'learning' | 'creative' | 'admin';

interface PlannedSession {
  phaseId: string;
  phaseTitle: string;
  phaseNumber: number;
  milestoneId: string;
  milestoneTitle: string;
  milestoneTargetWeek: number | null;
  items: TaskItem[];
  totalItemMinutes: number;
  cognitiveType: CognitiveType;
  difficulty: number;
}

interface PhaseSchedulePlan {
  phaseId: string;
  phaseTitle: string;
  phaseNumber: number;
  phaseStartWeek: number;
  phaseEndWeek: number;
  scheduleStartIndex: number; // 0-based week index in the generated calendar window
  scheduleEndIndex: number; // inclusive
  sessions: PlannedSession[];
}

interface TimeSlot {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  dayOfWeek: number; // JavaScript day: 0=Sun, 1=Mon, ... (converted from dlulu 0=Mon system)
}

interface UserConstraints {
  sleepStart: string;
  sleepEnd: string;
  peakStart: string;
  peakEnd: string;
  workBlocks: Array<{
    title: string;
    days: number[];
    start: string;
    end: string;
    weekPattern?: 'default' | 'A' | 'B';
    timezone?: string;
  }>;
  blockedSlots: Array<{
    title: string;
    days: number[];
    start: string;
    end: string;
    weekPattern?: 'default' | 'A' | 'B';
    timezone?: string;
  }>;
  timeExceptions?: Array<{
    date: string; // YYYY-MM-DD
    start: string; // HH:mm
    end: string; // HH:mm
    isBlocked: boolean;
    reason?: string;
  }>;
}

// =============================================================================
// SCHEDULING INTELLIGENCE HELPERS
// =============================================================================

const VALID_COGNITIVE_TYPES: CognitiveType[] = [
  'deep_work',
  'shallow_work',
  'learning',
  'creative',
  'admin',
];

function normalizeCognitiveType(value: unknown): CognitiveType | null {
  if (typeof value !== 'string') return null;
  return (VALID_COGNITIVE_TYPES as string[]).includes(value) ? (value as CognitiveType) : null;
}

function clampInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return Math.max(min, Math.min(max, i));
}

function getPhaseNumber(phase: any): number {
  return clampInt(phase?.phase_number ?? phase?.number ?? phase?.phaseNumber, 1, 10_000) ?? 1;
}

function getPhaseStartWeek(phase: any): number {
  return clampInt(phase?.start_week ?? phase?.startWeek, 1, 10_000) ?? 1;
}

function getPhaseEndWeek(phase: any): number {
  const start = getPhaseStartWeek(phase);
  return clampInt(phase?.end_week ?? phase?.endWeek, start, 10_000) ?? start;
}

function getMilestoneOrder(milestone: any): number {
  return clampInt(milestone?.display_order ?? milestone?.displayOrder ?? milestone?.order, 0, 1_000_000) ?? 0;
}

function getMilestoneTargetWeek(milestone: any): number | null {
  const v = milestone?.target_week ?? milestone?.targetWeek;
  return clampInt(v, 1, 10_000);
}

function getTaskDisplayOrder(task: any): number {
  return clampInt(task?.display_order ?? task?.displayOrder ?? task?.order, 0, 1_000_000) ?? 0;
}

function inferCognitiveTypeFromTitle(title: string): CognitiveType {
  const t = (title || '').toLowerCase();

  if (/(register|sign\s*up|login|log\s*in|fill|form|submit|pay|purchase|order|book|schedule|email|call|text|dm|message|follow\s*up|update|sync|invite)/i.test(t)) {
    return 'admin';
  }
  if (/(research|analy(?:ze|sis)|investigate|read|watch|learn|study|practice|revise|review|notes|course|tutorial)/i.test(t)) {
    return 'learning';
  }
  if (/(design|brainstorm|ideate|outline|draft|write|create|sketch|prototype|edit|compose)/i.test(t)) {
    return 'creative';
  }
  if (/(implement|build|develop|code|refactor|debug|fix|configure|set\s*up|integrate|deploy|optimi(?:ze|sation))/i.test(t)) {
    return 'deep_work';
  }

  return 'shallow_work';
}

function inferEstimatedMinutesFromTitle(title: string, cognitiveType: CognitiveType): number {
  const t = (title || '').toLowerCase();

  // Very small "admin-ish" actions often fit 5–15 minutes.
  if (/(register|sign\s*up|fill|form|email|call|text|dm|follow\s*up|confirm|check|update|sync)/i.test(t)) {
    return 10;
  }

  if (/(research|analy(?:ze|sis)|design|implement|build|develop|deploy)/i.test(t)) {
    return cognitiveType === 'learning' ? 45 : 60;
  }

  // Title length is a weak proxy for scope.
  if ((title || '').length > 80) return 60;
  if ((title || '').length > 50) return 45;

  // Default minutes by type
  switch (cognitiveType) {
    case 'admin':
      return 10;
    case 'shallow_work':
      return 20;
    case 'learning':
      return 30;
    case 'creative':
      return 45;
    case 'deep_work':
      return 60;
  }
}

function inferDifficultyFromTitle(title: string, cognitiveType: CognitiveType): number {
  const t = (title || '').toLowerCase();

  let base =
    cognitiveType === 'admin' ? 1 :
      cognitiveType === 'shallow_work' ? 2 :
        cognitiveType === 'learning' ? 3 :
          cognitiveType === 'creative' ? 3 :
            4;

  if (/(hard|complex|difficult|advanced|optimi(?:ze|sation)|refactor|debug|migrate)/i.test(t)) base += 1;
  if (/(quick|simple|easy|minor|small)/i.test(t)) base -= 1;

  return Math.max(1, Math.min(5, base));
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(requestOrigin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = getRequestId(req);
  const responseContext = { requestId, origin: requestOrigin || undefined };
  const responseHeaders = {
    ...corsHeaders,
    'Content-Type': 'application/json',
    ...(requestId ? { 'x-request-id': requestId } : {}),
  };

  try {
    const { user, error: authError, supabase } = await verifyAuth(req);
    if (authError || !user || !supabase) {
      logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'No user found', { requestId });
      return Errors.unauthorized(undefined, responseContext);
    }

    const { goalId, startDate, timezone, userConstraints } = await req.json();
    const tz = timezone || 'UTC';

    if (!goalId || !startDate) {
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'goalId and startDate required', { requestId, userId: user.id });
      return Errors.validationError('goalId and startDate required', responseContext);
    }

    const { entitlements } = await resolveEntitlements(supabase, user.id);
    if (!entitlements.calendar_sync_enabled) {
      track('feature_gated', { feature: 'calendar_sync', plan_id: entitlements.plan_id }, { functionName: FUNCTION_NAME, requestId, userId: user.id });
      return createUpgradeResponse('Calendar sync requires Pro.', requestId, corsHeaders);
    }

    const baseLogContext = { requestId, userId: user.id, goalId };
    const logInfoArgs = (message: string, ...args: unknown[]) =>
      logInfo(FUNCTION_NAME, message, { ...baseLogContext, args });
    const logWarnArgs = (message: string, ...args: unknown[]) =>
      logWarn(FUNCTION_NAME, message, { ...baseLogContext, args });
    const logErrorArgs = (message: string, ...args: unknown[]) =>
      logError(FUNCTION_NAME, 'INTERNAL_ERROR', message, { ...baseLogContext, args });

    logInfo(FUNCTION_NAME, 'Starting schedule generation', { ...baseLogContext, startDate, timezone: tz });

    logInfoArgs('='.repeat(60));
    logInfoArgs('[SCHEDULE] Starting for goal:', goalId);
    logInfoArgs('[SCHEDULE] Start date:', startDate);
    logInfoArgs('[SCHEDULE] Timezone:', tz);
    logInfoArgs('='.repeat(60));

    // =========================================================================
    // STEP 1: Load goal with all tasks (phases → milestones → tasks → subtasks)
    // =========================================================================
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select(`
        *,
        phases (
          *,
          milestones (
            *,
            tasks (*,
              subtasks (*)
            ),
            subtasks (*)
          )
        )
      `)
      .eq('id', goalId)
      .single();

    if (goalError || !goal) {
      logError(FUNCTION_NAME, 'GOAL_NOT_FOUND', 'Goal not found', { ...baseLogContext, goalError });
      return Errors.notFound('Goal', responseContext);
    }

    const maxPhaseEndWeek = Math.max(0, ...(goal.phases || []).map((p: any) => getPhaseEndWeek(p)));
    const goalWeeks = Math.max(Number(goal.estimated_weeks || 0), maxPhaseEndWeek, 12);
    logInfoArgs('[SCHEDULE] Goal:', goal.title);
    logInfoArgs('[SCHEDULE] Duration:', goalWeeks, 'weeks');
    logInfoArgs('[SCHEDULE] Phases:', goal.phases?.length || 0);

    // Debug: Log structure
    for (const phase of (goal.phases || [])) {
      logInfoArgs(`[SCHEDULE] Phase ${getPhaseNumber(phase)}: ${phase.title}`);
      logInfoArgs(`[SCHEDULE]   Milestones: ${phase.milestones?.length || 0}`);
      for (const m of (phase.milestones || [])) {
        logInfoArgs(`[SCHEDULE]     Milestone: ${m.title}`);
        logInfoArgs(`[SCHEDULE]       Tasks: ${m.tasks?.length || 0}, Subtasks: ${m.subtasks?.length || 0}`);
      }
    }

    // =========================================================================
    // STEP 2: Get user constraints (from request or DB)
    // =========================================================================
    let constraints: UserConstraints;

    if (userConstraints?.sleepStart) {
      constraints = userConstraints;
      logInfoArgs('[SCHEDULE] Using constraints from request');
    } else {
      logInfoArgs('[SCHEDULE] Loading constraints from DB...');
      const { data: dbConstraints } = await supabase
        .from('time_constraints')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const { data: dbTimeBlocks } = await supabase
        .from('time_blocks')
        .select('*')
        .eq('user_id', user.id);

      const { data: dbTimeExceptions } = await supabase
        .from('time_exceptions')
        .select('*')
        .eq('user_id', user.id);

      logInfoArgs('[SCHEDULE] DB constraints:', dbConstraints);
      logInfoArgs('[SCHEDULE] DB time blocks:', dbTimeBlocks?.length || 0);

      constraints = {
        // Defaults are only used if the user hasn't set constraints yet.
        sleepStart: dbConstraints?.sleep_start || '22:30',
        sleepEnd: dbConstraints?.sleep_end || '06:30',
        // Peak hours for high-energy tasks
        peakStart: dbConstraints?.peak_start || '09:00',
        peakEnd: dbConstraints?.peak_end || '12:00',
        workBlocks: (dbTimeBlocks || [])
          .filter((b: any) => b.block_type === 'work')
          .map((b: any) => ({
            title: b.title,
            // dlulu universal indexing: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
            days: b.days || [0, 1, 2, 3, 4], // Default weekdays (Mon-Fri)
            start: b.start_time || '09:00',
            end: b.end_time || '17:00',
            weekPattern: b.week_pattern || 'default',
            timezone: b.timezone || undefined,
          })),
        blockedSlots: (dbTimeBlocks || [])
          .filter((b: any) => b.block_type !== 'work')
          .map((b: any) => ({
            title: b.title,
            days: b.days || [],
            start: b.start_time,
            end: b.end_time,
            weekPattern: b.week_pattern || 'default',
            timezone: b.timezone || undefined,
          })),
        timeExceptions: (dbTimeExceptions || []).map((ex: any) => ({
          date: ex.date,
          start: ex.start_time,
          end: ex.end_time,
          isBlocked: ex.is_blocked ?? true,
          reason: ex.reason || undefined,
        })),
      };
    }

    logInfoArgs('[SCHEDULE] ======= USER CONSTRAINTS =======');
    logInfoArgs('[SCHEDULE] Sleep: bedtime', constraints.sleepStart, ', wake', constraints.sleepEnd);
    logInfoArgs('[SCHEDULE] Peak hours:', constraints.peakStart, '-', constraints.peakEnd);
    logInfoArgs('[SCHEDULE] Work blocks:', constraints.workBlocks.length);
    for (const wb of constraints.workBlocks) {
      logInfoArgs(`[SCHEDULE]   - ${wb.title}: ${wb.start}-${wb.end} on days ${wb.days.join(',')}`);
    }
    logInfoArgs('[SCHEDULE] Blocked slots:', constraints.blockedSlots.length);
    logInfoArgs('[SCHEDULE] =================================');

    // =========================================================================
    // STEP 3: Extract all tasks from goal
    // Hierarchy: Goal → Phase → Milestone → Task → Subtask
    // We schedule at the lowest level available (subtasks if present, else tasks, else milestones)
    // =========================================================================
    const tasks: TaskItem[] = [];
    let orderNum = 1;

    const sortedPhases = [...(goal.phases || [])].sort(
      (a: any, b: any) => getPhaseNumber(a) - getPhaseNumber(b)
    );

    for (const phase of sortedPhases) {
      const phaseNumber = getPhaseNumber(phase);
      const phaseStartWeek = getPhaseStartWeek(phase);
      const phaseEndWeek = getPhaseEndWeek(phase);

      const sortedMilestones = [...(phase.milestones || [])].sort(
        (a: any, b: any) => getMilestoneOrder(a) - getMilestoneOrder(b)
      );

      for (const milestone of sortedMilestones) {
        const milestoneOrder = getMilestoneOrder(milestone);
        const milestoneTargetWeek = getMilestoneTargetWeek(milestone);

        // New structure: milestone → tasks → subtasks
        const milestoneTasks = [...(milestone.tasks || [])].sort(
          (a: any, b: any) => getTaskDisplayOrder(a) - getTaskDisplayOrder(b)
        );

        // Legacy structure: milestone → subtasks (no tasks layer)
        const directSubtasks = [...(milestone.subtasks || [])].sort(
          (a: any, b: any) => getTaskDisplayOrder(a) - getTaskDisplayOrder(b)
        );

        if (milestoneTasks.length > 0) {
          for (const task of milestoneTasks) {
            if (task?.is_completed || task?.is_strikethrough) continue;

            const taskTitle = String(task.title || '').trim();
            if (!taskTitle) continue;

            const explicitTaskCognitive = normalizeCognitiveType(task?.cognitive_type ?? task?.cognitiveType);
            const taskCognitiveType = explicitTaskCognitive ?? inferCognitiveTypeFromTitle(taskTitle);

            const explicitTaskMinutes = clampInt(task?.estimated_minutes ?? task?.estimatedMinutes, 5, 600);
            const taskDurationMinutes = explicitTaskMinutes ?? inferEstimatedMinutesFromTitle(taskTitle, taskCognitiveType);

            const explicitTaskDifficulty = clampInt(task?.difficulty, 1, 5);
            const taskDifficulty = explicitTaskDifficulty ?? inferDifficultyFromTitle(taskTitle, taskCognitiveType);

            const taskSubtasks = [...(task.subtasks || [])].sort(
              (a: any, b: any) => getTaskDisplayOrder(a) - getTaskDisplayOrder(b)
            );

            if (taskSubtasks.length > 0) {
              const perSubtaskMinutes = Math.max(5, Math.round(taskDurationMinutes / taskSubtasks.length));

              for (const subtask of taskSubtasks) {
                if (subtask?.is_completed || subtask?.is_strikethrough) continue;
                const subtaskTitle = String(subtask.title || '').trim();
                if (!subtaskTitle) continue;

                const subCognitiveType = inferCognitiveTypeFromTitle(subtaskTitle);
                const subMinutes = clampInt(perSubtaskMinutes, 5, 240) ?? inferEstimatedMinutesFromTitle(subtaskTitle, subCognitiveType);
                const subDifficulty = inferDifficultyFromTitle(subtaskTitle, subCognitiveType);

                tasks.push({
                  id: subtask.id,
                  title: subtaskTitle,
                  phaseId: phase.id,
                  phaseTitle: phase.title,
                  phaseNumber,
                  phaseStartWeek,
                  phaseEndWeek,
                  milestoneId: milestone.id,
                  milestoneTitle: milestone.title,
                  milestoneOrder,
                  milestoneTargetWeek,
                  taskId: task.id,
                  taskTitle,
                  subtaskId: subtask.id,
                  order: orderNum++,
                  durationMinutes: subMinutes,
                  cognitiveType: subCognitiveType === 'shallow_work' ? taskCognitiveType : subCognitiveType,
                  difficulty: clampInt(subDifficulty, 1, 5) ?? taskDifficulty,
                });
              }
            } else {
              tasks.push({
                id: task.id,
                title: taskTitle,
                phaseId: phase.id,
                phaseTitle: phase.title,
                phaseNumber,
                phaseStartWeek,
                phaseEndWeek,
                milestoneId: milestone.id,
                milestoneTitle: milestone.title,
                milestoneOrder,
                milestoneTargetWeek,
                taskId: task.id,
                taskTitle,
                order: orderNum++,
                durationMinutes: clampInt(taskDurationMinutes, 5, 240) ?? 60,
                cognitiveType: taskCognitiveType,
                difficulty: taskDifficulty,
              });
            }
          }
        } else if (directSubtasks.length > 0) {
          for (const subtask of directSubtasks) {
            if (subtask?.is_completed || subtask?.is_strikethrough) continue;
            const subtaskTitle = String(subtask.title || '').trim();
            if (!subtaskTitle) continue;

            const subCognitiveType = inferCognitiveTypeFromTitle(subtaskTitle);
            const subMinutes = inferEstimatedMinutesFromTitle(subtaskTitle, subCognitiveType);
            const subDifficulty = inferDifficultyFromTitle(subtaskTitle, subCognitiveType);

            tasks.push({
              id: subtask.id,
              title: subtaskTitle,
              phaseId: phase.id,
              phaseTitle: phase.title,
              phaseNumber,
              phaseStartWeek,
              phaseEndWeek,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
              milestoneOrder,
              milestoneTargetWeek,
              subtaskId: subtask.id,
              order: orderNum++,
              durationMinutes: clampInt(subMinutes, 5, 240) ?? 30,
              cognitiveType: subCognitiveType,
              difficulty: clampInt(subDifficulty, 1, 5) ?? 3,
            });
          }
        } else {
          // No tasks or subtasks - schedule the milestone itself as a single "planning/working" session.
          if (milestone?.is_completed) continue;
          const milestoneTitle = String(milestone.title || '').trim();
          if (!milestoneTitle) continue;

          const mCognitiveType = inferCognitiveTypeFromTitle(milestoneTitle);
          const mMinutes = inferEstimatedMinutesFromTitle(milestoneTitle, mCognitiveType);
          const mDifficulty = inferDifficultyFromTitle(milestoneTitle, mCognitiveType);

          tasks.push({
            id: milestone.id,
            title: milestoneTitle,
            phaseId: phase.id,
            phaseTitle: phase.title,
            phaseNumber,
            phaseStartWeek,
            phaseEndWeek,
            milestoneId: milestone.id,
            milestoneTitle: milestoneTitle,
            milestoneOrder,
            milestoneTargetWeek,
            order: orderNum++,
            durationMinutes: clampInt(mMinutes, 5, 240) ?? 60,
            cognitiveType: mCognitiveType,
            difficulty: clampInt(mDifficulty, 1, 5) ?? 3,
          });
        }
      }
    }

    if (tasks.length === 0) {
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'No tasks to schedule', baseLogContext);
      return Errors.validationError('No tasks found to schedule', responseContext);
    }

    logInfoArgs('[SCHEDULE] Total tasks to schedule:', tasks.length);
    logInfoArgs('[SCHEDULE] First 3 tasks:', tasks.slice(0, 3).map(t => t.title));

    // =========================================================================
    // STEP 4: Plan sessions (phase windows + milestone batching)
    // - Force Phase 1 tasks into Phase 1 weeks, Phase 2 into Phase 2, etc.
    // - Batch small "admin/shallow" items into sessions up to goal.duration
    // - Keep deep_work/learning/creative separated for focus
    // =========================================================================
    const sessionsPerWeek = Math.max(1, Number(goal.frequency || 3));
    const minutesPerSession = Math.max(15, Number(goal.duration || 60));

    const isLightType = (ct: CognitiveType) => ct === 'admin' || ct === 'shallow_work';
    const sessionGroupKey = (ct: CognitiveType) => (isLightType(ct) ? 'light' : ct);

    const maxItemsForGroup = (group: string) => {
      if (group === 'light') return 8;
      if (group === 'deep_work') return 2;
      if (group === 'learning') return 3;
      if (group === 'creative') return 3;
      return 3;
    };

    const splitIntoChunks = (item: TaskItem): TaskItem[] => {
      const mins = clampInt(item.durationMinutes, 5, 600) ?? 30;
      if (mins <= minutesPerSession) return [{ ...item, durationMinutes: mins }];

      const parts = Math.ceil(mins / minutesPerSession);
      const chunks: TaskItem[] = [];
      for (let part = 1; part <= parts; part++) {
        const remaining = mins - (part - 1) * minutesPerSession;
        const chunkMinutes = Math.min(minutesPerSession, remaining);
        chunks.push({
          ...item,
          id: `${item.id}::part${part}/${parts}`,
          title: `${item.title} (Part ${part}/${parts})`,
          durationMinutes: chunkMinutes,
        });
      }
      return chunks;
    };

    const expandItems = (items: TaskItem[]) => items.flatMap(splitIntoChunks);

    const pickSessionCognitiveType = (items: TaskItem[]): CognitiveType => {
      const counts: Record<string, number> = {};
      for (const it of items) {
        counts[it.cognitiveType] = (counts[it.cognitiveType] || 0) + 1;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      return normalizeCognitiveType(top) || 'shallow_work';
    };

    const planSessionsForMilestone = (milestoneItems: TaskItem[]): PlannedSession[] => {
      const sessions: PlannedSession[] = [];
      const items = expandItems(milestoneItems).sort((a, b) => a.order - b.order);

      let current: TaskItem[] = [];
      let currentMinutes = 0;
      let currentGroup: string | null = null;

      const flush = () => {
        if (current.length === 0) return;
        const cognitiveType = pickSessionCognitiveType(current);
        sessions.push({
          phaseId: current[0].phaseId,
          phaseTitle: current[0].phaseTitle,
          phaseNumber: current[0].phaseNumber,
          milestoneId: current[0].milestoneId,
          milestoneTitle: current[0].milestoneTitle,
          milestoneTargetWeek: current[0].milestoneTargetWeek ?? null,
          items: current,
          totalItemMinutes: current.reduce((s, it) => s + (it.durationMinutes || 0), 0),
          cognitiveType,
          difficulty: Math.max(...current.map((it) => clampInt(it.difficulty, 1, 5) ?? 3)),
        });
        current = [];
        currentMinutes = 0;
        currentGroup = null;
      };

      for (const it of items) {
        const group = sessionGroupKey(it.cognitiveType);
        if (!currentGroup) currentGroup = group;

        const wouldExceedMinutes = currentMinutes + it.durationMinutes > minutesPerSession;
        const wouldExceedItems = current.length >= maxItemsForGroup(currentGroup);

        if (currentGroup !== group || wouldExceedMinutes || wouldExceedItems) {
          flush();
          currentGroup = group;
        }

        current.push(it);
        currentMinutes += it.durationMinutes;
      }

      flush();
      return sessions;
    };

    // Build a phase → sessions plan, maintaining Phase → Milestone ordering.
    const phaseEntries: Array<{ phaseIndex: number; phase: any; sessions: PlannedSession[] }> = [];
    for (let i = 0; i < sortedPhases.length; i++) {
      const phase = sortedPhases[i];
      const sortedMilestones = [...(phase.milestones || [])].sort(
        (a: any, b: any) => getMilestoneOrder(a) - getMilestoneOrder(b)
      );

      const phaseSessions: PlannedSession[] = [];
      for (const milestone of sortedMilestones) {
        const milestoneItems = tasks.filter((t) => t.milestoneId === milestone.id);
        if (milestoneItems.length === 0) continue;
        phaseSessions.push(...planSessionsForMilestone(milestoneItems));
      }

      if (phaseSessions.length > 0) {
        phaseEntries.push({ phaseIndex: i, phase, sessions: phaseSessions });
      }
    }

    if (phaseEntries.length === 0) {
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'No sessions could be planned', baseLogContext);
      return Errors.validationError('No sessions could be planned from tasks', responseContext);
    }

    // Progress-aware anchor: start scheduling from the earliest phase with remaining work.
    const basePhaseIndex = Math.min(...phaseEntries.map((p) => p.phaseIndex));
    const basePhase = sortedPhases[basePhaseIndex];
    const baseWeekOffset = getPhaseStartWeek(basePhase) - 1; // 1-indexed → 0-indexed week offset

    // Convert blueprint weeks → calendar window indices, extending only if a phase can't fit its sessions.
    const phasePlans: PhaseSchedulePlan[] = [];
    let cumulativeWeekShift = 0;
    for (const entry of phaseEntries) {
      const phase = entry.phase;
      const phaseNumber = getPhaseNumber(phase);
      const phaseStartWeek = getPhaseStartWeek(phase);
      const phaseEndWeek = getPhaseEndWeek(phase);

      let scheduleStartIndex = (phaseStartWeek - 1) - baseWeekOffset + cumulativeWeekShift;
      let scheduleEndIndex = (phaseEndWeek - 1) - baseWeekOffset + cumulativeWeekShift;

      // Safety: never schedule into negative weeks.
      if (scheduleStartIndex < 0) {
        const delta = -scheduleStartIndex;
        scheduleStartIndex = 0;
        scheduleEndIndex += delta;
      }

      const sessionsNeeded = entry.sessions.length;
      const capacity = (scheduleEndIndex - scheduleStartIndex + 1) * sessionsPerWeek;

      if (sessionsNeeded > capacity) {
        const overflowWeeks = Math.ceil((sessionsNeeded - capacity) / sessionsPerWeek);
        logWarnArgs('[SCHEDULE] ⚠️ Phase overflow; extending timeline', {
          phaseTitle: phase.title,
          sessionsNeeded,
          capacity,
          overflowWeeks,
        });
        scheduleEndIndex += overflowWeeks;
        cumulativeWeekShift += overflowWeeks;
      }

      phasePlans.push({
        phaseId: phase.id,
        phaseTitle: phase.title,
        phaseNumber,
        phaseStartWeek,
        phaseEndWeek,
        scheduleStartIndex,
        scheduleEndIndex,
        sessions: entry.sessions,
      });
    }

    const chooseEvenPositions = (count: number, capacity: number): number[] => {
      if (count <= 0 || capacity <= 0) return [];
      if (count >= capacity) return Array.from({ length: capacity }, (_, i) => i);
      if (count === 1) return [Math.floor(capacity / 2)];

      const chosen = new Set<number>();
      const out: number[] = [];
      for (let i = 0; i < count; i++) {
        const desired = (capacity - 1) * (i / (count - 1));
        let pos = Math.max(0, Math.min(capacity - 1, Math.round(desired)));

        if (chosen.has(pos)) {
          for (let delta = 1; delta < capacity; delta++) {
            const left = pos - delta;
            const right = pos + delta;
            if (left >= 0 && !chosen.has(left)) {
              pos = left;
              break;
            }
            if (right < capacity && !chosen.has(right)) {
              pos = right;
              break;
            }
          }
        }

        chosen.add(pos);
        out.push(pos);
      }

      return out.sort((a, b) => a - b);
    };

    type SessionInstance = PlannedSession & { weekIndex: number; sessionIndex: number };
    const sessionInstances: SessionInstance[] = [];
    let sessionIndexCounter = 0;

    for (const plan of phasePlans) {
      const weeksInPhase = plan.scheduleEndIndex - plan.scheduleStartIndex + 1;
      const capacity = weeksInPhase * sessionsPerWeek;
      const positions = chooseEvenPositions(plan.sessions.length, capacity);

      for (let i = 0; i < plan.sessions.length; i++) {
        const pos = positions[i] ?? i;
        const weekIndex = plan.scheduleStartIndex + Math.floor(pos / sessionsPerWeek);

        sessionInstances.push({
          ...plan.sessions[i],
          weekIndex,
          sessionIndex: sessionIndexCounter++,
        });
      }
    }

    const sessionsCount = sessionInstances.length;
    const effectiveWeeks = sessionsCount > 0
      ? Math.max(...sessionInstances.map((s) => s.weekIndex)) + 1
      : 0;

    const totalTaskMinutes = tasks.reduce((sum, t) => sum + (t.durationMinutes || 0), 0);

    logInfoArgs('[SCHEDULE] Sessions per week:', sessionsPerWeek);
    logInfoArgs('[SCHEDULE] Minutes per session:', minutesPerSession);
    logInfoArgs('[SCHEDULE] Planned sessions:', sessionsCount);
    logInfoArgs('[SCHEDULE] Effective weeks:', effectiveWeeks);
    logInfoArgs('[SCHEDULE] Total task minutes:', totalTaskMinutes);
    logInfoArgs('[SCHEDULE] Base phase anchor:', basePhase?.title, `(starts week ${getPhaseStartWeek(basePhase)})`);

    // =========================================================================
    // STEP 5: Clear existing scheduled events for this goal (avoid duplicates)
    // =========================================================================
    const { data: existingGoalEvents, error: existingGoalEventsError } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('goal_id', goalId)
      .eq('source', 'ambitionos')
      .eq('event_type', 'goal_session');

    if (existingGoalEventsError) {
      logErrorArgs('[SCHEDULE] Failed to load existing goal events:', existingGoalEventsError);
      return new Response(
        JSON.stringify({ success: false, error: { code: 'DB_ERROR', message: existingGoalEventsError.message } }),
        { status: 500, headers: responseHeaders }
      );
    }

    if (existingGoalEvents && existingGoalEvents.length > 0) {
      const existingIds = existingGoalEvents.map((e: any) => e.id);

      const { error: deleteItemsError } = await (supabase as any)
        .from('calendar_event_items')
        .delete()
        .in('calendar_event_id', existingIds);

      if (deleteItemsError) {
        logErrorArgs('[SCHEDULE] Failed to delete calendar_event_items:', deleteItemsError);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DB_ERROR', message: deleteItemsError.message } }),
          { status: 500, headers: responseHeaders }
        );
      }

      const { error: deleteEventsError } = await supabase
        .from('calendar_events')
        .delete()
        .in('id', existingIds);

      if (deleteEventsError) {
        logErrorArgs('[SCHEDULE] Failed to delete existing goal events:', deleteEventsError);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DB_ERROR', message: deleteEventsError.message } }),
          { status: 500, headers: responseHeaders }
        );
      }

      logInfoArgs('[SCHEDULE] Cleared', existingIds.length, 'existing goal events');
    }

    // =========================================================================
    // STEP 6: Load existing events to avoid conflicts (use effective timeline)
    // =========================================================================
    const goalEndDate = new Date(startDate);
    goalEndDate.setDate(goalEndDate.getDate() + effectiveWeeks * 7);

    const { data: existingEvents } = await supabase
      .from('calendar_events')
      .select('id, summary, start_datetime, end_datetime')
      .eq('user_id', user.id)
      .gte('end_datetime', startDate)
      .lte('start_datetime', goalEndDate.toISOString());

    logInfoArgs('[SCHEDULE] Existing events in range:', existingEvents?.length || 0);

    // =========================================================================
    // STEP 7: Generate available time slots (use effective timeline)
    // =========================================================================
    const slots = generateAvailableSlots(
      startDate,
      effectiveWeeks,
      tz,
      constraints,
      existingEvents || [],
      {
        info: logInfoArgs,
        error: logErrorArgs,
      }
    );

    logInfoArgs('[SCHEDULE] Available slots generated:', slots.length);

    const events: any[] = [];
    const eventItemsToInsert: any[] = [];

    // Helper: add days to an ISO date string (YYYY-MM-DD) deterministically
    const addDaysToIsoDate = (base: string, days: number): string => {
      const [y, m, d] = base.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + days));
      return dt.toISOString().split('T')[0];
    };

    const preferredTime = (goal.preferred_time || 'flexible') as string;
    const peakStartMin = parseTimeToMinutes(constraints.peakStart || '09:00');
    const peakEndMin = parseTimeToMinutes(constraints.peakEnd || '12:00');
    const peakMidHour = Math.max(6, Math.min(21, Math.round(((peakStartMin + peakEndMin) / 2) / 60)));

    const targetHour =
      preferredTime === 'morning' ? 9 :
        preferredTime === 'afternoon' ? 14 :
          preferredTime === 'evening' ? 19 :
            peakMidHour;

    // Pick session slots week-by-week based on the phase plan (no fixed weekly cadence).
    const reserved = new Set<string>(); // `${date}-${hour}` reserved by already-picked sessions (handles >60m sessions)
    const slotBySessionIndex = new Map<number, TimeSlot>();

    const reserveHoursForSession = (dateStr: string, startTime: string) => {
      const [h, m] = startTime.split(':').map(Number);
      const startMinutes = h * 60 + m;
      const endMinutes = startMinutes + minutesPerSession;
      const hoursSpanned = Math.ceil(minutesPerSession / 60);

      // Basic guard: we don't support sessions that end after midnight
      if (endMinutes > 24 * 60) return false;

      for (let i = 0; i < hoursSpanned; i++) {
        reserved.add(`${dateStr}-${h + i}`);
      }
      return true;
    };

    const isReserved = (dateStr: string, startTime: string) => {
      const h = Number(startTime.split(':')[0]);
      const hoursSpanned = Math.ceil(minutesPerSession / 60);
      for (let i = 0; i < hoursSpanned; i++) {
        if (reserved.has(`${dateStr}-${h + i}`)) return true;
      }
      return false;
    };

    const pickBestSlotForDate = (dateStr: string, daySlots: TimeSlot[]): TimeSlot | null => {
      const sorted = [...daySlots].sort((a, b) => {
        const ah = Number(a.startTime.split(':')[0]);
        const bh = Number(b.startTime.split(':')[0]);
        const ad = Math.abs(ah - targetHour);
        const bd = Math.abs(bh - targetHour);
        if (ad !== bd) return ad - bd;
        return ah - bh;
      });

      for (const s of sorted) {
        if (isReserved(dateStr, s.startTime)) continue;
        if (!reserveHoursForSession(dateStr, s.startTime)) continue;
        return s;
      }
      return null;
    };

    const sessionsByWeek = new Map<number, SessionInstance[]>();
    for (const s of sessionInstances) {
      const arr = sessionsByWeek.get(s.weekIndex) || [];
      arr.push(s);
      sessionsByWeek.set(s.weekIndex, arr);
    }
    for (const arr of sessionsByWeek.values()) {
      arr.sort((a, b) => a.sessionIndex - b.sessionIndex);
    }

    for (let weekIndex = 0; weekIndex < effectiveWeeks; weekIndex++) {
      const weekSessions = sessionsByWeek.get(weekIndex) || [];
      if (weekSessions.length === 0) continue;

      const weekStart = addDaysToIsoDate(startDate, weekIndex * 7);
      const weekEnd = addDaysToIsoDate(startDate, weekIndex * 7 + 6);

      const weekSlots = slots.filter(s => s.date >= weekStart && s.date <= weekEnd);
      if (weekSlots.length === 0) {
        logWarnArgs('[SCHEDULE] No available slots in week', weekIndex + 1, '(', weekStart, '-', weekEnd, ')');
        continue;
      }

      const byDate: Record<string, TimeSlot[]> = {};
      for (const s of weekSlots) {
        if (!byDate[s.date]) byDate[s.date] = [];
        byDate[s.date].push(s);
      }
      const dates = Object.keys(byDate).sort();
      const usedDates = new Set<string>();

      for (let i = 0; i < weekSessions.length; i++) {
        // Spread sessions across the available dates in this week
        let dateIdx = Math.floor((i * dates.length) / weekSessions.length);
        // Prefer unused dates if we have enough unique days
        if (dates.length >= weekSessions.length) {
          while (dateIdx < dates.length && usedDates.has(dates[dateIdx])) dateIdx++;
          if (dateIdx >= dates.length) dateIdx = Math.floor((i * dates.length) / weekSessions.length);
        }

        // Try chosen date first, then fall back to any other date in the week
        const primaryDate = dates[dateIdx];
        let picked = pickBestSlotForDate(primaryDate, byDate[primaryDate] || []);
        if (!picked) {
          for (const alt of dates) {
            if (alt === primaryDate) continue;
            picked = pickBestSlotForDate(alt, byDate[alt] || []);
            if (picked) break;
          }
        }

        if (!picked) {
          logWarnArgs('[SCHEDULE] Unable to pick slot for week', weekIndex + 1, 'session', i + 1);
          continue;
        }

        usedDates.add(picked.date);
        slotBySessionIndex.set(weekSessions[i].sessionIndex, picked);
      }
    }

    if (slotBySessionIndex.size < sessionsCount) {
      logErrorArgs('[SCHEDULE] Not enough availability to schedule sessions.');
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'NOT_ENOUGH_AVAILABILITY',
            message: `Not enough available time slots to schedule ${sessionsCount} sessions. Found ${slotBySessionIndex.size}.`,
          },
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    const phaseAdviceById = new Map<string, string>();
    for (const p of (goal.phases || [])) {
      const advice = String(p?.coach_advice ?? p?.coachAdvice ?? '').trim();
      if (advice) phaseAdviceById.set(p.id, advice);
    }

    const orderedSessions = [...sessionInstances].sort((a, b) => a.sessionIndex - b.sessionIndex);
    for (const sess of orderedSessions) {
      const slot = slotBySessionIndex.get(sess.sessionIndex);
      if (!slot) continue;

      const sessionItems = sess.items || [];
      if (sessionItems.length === 0) continue;

      const primary = sessionItems[0];
      const eventId = crypto.randomUUID();

      const startDatetime = zonedLocalDateTimeToUtcIso(slot.date, slot.startTime, tz);

      const [startH, startM] = slot.startTime.split(':').map(Number);
      const endMinutes = startH * 60 + startM + minutesPerSession;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      const endDatetime = zonedLocalDateTimeToUtcIso(slot.date, endTime, tz);

      const checklist = sessionItems
        .map((t) => `- [ ] ${t.title}`)
        .join('\n');

      const summary =
        sessionItems.length === 1
          ? sessionItems[0].title
          : `${sess.milestoneTitle}: ${sessionItems[0].title} + ${sessionItems.length - 1} more`;

      const description = [
        `Manifestation: ${goal.title}`,
        `Phase: ${sess.phaseTitle}${sess.phaseNumber ? ` (Phase ${sess.phaseNumber})` : ''}`,
        `Milestone: ${sess.milestoneTitle}`,
        `Focus: ${sess.cognitiveType.replace('_', ' ')} • Difficulty ${sess.difficulty}/5`,
        `Estimated work: ${sess.totalItemMinutes} min (scheduled ${minutesPerSession} min)`,
        '',
        '💡 Coach Insight:',
        phaseAdviceById.get(sess.phaseId) || 'Focus on consistent execution.',
        '',
        'Session checklist:',
        checklist,
      ].filter(Boolean).join('\n');

      // If the session has exactly one item, keep the direct link columns populated for convenience
      const single = sessionItems.length === 1 ? sessionItems[0] : null;

      events.push({
        id: eventId,
        user_id: user.id,
        summary,
        description,
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        timezone: tz,
        goal_id: goalId,
        phase_id: sess.phaseId,
        milestone_id: sess.milestoneId,
        task_id: single?.taskId || null,
        subtask_id: single?.subtaskId || null,
        event_type: 'goal_session',
        allocation_type: 'task_session',
        energy_cost: goal.energy_cost || 'medium',
        priority: 'medium',
        status: 'scheduled',
        source: 'ambitionos',
        sync_status: 'local_only',
        duration_minutes: minutesPerSession,
        effort_minutes_allocated: sess.totalItemMinutes,
        cognitive_type: sess.cognitiveType,
        difficulty: sess.difficulty,
        scheduling_reasoning: `Batched ${sessionItems.length} item${sessionItems.length === 1 ? '' : 's'} from "${sess.milestoneTitle}" into a ${minutesPerSession}-minute session.`,
        ai_metadata: {
          scheduling: {
            generated_by: 'generate-schedule',
            reasoning: `Grouped ${sessionItems.length} item${sessionItems.length === 1 ? '' : 's'} with ${sess.cognitiveType.replace('_', ' ')} focus.`,
          },
          roadmap_snapshot: {
            goal_title: goal.title,
            phase_title: sess.phaseTitle,
            task_title: primary?.title || sess.milestoneTitle,
          },
        },
        session_index: sess.sessionIndex + 1,
        total_sessions: sessionsCount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Persist the checklist mapping for the event UI
      for (let i = 0; i < sessionItems.length; i++) {
        const it = sessionItems[i];
        eventItemsToInsert.push({
          calendar_event_id: eventId,
          goal_id: goalId,
          phase_id: it.phaseId,
          milestone_id: it.milestoneId,
          task_id: it.taskId || null,
          subtask_id: it.subtaskId || null,
          display_order: i,
        });
      }
    }

    logInfoArgs('[SCHEDULE] Events created:', events.length);

    // Log distribution info
    if (events.length > 0) {
      const uniqueDates = new Set(events.map(e => e.start_datetime.split('T')[0]));
      logInfoArgs('[SCHEDULE] Unique dates:', uniqueDates.size);
      logInfoArgs('[SCHEDULE] First event:', events[0].start_datetime);
      logInfoArgs('[SCHEDULE] Last event:', events[events.length - 1].start_datetime);
    }

    // Log first few events for debugging
    for (let i = 0; i < Math.min(3, events.length); i++) {
      logInfoArgs(`[SCHEDULE] Event ${i + 1}:`, events[i].summary, events[i].start_datetime);
    }

    // =========================================================================
    // STEP 7: Insert into database
    // =========================================================================
    const { data: insertedEvents, error: insertError } = await supabase
      .from('calendar_events')
      .insert(events)
      .select();

    if (insertError) {
      logErrorArgs('[SCHEDULE] Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: { code: 'DB_ERROR', message: insertError.message } }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Insert session checklist mapping (event → tasks/subtasks)
    if (eventItemsToInsert.length > 0) {
      const { error: itemsError } = await (supabase as any)
        .from('calendar_event_items')
        .insert(eventItemsToInsert);

      if (itemsError) {
        logErrorArgs('[SCHEDULE] Failed to insert calendar_event_items:', itemsError);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'DB_ERROR', message: itemsError.message } }),
          { status: 500, headers: responseHeaders }
        );
      }
      logInfoArgs('[SCHEDULE] Inserted', eventItemsToInsert.length, 'calendar_event_items');
    }

    // Mark goal as scheduled
    await supabase
      .from('goals')
      .update({ is_scheduled: true, status: 'active' })
      .eq('id', goalId);

    logInfoArgs('[SCHEDULE] SUCCESS! Inserted', insertedEvents?.length || 0, 'events');
    logInfoArgs('='.repeat(60));

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          events: insertedEvents || events,
          totalSessions: events.length,
          goalWeeks,
          reasoning: `Scheduled ${events.length} sessions over ${effectiveWeeks} weeks (anchored to "${basePhase?.title || 'current work'}"), batching milestone tasks into ${minutesPerSession}-minute sessions and placing them in open slots while avoiding work hours, blocked time, sleep hours, and existing calendar conflicts.`,
        },
      }),
      { headers: responseHeaders }
    );

  } catch (error) {
    logErrorArgs('[SCHEDULE] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: { code: 'ERROR', message: error.message } }),
      { status: 500, headers: responseHeaders }
    );
  }
});

// =============================================================================
// TIMEZONE UTILITIES
// =============================================================================

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  let year = Number(map.year);
  let month = Number(map.month);
  let day = Number(map.day);
  let hour = Number(map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);

  // Some environments may represent midnight as "24:00"
  if (hour === 24) {
    hour = 0;
    const rollover = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    rollover.setUTCDate(rollover.getUTCDate() + 1);
    year = rollover.getUTCFullYear();
    month = rollover.getUTCMonth() + 1;
    day = rollover.getUTCDate();
  }

  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUTC - date.getTime();
}

function zonedLocalDateTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));

  // Two-pass adjustment to handle DST boundaries.
  const offset1 = getTimeZoneOffsetMs(timeZone, utcGuess);
  const utc1 = new Date(utcGuess.getTime() - offset1);
  const offset2 = getTimeZoneOffsetMs(timeZone, utc1);
  const utc2 = new Date(utcGuess.getTime() - offset2);

  return utc2.toISOString();
}

function getZonedDateKeyAndHour(date: Date, timeZone: string): { dateKey: string; hour: number } | null {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const year = map.year;
  const month = map.month;
  const day = map.day;
  if (!year || !month || !day || !map.hour) return null;

  let hour = Number(map.hour);
  if (hour === 24) hour = 0;

  return { dateKey: `${year}-${month}-${day}`, hour };
}

function parseTimeToMinutes(timeStr: string): number {
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

/**
 * Convert dlulu day index (0=Mon) to JavaScript Date.getDay() (0=Sun)
 * UNIVERSAL CONVERSION: dlulu uses 0=Monday, JavaScript uses 0=Sunday
 * @param dluluDay dlulu day index (0=Monday, 6=Sunday)
 * @returns JavaScript day (0=Sunday, 6=Saturday)
 */
function dluluDayToJsDay(dluluDay: number): number {
  // dlulu: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  // JS:    0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  return (dluluDay + 1) % 7;
}

// =============================================================================
// SLOT GENERATION - Deterministic, no AI
// =============================================================================

function generateAvailableSlots(
  startDateStr: string,
  totalWeeks: number,
  timezone: string,
  constraints: UserConstraints,
  existingEvents: any[],
  logger?: {
    info?: (message: string, ...args: unknown[]) => void;
    error?: (message: string, ...args: unknown[]) => void;
  }
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const [startY, startM, startD] = startDateStr.split('-').map(Number);
  if (!Number.isFinite(startY) || !Number.isFinite(startM) || !Number.isFinite(startD)) {
    logger?.error?.('[SLOTS] Invalid startDateStr:', startDateStr);
    return [];
  }
  const totalDays = totalWeeks * 7;

  // Scheduling bounds (local time)
  // We still keep a sane floor/ceiling to avoid midnight scheduling surprises.
  const MIN_HOUR = 6;  // earliest start 06:00
  const MAX_HOUR = 22; // latest end 22:00 (so latest start is 21:00 for 1h slots)

  const wakeMin = parseTimeToMinutes(constraints.sleepEnd);
  let bedMin = parseTimeToMinutes(constraints.sleepStart);
  // If bedtime is earlier/equal to wake time, bedtime is "next day" (sleep crosses midnight)
  if (bedMin <= wakeMin) bedMin += 24 * 60;

  // Use hour granularity for now; round wake up to next hour, and ensure end before bedtime.
  const earliestStartHour = Math.max(MIN_HOUR, Math.ceil(wakeMin / 60));
  const latestStartHour = Math.min(MAX_HOUR - 1, Math.floor((bedMin - 60) / 60));

  if (!Number.isFinite(earliestStartHour) || !Number.isFinite(latestStartHour) || earliestStartHour > latestStartHour) {
    logger?.error?.('[SLOTS] No valid scheduling window from constraints. wake=', constraints.sleepEnd, 'bed=', constraints.sleepStart);
    return [];
  }

  logger?.info?.('[SLOTS] Final available hours:', earliestStartHour, 'to', latestStartHour + 1);
  logger?.info?.('[SLOTS] Timezone:', timezone);

  // Build busy ranges with MINUTE PRECISION for accurate overlap detection
  interface BusyRange { start: Date; end: Date; key: string; }
  const busyRanges: BusyRange[] = [];
  const busySlots = new Set<string>(); // Keep for backward compatibility with hour-based lookup

  for (const evt of existingEvents) {
    if (!evt?.start_datetime) continue;
    const start = new Date(evt.start_datetime);
    const end = new Date(evt.end_datetime || evt.start_datetime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    // Store exact time range for minute-precision overlap checking
    busyRanges.push({
      start,
      end,
      key: `${start.toISOString()}-${end.toISOString()}`
    });

    // Also block each hour touched for backward compatible slot lookup
    const cursor = new Date(start);
    cursor.setMinutes(0, 0, 0);
    const guard = 24 * 14; // max 2 weeks worth of hourly steps for a single event (safety)
    let steps = 0;
    while (cursor < end && steps < guard) {
      steps++;
      const zoned = getZonedDateKeyAndHour(cursor, timezone);
      if (zoned) busySlots.add(`${zoned.dateKey}-${zoned.hour}`);
      cursor.setHours(cursor.getHours() + 1);
    }
  }

  logger?.info?.('[SLOTS] Busy ranges (minute precision):', busyRanges.length);

  type PatternedBlock = { start: number; end: number; weekPattern: 'default' | 'A' | 'B' };

  // Parse work blocks into a per-day-of-week structure (with week patterns)
  const workHoursByDay: Record<number, PatternedBlock[]> = {};
  for (const block of constraints.workBlocks || []) {
    const startH = parseInt((block.start || '09:00').split(':')[0]);
    const endH = parseInt((block.end || '17:00').split(':')[0]);
    const weekPattern = (block.weekPattern || 'default') as PatternedBlock['weekPattern'];
    for (const day of block.days || [0, 1, 2, 3, 4]) { // Default weekdays (Mon-Fri) in dlulu indexing
      const jsDay = dluluDayToJsDay(day); // Convert to JS day for Date.getDay() comparison
      if (!workHoursByDay[jsDay]) workHoursByDay[jsDay] = [];
      workHoursByDay[jsDay].push({ start: startH, end: endH, weekPattern });
    }
  }

  // Parse other blocked slots into a per-day-of-week structure (with week patterns)
  const blockedHoursByDay: Record<number, PatternedBlock[]> = {};
  for (const block of constraints.blockedSlots || []) {
    const startH = parseInt((block.start || '00:00').split(':')[0]);
    const endH = parseInt((block.end || '00:00').split(':')[0]);
    const weekPattern = (block.weekPattern || 'default') as PatternedBlock['weekPattern'];
    for (const day of block.days || []) { // dlulu indexing: 0=Mon, 6=Sun
      const jsDay = dluluDayToJsDay(day); // Convert to JS day for Date.getDay() comparison
      if (!blockedHoursByDay[jsDay]) blockedHoursByDay[jsDay] = [];
      blockedHoursByDay[jsDay].push({ start: startH, end: endH, weekPattern });
    }
  }

  const exceptionsByDate: Record<string, Array<{ startMin: number; endMin: number; isBlocked: boolean }>> = {};
  for (const ex of constraints.timeExceptions || []) {
    if (!ex?.date) continue;
    const startMin = parseTimeToMinutes(ex.start || '00:00');
    const endMin = parseTimeToMinutes(ex.end || '00:00');
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) continue;
    if (!exceptionsByDate[ex.date]) exceptionsByDate[ex.date] = [];
    exceptionsByDate[ex.date].push({
      startMin,
      endMin,
      isBlocked: ex.isBlocked !== false,
    });
  }

  // Generate slots for each day
  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const dateUtc = new Date(Date.UTC(startY, startM - 1, startD + dayOffset));
    const dateStr = dateUtc.toISOString().split('T')[0];
    const dayOfWeek = dateUtc.getUTCDay(); // JavaScript: 0=Sun, 1=Mon, ... (used for lookup in workHoursByDay)

    // Week pattern for this day (A/B alternating from schedule start)
    const weekIndex = Math.floor(dayOffset / 7);
    const activePattern: PatternedBlock['weekPattern'] = weekIndex % 2 === 0 ? 'A' : 'B';
    const isPatternActive = (pattern: PatternedBlock['weekPattern']) =>
      pattern === 'default' || pattern === activePattern;

    // Get work hours for this day (filtered by week pattern)
    const workBlocks = (workHoursByDay[dayOfWeek] || []).filter(b => isPatternActive(b.weekPattern));
    const blockedBlocks = (blockedHoursByDay[dayOfWeek] || []).filter(b => isPatternActive(b.weekPattern));
    const dayExceptions = exceptionsByDate[dateStr] || [];

    // Generate hourly slots from wake to sleep
    for (let hour = earliestStartHour; hour <= latestStartHour; hour++) {
      const slotStartMin = hour * 60;
      const slotEndMin = slotStartMin + 60;

      const isExceptionBlocked = dayExceptions.some(ex =>
        ex.isBlocked && slotStartMin < ex.endMin && slotEndMin > ex.startMin
      );
      if (isExceptionBlocked) continue;

      const isExceptionAvailable = dayExceptions.some(ex =>
        !ex.isBlocked && slotStartMin < ex.endMin && slotEndMin > ex.startMin
      );

      if (!isExceptionAvailable) {
        // Check if this hour is during work
        let isDuringWork = false;
        for (const work of workBlocks) {
          if (hour >= work.start && hour < work.end) {
            isDuringWork = true;
            break;
          }
        }

        if (isDuringWork) continue;

        // Check if this hour is during other blocked time (lunch, commute, etc.)
        let isDuringBlocked = false;
        for (const b of blockedBlocks) {
          if (hour >= b.start && hour < b.end) {
            isDuringBlocked = true;
            break;
          }
        }
        if (isDuringBlocked) continue;
      }

      // Check if this slot is already busy
      const slotKey = `${dateStr}-${hour}`;
      if (busySlots.has(slotKey)) continue;

      // Add this slot
      slots.push({
        date: dateStr,
        startTime: `${String(hour).padStart(2, '0')}:00`,
        endTime: `${String(hour + 1).padStart(2, '0')}:00`,
        dayOfWeek,
      });

      // Mark as used to prevent double-booking within the same hour
      busySlots.add(slotKey);
    }
  }

  logger?.info?.('[SLOTS] Total available slots:', slots.length);
  return slots;
}
