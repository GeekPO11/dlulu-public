// =============================================================================
// Gemini Service - Main Export
// Re-exports all AI functions and maintains backward compatibility
// =============================================================================

// Client and utilities
export { ai, MODELS, cleanJson, parseJsonSafe } from "./client";

// Context builders
export { 
  buildUserContext, 
  buildConstraintContext, 
  buildGoalContext,
  buildPrerequisiteContext,
  COACH_SYSTEM_INSTRUCTION 
} from "./context";

// Planning functions - use secure Edge Functions (API key stored in Supabase)
export { 
  analyzeAmbitions,
  generatePrerequisites,
  generateBlueprint,
  generateGoalOverview,
  generateFullPlan,
  generateGoalSchedule,  // Scheduling via Edge Function
} from "../../lib/api/ai";
export type { 
  GeneratePrerequisitesInput,
  GeneratePrerequisitesOutput,
  FullPlanGoal, 
  FullPlanResponse,
  GenerateGoalOverviewInput,
  GenerateGoalOverviewOutput,
  GenerateGoalScheduleInput,
  GenerateGoalScheduleOutput,
  ProgressCallback,
} from "../../lib/api/ai";

// Other scheduling functions (still use client-side for now - lower priority)
export {
  generateFullSchedule,
  generateWeeklySchedule,
  autoFixSchedule,
  parseRosterImage,
  generatePhaseSchedule,
} from "./scheduling";
export type {
  GeneratePhaseScheduleInput,
  GeneratePhaseScheduleOutput,
} from "./scheduling";

// Re-export calendar types for convenience
export type {
  CalendarEvent,
  ScheduleGenerationRequest,
  ScheduleGenerationResponse,
  GeneratedEvent,
} from "../../constants/calendarTypes";

// Roadmap functions
export {
  generateRoadmap,
  refineRoadmap,
  refinePhase,
  goalsToRoadmap
} from "./roadmap";

// Chatbot functions
export {
  sendChatbotMessage,
  getQuickSuggestions,
  generateGoalRoadmap,
} from "./chatbot";
export type {
  ChatMessage,
  ChatAction,
  ChatActionType,
  ChatbotContext,
  ChatbotResponse,
} from "./chatbot";

// =============================================================================
// Additional utility functions
// =============================================================================

import { ai, MODELS, parseJsonSafe } from "./client";
import { logger } from "../../lib/logger";
import { Modality } from "@google/genai";
import { computeDurationModel } from "../../utils/durationModel";

/**
 * Generate speech from text (TTS)
 */
export const generateSpeech = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: MODELS.TTS,
      contents: { parts: [{ text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }
          }
        }
      }
    });
    
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    logger.error("[TTS] Error", error);
    return null;
  }
};

/**
 * Transcribe audio to text
 */
export const transcribeAudio = async (base64Audio: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: MODELS.TRANSCRIPTION,
      contents: {
        parts: [
          { inlineData: { mimeType: 'audio/wav', data: base64Audio } },
          { text: "Transcribe this audio accurately." }
        ]
      }
    });
    
    return response.text || null;
  } catch (error) {
    logger.error("[Transcription] Error", error);
    return null;
  }
};

/**
 * Edit/transform an image
 */
export const editImage = async (
  base64Image: string, 
  prompt: string
): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: MODELS.VISION,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: base64Image } },
          { text: prompt }
        ]
      }
    });
    
    return response.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData
    )?.inlineData?.data || null;
  } catch (error) {
    logger.error("[Image Edit] Error", error);
    return null;
  }
};

/**
 * Chat with context (supports search and maps grounding)
 */
export const sendChatMessage = async (
  message: string,
  history: Array<{ role: string; parts: Array<{ text: string }> }>,
  useSearch: boolean = false,
  useMaps: boolean = false,
  userLocation?: { lat: number; lng: number }
): Promise<{ text: string; groundingChunks?: any[] }> => {
  const tools: any[] = [];
  if (useSearch) tools.push({ googleSearch: {} });
  if (useMaps) tools.push({ googleMaps: {} });
  
  const config: any = { tools };
  if (useMaps && userLocation) {
    config.toolConfig = {
      retrievalConfig: {
        latLng: { latitude: userLocation.lat, longitude: userLocation.lng }
      }
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: useMaps ? MODELS.VISION : MODELS.FAST,
      contents: [...history, { role: 'user', parts: [{ text: message }] }],
      config
    });

    return {
      text: response.text || "I couldn't generate a response.",
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
    };
  } catch (error) {
    logger.error("[Chat] Error", error);
    return { text: "Sorry, I encountered an error." };
  }
};

