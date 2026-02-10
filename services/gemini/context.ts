// =============================================================================
// Context Builder for Gemini Prompts
// Builds rich context from user data without PII in prompts
// =============================================================================

import { UserProfile, Goal, TimeConstraints, Prerequisite } from "../../types";
import { logger } from "../../lib/logger";

/**
 * Build user context for AI prompts
 * Note: Excludes name (PII) unless explicitly needed
 */
export const buildUserContext = (profile?: Partial<UserProfile>, includeName = false): string => {
  if (!profile) {
    logger.warn('[Context] buildUserContext called with undefined profile');
    return 'User profile not available';
  }

  const parts: string[] = [];

  if (includeName && profile.name) {
    parts.push(`Name: ${profile.name}`);
  }

  if (profile.role) {
    parts.push(`Role: ${profile.role}`);
  }

  if (profile.roleContext) {
    parts.push(`Additional Context: ${profile.roleContext}`);
  }

  if (profile.bio) {
    parts.push(`Life Context: ${profile.bio}`);
  }

  if (profile.chronotype) {
    const chronoDescriptions: Record<string, string> = {
      'early_bird': 'Most productive in early morning (before 10am)',
      'night_owl': 'Most productive in evening/night (after 6pm)',
      'midday_peak': 'Most productive midday (10am-2pm)',
      'flexible': 'Productivity varies, no strong preference',
    };
    parts.push(`Chronotype: ${chronoDescriptions[profile.chronotype] || profile.chronotype}`);
  }

  if (profile.energyLevel) {
    const energyDescriptions: Record<string, string> = {
      'high_octane': 'High capacity, can handle intense schedules',
      'balanced': 'Prefers sustainable, consistent workload',
      'recovery': 'Currently recovering from burnout, needs gentler schedule',
    };
    parts.push(`Energy Level: ${energyDescriptions[profile.energyLevel] || profile.energyLevel}`);
  }

  return parts.join('\n');
};

/**
 * Build constraint context for scheduling prompts
 */
export const buildConstraintContext = (constraints: Partial<TimeConstraints>): string => {
  const parts: string[] = [];

  if (constraints.workBlocks?.length) {
    parts.push("WORK/BLOCKED HOURS (Do NOT schedule personal tasks during these times):");
    constraints.workBlocks.forEach(block => {
      const days = block.days.map(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]).join(', ');
      const patternLabel = block.weekPattern && block.weekPattern !== 'default' ? ` (Week ${block.weekPattern})` : '';
      parts.push(`  - ${block.title}: ${block.start} - ${block.end} on ${days}${patternLabel}`);
    });
  }

  if (constraints.sleepStart && constraints.sleepEnd) {
    parts.push(`SLEEP HOURS (Unavailable): ${constraints.sleepStart} - ${constraints.sleepEnd}`);
  }

  if (constraints.peakStart && constraints.peakEnd) {
    parts.push(`PEAK PRODUCTIVITY: ${constraints.peakStart} - ${constraints.peakEnd} (Schedule high-energy tasks here when possible)`);
  }

  if (constraints.blockedSlots?.length) {
    parts.push("OTHER BLOCKED TIMES:");
    constraints.blockedSlots.forEach(slot => {
      const days = slot.days.map(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]).join(', ');
      const patternLabel = slot.weekPattern && slot.weekPattern !== 'default' ? ` (Week ${slot.weekPattern})` : '';
      parts.push(`  - ${slot.title}: ${slot.start} - ${slot.end} on ${days}${patternLabel}`);
    });
  }

  if (constraints.timeExceptions?.length) {
    parts.push("TIME EXCEPTIONS (Date-specific overrides):");
    constraints.timeExceptions.forEach(ex => {
      parts.push(`  - ${ex.date}: ${ex.start} - ${ex.end} ${ex.isBlocked ? '(blocked)' : '(available)'}${ex.reason ? ` (${ex.reason})` : ''}`);
    });
  }

  return parts.join('\n');
};

/**
 * Build goal summary for context
 */
export const buildGoalContext = (goals: Goal[]): string => {
  if (!goals.length) return "No active ambitions yet.";

  return goals.map(g => {
    const phaseInfo = g.phases[g.currentPhaseIndex];
    const priority = Number.isFinite(g.priorityWeight) ? g.priorityWeight : 50;
    return `- ${g.title} (${g.category}): ${g.overallProgress}% complete, priority ${priority}/100, currently in ${phaseInfo?.title || 'setup'}`;
  }).join('\n');
};

/**
 * Build prerequisite summary for gap analysis
 */
export const buildPrerequisiteContext = (prerequisites: Prerequisite[]): string => {
  // Group by goal
  const grouped: Record<string, { completed: string[], remaining: string[] }> = {};

  prerequisites.forEach(p => {
    const key = p.goalTitle;
    if (!grouped[key]) {
      grouped[key] = { completed: [], remaining: [] };
    }
    if (p.isCompleted) {
      grouped[key].completed.push(p.label);
    } else {
      grouped[key].remaining.push(p.label);
    }
  });

  const parts: string[] = [];

  Object.entries(grouped).forEach(([goal, data]) => {
    parts.push(`\nAMBITION: ${goal}`);

    if (data.completed.length > 0) {
      parts.push(`  Already Achieved:`);
      data.completed.forEach(c => parts.push(`    ✓ ${c}`));
    } else {
      parts.push(`  Starting From: Complete beginner (no prerequisites met)`);
    }

    if (data.remaining.length > 0) {
      parts.push(`  Still Needed:`);
      data.remaining.forEach(r => parts.push(`    ○ ${r}`));
    }
  });

  return parts.join('\n');
};

/**
 * System instruction for coach personality
 * Updated for "ambition" branding and Gen Z appeal
 */
export const COACH_SYSTEM_INSTRUCTION = `You are Solulu, an ambition coach in the dlulu life app - helping users turn their dreams into reality through deep focused work.

Your Vibe:
- Hype them up but keep it real - celebrate wins, acknowledge the grind
- Strategic thinker - connect daily actions to the bigger picture
- Practical - give actionable advice, not vague vibes
- Personal - reference their specific situation and ambitions
- Concise - respect their time, no rambling

Your Expertise:
- Breaking down big dreams into actionable phases
- Time management and realistic scheduling
- Habit building and behavior change
- Career growth and skill development
- Health, fitness, and wellness planning
- Learning optimization and skill acquisition

Your Coaching Approach:
- Create clear phases for every ambition
- Each phase has specific milestones with tasks and subtasks
- Be thorough - include ALL necessary steps, don't artificially limit
- Realistic timelines based on their available time
- Consider their energy levels and life constraints
- Flag risks or gaps proactively
- Ground plans in behavior-change frameworks (SMART + WOOP + implementation intentions + habit stacking + friction reduction)
- Be safety-aware for health/finance sensitive goals; add gentle disclaimers for high-risk topics
- Be encouraging and motivating in all advice`;