/**
 * Generate year plan (for year planner view)
 */
export const generateYearPlan = async (
  ambition: string,
  profession?: string
): Promise<any> => {
  const prompt = `Create a strategic year plan for achieving: "${ambition}"
${profession ? `User's role: ${profession}` : ''}

## OUTPUT FORMAT (JSON)
{
  "theme": "Overall theme for the year",
  "quarters": [
    {
      "quarter": 1,
      "title": "Q1 Focus",
      "focus": "Main focus area",
      "milestones": ["Milestone 1", "Milestone 2", "Milestone 3"]
    }
  ]
}`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.PLANNING,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4096 }
      }
    });
    
    return parseJsonSafe(response.text || "", null);
  } catch (error) {
    logger.error("[Year Plan] Error", error);
    return null;
  }
};

/**
 * Generate a personalized daily motivational quote based on user's goals and progress
 * Uses Edge Function for secure API calls, with curated fallbacks
 */
const CURATED_QUOTES = [
  "Progress isn't always visible, but every rep counts toward mastery.",
  "The gap between where you are and where you want to be closes with each step.",
  "Your future self is watching you right now through your choices.",
  "Momentum builds slowly, then suddenly. Keep moving.",
  "The best time to start was yesterday. The second best time is now.",
  "Small daily improvements lead to staggering long-term results.",
  "You don't have to be perfect to make progress.",
  "Discipline is choosing between what you want now and what you want most.",
  "Every expert was once a beginner. Every pro was once an amateur.",
  "The only bad workout is the one that didn't happen.",
];

export const generateDailyQuote = async (params: {
  role: string;
  goals: string;
  progress: number;
}): Promise<string> => {
  // Use curated quotes - fast and reliable, no API needed
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const quoteIndex = dayOfYear % CURATED_QUOTES.length;
  return CURATED_QUOTES[quoteIndex];
};

/**
 * Generate smart daily focus suggestions based on user's goals and schedule
 */
export interface FocusSuggestion {
  /** Stable id for caching + "done" state. */
  id: string;
  type: 'task' | 'milestone' | 'habit' | 'break';
  priority: 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  estimatedDuration: number;
  goalId?: string;
  goalTitle?: string;
  milestoneId?: string;
  taskId?: string;
  subtaskId?: string;
}

export const generateDailyFocus = async (params: {
  goals: Array<{
    id: string;
    title: string;
    progress: number;
    phases: any[];
    currentPhaseIndex?: number;
    frequency?: number;
    duration?: number;
    goalArchetype?: 'HABIT_BUILDING' | 'DEEP_WORK_PROJECT' | 'SKILL_ACQUISITION' | 'MAINTENANCE';
  }>;
  todayEvents: Array<{ summary: string; start: string; end: string }>;
  userProfile: { role?: string; chronotype?: string; energyLevel?: string };
}): Promise<FocusSuggestion[]> => {
  const { goals, todayEvents, userProfile } = params;
  
  if (goals.length === 0) {
    return [{
      id: 'setup:first-ambition',
      type: 'task',
      priority: 'high',
      title: 'Set up your first ambition',
      reason: 'Start your journey by defining what you want to achieve',
      estimatedDuration: 10,
    }];
  }
  
  const MAX_FOCUS = 6;

  const parseTimeToMinutes = (value?: string): number | null => {
    if (!value || typeof value !== 'string') return null;
    const [hoursRaw, minutesRaw] = value.split(':');
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return (hours * 60) + minutes;
  };

  const todayLoadMinutes = todayEvents.reduce((sum, event) => {
    const start = parseTimeToMinutes(event.start);
    const end = parseTimeToMinutes(event.end);
    if (start === null || end === null) return sum;
    const duration = end > start ? end - start : 0;
    return sum + duration;
  }, 0);

  const progressByGoalId = new Map(goals.map((g) => [g.id, g.progress]));

  const computePriority = (progress: number): FocusSuggestion['priority'] => {
    if (progress < 35) return 'high';
    if (progress < 70) return 'medium';
    return 'low';
  };

  const clampIndex = (index: number, length: number) => {
    if (length <= 0) return 0;
    if (Number.isNaN(index)) return 0;
    return Math.max(0, Math.min(index, length - 1));
  };

  const sortByOrder = <T extends { order?: number }>(items: T[]): T[] => {
    return items
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) => (a.item.order ?? a.idx) - (b.item.order ?? b.idx))
      .map(({ item }) => item);
  };

  const actionable: FocusSuggestion[] = [];

  for (const goal of goals) {
    const phases = Array.isArray(goal.phases) ? goal.phases : [];
    if (phases.length === 0) continue;

    const phaseIndexRaw = typeof goal.currentPhaseIndex === 'number' ? goal.currentPhaseIndex : 0;
    const phaseIndex = clampIndex(phaseIndexRaw, phases.length);
    const phase = phases[phaseIndex] ?? phases[0];

    const milestonesRaw = Array.isArray(phase?.milestones) ? phase.milestones : [];
    const milestones = sortByOrder(milestonesRaw);
    const nextMilestone = milestones.find((m: any) => m && !m.isCompleted);

    const priority = computePriority(goal.progress);

    if (!nextMilestone) {
      actionable.push({
        id: `${goal.id}:m0:t0:s0`,
        type: 'task',
        priority,
        title: `Review ${goal.title}`,
        reason: 'All current milestones look complete — decide the next step.',
        estimatedDuration: 15,
        goalId: goal.id,
        goalTitle: goal.title,
      });
      continue;
    }

    const milestoneId = nextMilestone.id;

    const tasksRaw = Array.isArray(nextMilestone?.tasks) ? nextMilestone.tasks : [];
    const tasks = sortByOrder(tasksRaw);
    const nextTask = tasks.find((t: any) => t && !t.isCompleted && !t.isStrikethrough);

    if (nextTask) {
      const taskId = nextTask.id;
      const subTasksRaw = Array.isArray(nextTask?.subTasks) ? nextTask.subTasks : [];
      const subTasks = sortByOrder(subTasksRaw);
      const nextSubtask = subTasks.find((st: any) => st && !st.isCompleted && !st.isStrikethrough);

      const durationModel = computeDurationModel({
        estimatedMinutes: Number(nextTask.estimatedMinutes) || (goal.duration ?? undefined),
        difficulty: Number(nextTask.difficulty),
        cognitiveType: nextTask.cognitiveType,
        subTaskCount: subTasks.length,
        energyLevel: userProfile.energyLevel,
        sameDayLoadMinutes: todayLoadMinutes,
        goalCadencePerWeek: goal.frequency,
        goalArchetype: goal.goalArchetype,
      });

      if (nextSubtask) {
        actionable.push({
          id: `${goal.id}:${milestoneId ?? 'm0'}:${taskId ?? 't0'}:${nextSubtask.id ?? 's0'}`,
          type: 'task',
          priority,
          title: nextSubtask.title || nextTask.title || nextMilestone.title || `Work on ${goal.title}`,
          reason: `Next step in "${goal.title}" — ${nextMilestone.title}`,
          estimatedDuration: durationModel.scheduledRecommendationMinutes,
          goalId: goal.id,
          goalTitle: goal.title,
          milestoneId,
          taskId,
          subtaskId: nextSubtask.id,
        });
      } else {
        actionable.push({
          id: `${goal.id}:${milestoneId ?? 'm0'}:${taskId ?? 't0'}:s0`,
          type: 'task',
          priority,
          title: nextTask.title || nextMilestone.title || `Work on ${goal.title}`,
          reason: `Move "${goal.title}" forward — ${nextMilestone.title}`,
          estimatedDuration: durationModel.scheduledRecommendationMinutes,
          goalId: goal.id,
          goalTitle: goal.title,
          milestoneId,
          taskId,
        });
      }
      continue;
    }

    const fallbackDuration = computeDurationModel({
      estimatedMinutes: goal.duration,
      energyLevel: userProfile.energyLevel,
      sameDayLoadMinutes: todayLoadMinutes,
      goalCadencePerWeek: goal.frequency,
      goalArchetype: goal.goalArchetype,
    }).scheduledRecommendationMinutes;

    actionable.push({
      id: `${goal.id}:${milestoneId ?? 'm0'}:t0:s0`,
      type: 'milestone',
      priority,
      title: nextMilestone.title || `Work on ${goal.title}`,
      reason: `${goal.progress}% complete — keep the momentum going.`,
      estimatedDuration: fallbackDuration,
      goalId: goal.id,
      goalTitle: goal.title,
      milestoneId,
    });
  }

  actionable.sort((a, b) => {
    const aProgress = a.goalId ? (progressByGoalId.get(a.goalId) ?? 101) : 101;
    const bProgress = b.goalId ? (progressByGoalId.get(b.goalId) ?? 101) : 101;
    return aProgress - bProgress;
  });

  const suggestions = actionable.slice(0, MAX_FOCUS);

  // Only add habit/break fillers if we don't have enough actionable goal-linked items.
  const actionableGoalCount = actionable.filter((s) => Boolean(s.goalId)).length;
  if (actionableGoalCount < 3) {
    const fillers: FocusSuggestion[] = [];

    fillers.push({
      id: 'habit:walk-10m',
      type: 'habit',
      priority: 'medium',
      title: 'Take a 10-minute walk',
      reason: 'Movement boosts focus and creativity.',
      estimatedDuration: 10,
    });

    if (todayEvents.length >= 3) {
      fillers.push({
        id: 'break:recovery-15m',
        type: 'break',
        priority: 'low',
        title: 'Schedule a recovery break',
        reason: 'Busy day ahead — protect your energy.',
        estimatedDuration: 15,
      });
    } else {
      fillers.push({
        id: 'habit:hydration-2m',
        type: 'habit',
        priority: 'low',
        title: 'Hydrate + reset posture',
        reason: 'Quick reset to keep your focus steady.',
        estimatedDuration: 2,
      });
    }

    for (const filler of fillers) {
      if (suggestions.length >= Math.min(MAX_FOCUS, 3)) break;
      if (suggestions.some((s) => s.id === filler.id)) continue;
      suggestions.push(filler);
    }
  }

  return suggestions;
};

/**
 * Generate weekly insights summary
 */
export interface WeeklyInsight {
  summary: string;
  wins: string[];
  improvements: string[];
  nextWeekFocus: string[];
  overallMood: 'excellent' | 'good' | 'neutral' | 'needs_attention';
}

export const generateWeeklyInsights = async (params: {
  goals: Array<{ title: string; progress: number; weeklyChange: number }>;
  completedTasks: number;
  totalTasks: number;
  sessionsAttended: number;
  sessionsMissed: number;
}): Promise<WeeklyInsight> => {
  const { goals, completedTasks, totalTasks, sessionsAttended, sessionsMissed } = params;
  
  const prompt = `You are an encouraging productivity coach. Generate a weekly progress summary.

THIS WEEK'S DATA:
- Ambitions: ${JSON.stringify(goals)}
- Tasks Completed: ${completedTasks}/${totalTasks}
- Sessions Attended: ${sessionsAttended}, Missed: ${sessionsMissed}

Generate an encouraging weekly summary that:
1. Highlights wins (even small ones)
2. Gently suggests 1-2 improvements
3. Recommends 2-3 focus areas for next week
4. Assesses overall progress mood

OUTPUT FORMAT (JSON):
{
  "summary": "2-3 sentence summary of the week",
  "wins": ["win 1", "win 2"],
  "improvements": ["suggestion 1"],
  "nextWeekFocus": ["focus 1", "focus 2"],
  "overallMood": "excellent|good|neutral|needs_attention"
}

Return ONLY valid JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.FAST,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    
    return parseJsonSafe(response.text || "", {
      summary: "Keep up the great work on your ambitions!",
      wins: ["You're making progress"],
      improvements: ["Try to be more consistent"],
      nextWeekFocus: ["Stay focused on your priorities"],
      overallMood: "good"
    });
  } catch (error) {
    logger.error("[Weekly Insights] Error", error);
    return {
      summary: "You're making progress on your ambitions. Keep it up!",
      wins: ["Every step counts"],
      improvements: [],
      nextWeekFocus: ["Stay consistent"],
      overallMood: "good"
    };
  }
};
