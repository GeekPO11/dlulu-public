import React, { useState, useEffect, useMemo } from 'react';
import { generateDailyQuote, generateDailyFocus, FocusSuggestion } from '../services/gemini';
import type { Goal, UserProfile } from '../types';
import type { CalendarEvent } from '../constants/calendarTypes';
import { logger } from '../lib/logger';
import { analytics, AnalyticsEvents } from '../lib/analytics';
import { cn } from '../lib/utils';
import ThemeToggle from './ThemeToggle';

// =============================================================================
// Types
// =============================================================================

interface DashboardProps {
  user: UserProfile;
  goals: Goal[];
  calendarEvents?: CalendarEvent[];
  onNavigateToGoals: (goalId?: string) => void;
  onNavigateToCalendar: () => void;
  onNavigateToSettings: () => void;
  onNavigateToChat?: () => void;
  onLogout: () => Promise<void>;
  onAddGoal?: () => void;
}

// =============================================================================
// Progress Ring Component (Stitch Style)
// =============================================================================

const ProgressRing: React.FC<{ progress: number; size?: number; stroke?: number; label?: string }> = ({
  progress,
  size = 56,
  stroke = 4,
  label
}) => {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative cursor-help" style={{ width: size, height: size }} title={label || `${progress}% complete`}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary) / 0.7)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
        {progress}%
      </span>
    </div>
  );
};

// =============================================================================
// Goal Card Component (Stitch Style)
// =============================================================================

const GoalCard: React.FC<{
  goal: Goal;
  onClick: () => void;
}> = ({ goal, onClick }) => {
  const handleClick = () => {
    analytics.track(AnalyticsEvents.GOAL_VIEWED, {
      goal_id: goal.id,
      goal_category: goal.category,
      goal_progress: goal.overallProgress || 0,
    });
    onClick();
  };
  const currentPhase = goal.phases[goal.currentPhaseIndex || 0];
  const nextMilestone = currentPhase?.milestones.find(m => !m.isCompleted);
  const nextAction = nextMilestone?.title || 'View roadmap';

  const categoryIcons: Record<string, string> = {
    fitness: 'directions_run',
    business: 'trending_up',
    learning: 'school',
    financial: 'attach_money',
    health: 'favorite',
    career: 'work',
    creative: 'palette',
    relationships: 'people',
    default: 'flag'
  };

  const icon = categoryIcons[goal.category] || categoryIcons.default;

  const categoryColors: Record<string, string> = {
    fitness: 'text-purple-400 bg-purple-400/10',
    business: 'text-primary bg-primary/10',
    learning: 'text-blue-400 bg-blue-400/10',
    financial: 'text-green-400 bg-green-400/10',
    health: 'text-rose-400 bg-rose-400/10',
    career: 'text-cyan-400 bg-cyan-400/10',
    creative: 'text-pink-400 bg-pink-400/10',
    relationships: 'text-amber-400 bg-amber-400/10',
    default: 'text-slate-400 bg-slate-400/10'
  };

  const colorClass = categoryColors[goal.category] || categoryColors.default;

  return (
    <div
      onClick={handleClick}
      className="bg-card/70 backdrop-blur-md border border-border p-6 rounded-xl cursor-pointer hover:border-primary/50 transition-all duration-300 group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-primary/20 transition-all"></div>

      <div className="flex justify-between items-start mb-8 relative z-10">
        <div className={`p-3 rounded-lg ${colorClass}`}>
          <span className="material-symbols-outlined text-2xl">{icon}</span>
        </div>

        {/* Progress Ring */}
        <div className="relative flex items-center justify-center">
          <ProgressRing progress={goal.overallProgress || 0} size={64} stroke={4} />
        </div>
      </div>

      <div className="relative z-10">
        <h3 className="text-foreground text-xl font-bold mb-2 line-clamp-2">
          {goal.title}
        </h3>

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mb-1">Next Action</p>
            <p className="text-primary text-base font-bold line-clamp-1">{nextAction}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-muted rounded-lg text-xs font-semibold text-muted-foreground">Phase {(goal.currentPhaseIndex || 0) + 1} of {goal.phases.length}</span>
            <span className={`px-2 py-1 rounded-lg text-xs font-semibold capitalize ${colorClass}`}>
              {goal.category}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Add Goal Card Component
// =============================================================================

const AddGoalCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div
    onClick={onClick}
    data-wt="dash-add-goal"
    className="glass-surface p-5 rounded-2xl cursor-pointer hover:scale-[1.02] transition-all duration-300 border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center min-h-[200px] text-center group"
  >
    <div className="w-14 h-14 rounded-2xl bg-card flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
      <span className="material-symbols-outlined text-3xl text-slate-400 group-hover:text-primary transition-colors">add</span>
    </div>
    <h3 className="text-foreground font-semibold text-lg mb-2">Start a New Ambition</h3>
    <p className="text-muted-foreground text-sm">Let AI help you architect your next major life milestone.</p>
  </div>
);



// =============================================================================
// Dashboard Component
// =============================================================================

const Dashboard: React.FC<DashboardProps> = ({
  user,
  goals,
  calendarEvents = [],
  onNavigateToGoals,
  onNavigateToCalendar,
  onNavigateToSettings,
  onNavigateToChat,
  onLogout,
  onAddGoal,
}) => {
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [dailyQuote, setDailyQuote] = useState<string>('');
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [focusSuggestions, setFocusSuggestions] = useState<FocusSuggestion[]>([]);
  const [isLoadingFocus, setIsLoadingFocus] = useState(true);
  const [completedFocus, setCompletedFocus] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const hashValue = (value: string): string => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
    }
    return hash.toString(36);
  };

  // Filter goals based on search query
  const filteredGoals = useMemo(() => {
    if (!searchQuery.trim()) return goals;
    const query = searchQuery.toLowerCase();
    return goals.filter(g =>
      g.title.toLowerCase().includes(query) ||
      g.category.toLowerCase().includes(query) ||
      g.strategyOverview?.toLowerCase().includes(query)
    );
  }, [goals, searchQuery]);

  // =============================================================================
  // Computed Stats - Only Active Manifestations
  // =============================================================================

  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

  const stats = useMemo(() => {
    const activeManifestations = goals.filter(g => g.status === 'active');
    const pausedManifestations = goals.filter(g => g.status === 'paused');
    const abandonedManifestations = goals.filter(g => g.status === 'abandoned');
    const completedManifestations = goals.filter(g => g.status === 'completed');

    const totalProgress = activeManifestations.reduce((acc, g) => acc + (g.overallProgress || 0), 0);
    const avgProgress = activeManifestations.length > 0 ? Math.round(totalProgress / activeManifestations.length) : 0;

    // --- NEW: Accurate "Wins" Calculation (Supabase Data) ---
    // Count all completed milestones across all goals (active or not)
    // We dig deep: Goal -> Phases -> Milestones.isCompleted
    const completedMilestones = goals.flatMap(g =>
      g.phases.flatMap(p => p.milestones.filter(m => m.isCompleted))
    );
    const completedTasksCount = completedMilestones.length;


    // --- NEW: Rolling 24-Hour Task Streak Logic ---
    // 1. Collect all completion timestamps from Milestones, Tasks, and Subtasks
    const allCompletions: number[] = [];

    goals.forEach(g => {
      g.phases.forEach(p => {
        p.milestones.forEach(m => {
          if (m.isCompleted && m.completedAt) allCompletions.push(new Date(m.completedAt).getTime());

          m.tasks?.forEach(t => {
            if (t.isCompleted && t.completedAt) allCompletions.push(new Date(t.completedAt).getTime());

            t.subTasks?.forEach(st => {
              if (st.isCompleted && st.completedAt) allCompletions.push(new Date(st.completedAt).getTime());
            });
          });
        });
      });
    });

    // Sort descending (Newest first)
    allCompletions.sort((a, b) => b - a);

    let streakScore = 0;
    let expiryTime: number | null = null;
    const uniqueDays = new Set<string>();
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    if (allCompletions.length > 0) {
      const mostRecent = allCompletions[0];

      // Check 1: Is the streak currently active? (Last task within 24h?)
      if (now - mostRecent <= TWENTY_FOUR_HOURS) {

        // Loop backwards to find the length of the chain
        // We start with the most recent task as valid
        const chain: number[] = [mostRecent];

        for (let i = 1; i < allCompletions.length; i++) {
          const current = allCompletions[i - 1]; // newer
          const previous = allCompletions[i];  // older

          const gap = current - previous;
          if (gap <= TWENTY_FOUR_HOURS) {
            chain.push(previous);
          } else {
            break; // Chain broken
          }
        }

        // Calculate "Day Score" based on unique calendar days in the chain
        chain.forEach(ms => {
          // Use local date string to count distinct days based on user's locale
          uniqueDays.add(new Date(ms).toDateString());
        });

        streakScore = uniqueDays.size;
        expiryTime = mostRecent + TWENTY_FOUR_HOURS;
      } else {
        streakScore = 0; // Streak broken
      }
    }


    const highLeverageActions = activeManifestations
      .map(g => {
        const phase = g.phases[g.currentPhaseIndex || 0];
        const milestone = phase?.milestones.find(m => !m.isCompleted);
        return milestone ? { goal: g, action: milestone.title } : null;
      })
      .filter(Boolean);

    return {
      active: activeManifestations.length,
      paused: pausedManifestations.length,
      abandoned: abandonedManifestations.length,
      completed: completedManifestations.length,
      total: goals.length,
      avgProgress,
      completedTasks: completedTasksCount,
      // Removed legacy sprints usage
      streak: streakScore,
      streakExpiry: expiryTime,
      activeManifestations,
      highLeverageCount: highLeverageActions.length,
    };
  }, [goals]); // Removed sprints dependency

  const focusGoalFingerprint = useMemo(() => {
    const parts = stats.activeManifestations.map((goal) => {
      const completedMilestones = goal.phases.reduce(
        (sum, phase) => sum + phase.milestones.filter((milestone) => milestone.isCompleted).length,
        0
      );
      const completedTasks = goal.phases.reduce(
        (sum, phase) => sum + phase.milestones.reduce(
          (milestoneSum, milestone) => milestoneSum + (milestone.tasks || []).filter((task) => task.isCompleted).length,
          0
        ),
        0
      );

      return [
        goal.id,
        goal.updatedAt ? new Date(goal.updatedAt).toISOString() : '',
        goal.currentPhaseIndex,
        goal.overallProgress,
        completedMilestones,
        completedTasks,
      ].join(':');
    });

    return hashValue(parts.sort().join('|'));
  }, [stats.activeManifestations]);

  const todayEventFingerprint = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const parts = calendarEvents
      .filter((event) => {
        const eventDate = event.start?.dateTime || event.start?.date || '';
        return String(eventDate).startsWith(today);
      })
      .map((event) => [
        event.id,
        event.summary,
        event.start?.dateTime || event.start?.date || '',
        event.end?.dateTime || event.end?.date || '',
        event.status || '',
        event.taskId || event.subtaskId || event.milestoneId || '',
      ].join(':'));

    return hashValue(parts.sort().join('|'));
  }, [calendarEvents]);

  // --- Streak Countdown Timer ---
  useEffect(() => {
    if (!stats.streakExpiry) {
      setTimeRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = stats.streakExpiry! - now;

      if (diff <= 0) {
        setTimeRemaining("Expired");
        // In a real app, you might trigger a re-calc or refresh here
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeRemaining(`${hours}h ${minutes}m left`);
      }
    }, 60000); // Update every minute

    // Initial set
    const now = Date.now();
    const diff = stats.streakExpiry - now;
    if (diff > 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeRemaining(`${hours}h ${minutes}m left`);
    } else {
      setTimeRemaining("Expired");
    }

    return () => clearInterval(interval);
  }, [stats.streakExpiry]);

  // =============================================================================
  // Load Daily Quote
  // =============================================================================

  useEffect(() => {
    const loadQuote = async () => {
      setIsLoadingQuote(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const activeGoalIds = stats.activeManifestations.map(g => g.id).sort().join(',');
        const cacheKey = `dlulu_daily_quote_${today}_${activeGoalIds}`;
        const cachedQuote = localStorage.getItem(cacheKey);

        if (cachedQuote) {
          setDailyQuote(cachedQuote);
          setIsLoadingQuote(false);
          return;
        }

        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(`dlulu_daily_quote_${today}`) && key !== cacheKey) {
            localStorage.removeItem(key);
          }
        });

        const goalTitles = stats.activeManifestations.map(g => g.title).join(', ');
        const quote = await generateDailyQuote({
          role: user.role,
          goals: goalTitles,
          progress: stats.avgProgress,
        });

        setDailyQuote(quote);
        localStorage.setItem(cacheKey, quote);
      } catch (error) {
        logger.error('Failed to load daily quote', error);
        setDailyQuote("Your future self is watching you right now through your choices.");
      } finally {
        setIsLoadingQuote(false);
      }
    };

    loadQuote();
  }, [user.role, stats.activeManifestations, stats.avgProgress]);

  // =============================================================================
  // Load Focus Suggestions
  // =============================================================================

  useEffect(() => {
    const loadFocus = async () => {
      setIsLoadingFocus(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const doneKey = `dlulu_focus_done_${today}`;
        try {
          const doneRaw = localStorage.getItem(doneKey);
          const doneIds = doneRaw ? JSON.parse(doneRaw) : [];
          if (Array.isArray(doneIds)) setCompletedFocus(new Set(doneIds));
        } catch {
          setCompletedFocus(new Set());
        }

        const cacheKey = `dlulu_focus_v3_${today}_${focusGoalFingerprint}_${todayEventFingerprint}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
          setFocusSuggestions(JSON.parse(cached));
          setIsLoadingFocus(false);
          return;
        }

        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(`dlulu_focus_v2_${today}`) && key !== cacheKey) {
            localStorage.removeItem(key);
          }
        });

        const todayEvents = calendarEvents
          .filter(e => {
            const eventDate = e.start?.dateTime || e.start?.date || '';
            return eventDate.toString().startsWith(today);
          })
          .map(e => ({
            summary: e.summary || '',
            start: String(e.start?.dateTime || e.start?.date || '').slice(11, 16) || '00:00',
            end: String(e.end?.dateTime || e.end?.date || '').slice(11, 16) || '00:00',
          }));

        const suggestions = await generateDailyFocus({
          goals: stats.activeManifestations.map(g => ({
            id: g.id,
            title: g.title,
            progress: g.overallProgress || 0,
            phases: g.phases,
            currentPhaseIndex: g.currentPhaseIndex,
            frequency: g.frequency,
            duration: g.duration,
          })),
          todayEvents,
          userProfile: {
            role: user.role,
            chronotype: user.chronotype,
            energyLevel: user.energyLevel,
          },
        });

        setFocusSuggestions(suggestions);
        localStorage.setItem(cacheKey, JSON.stringify(suggestions));
      } catch (error) {
        logger.error('Failed to load focus suggestions', error);
      } finally {
        setIsLoadingFocus(false);
      }
    };

    loadFocus();
  }, [stats.activeManifestations, calendarEvents, user, focusGoalFingerprint, todayEventFingerprint]);

  // =============================================================================
  // Greeting
  // =============================================================================

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good morning`;
    if (hour < 17) return `Good afternoon`;
    return `Good evening`;
  }, []);

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className="min-h-screen bg-background text-foreground pb-28 relative overflow-x-hidden">
      {/* Background Ambient Glow */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] rounded-full bg-blue-500/5 blur-[100px]"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 px-4 sm:px-6 lg:px-12 py-3 sm:py-4 glass-nav">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4 sm:gap-8 min-w-0">
            <div className="flex items-center gap-3 sm:gap-4 text-foreground min-w-0">
              <div className="w-8 h-8 flex items-center justify-center">
                <img src="/logoFinal.png" className="w-full h-full object-contain" alt="Dlulu Logo" />
              </div>
              <h2 className="text-foreground text-lg sm:text-xl font-bold leading-tight tracking-tight truncate">dlulu life</h2>
            </div>
            {/* Removed Nav Links as requested */}
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-stretch rounded-xl h-10 bg-card/60 border border-border overflow-hidden w-64">
              <div className="text-muted-foreground flex items-center justify-center pl-4">
                <span className="material-symbols-outlined text-lg">search</span>
              </div>
              <input
                type="text"
                placeholder="Search by title, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none w-full px-4 pl-2"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>
            <div className="flex gap-2 items-center relative">
              <ThemeToggle />

              {/* Notifications Button */}
              <button
                onClick={() => {
                  alert('Notifications\n\nReal-time notifications are coming soon!\n\nYou will be notified about:\n• Upcoming scheduled sessions\n• Milestone deadlines\n• Solulu insights\n• Progress celebrations');
                }}
                className="w-10 h-10 rounded-xl bg-card/60 hover:bg-card border border-border text-muted-foreground hover:text-foreground flex items-center justify-center transition-all relative"
                title="Notifications (coming soon)"
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                {/* Future: Add notification badge here */}
              </button>

              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="w-10 h-10 rounded-full bg-brand-gradient flex items-center justify-center text-primary-foreground font-bold border-2 border-primary/50 hover:scale-105 transition-transform"
                >
                  {user.name?.charAt(0) || 'U'}
                </button>

                {isProfileDropdownOpen && (
                  <div className="absolute top-12 right-0 w-48 bg-popover border border-border rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <button
                      onClick={() => { setIsProfileDropdownOpen(false); onNavigateToSettings(); }}
                      className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-lg">settings</span>
                      Settings
                    </button>
                    <div className="h-px bg-border my-1"></div>
                    <button
                      onClick={() => { setIsProfileDropdownOpen(false); onLogout(); }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-lg">logout</span>
                      Log Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-12 pt-6 sm:pt-8 pb-4">
        {/* Title Section */}
        <div className="flex flex-wrap justify-between items-end gap-3 mb-8 sm:mb-10">
          <div className="flex flex-col gap-2" data-wt="dash-title">
            <h1 className="text-foreground text-3xl sm:text-4xl lg:text-5xl font-black leading-tight tracking-tight">Ambition Dashboard</h1>
            <p className="text-muted-foreground text-base sm:text-lg font-normal">
              {greeting}, {user.name?.split(' ')[0]}. Your AI has identified{' '}
              <span className="text-primary font-bold">{stats.highLeverageCount} high-leverage actions</span> for today.
            </p>
          </div>

        </div>

        {/* Quote & Focus Section - Grid Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.9fr)_minmax(16rem,0.85fr)] items-start gap-4 sm:gap-6 mb-8">
          {/* Left Column: Daily Motivation Quote */}
          <div className="glass-surface rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 flex flex-col min-h-[170px]">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <span className="material-symbols-outlined text-primary text-xl">format_quote</span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-wider text-primary font-bold">Today</span>
                </div>
              </div>
              <button
                onClick={() => {
                  // Clear cache for today and refetch
                  const today = new Date().toISOString().split('T')[0];
                  Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('dlulu_daily_quote_' + today)) {
                      localStorage.removeItem(key);
                    }
                  });
                  setIsLoadingQuote(true);
                  setDailyQuote('');
                  // Trigger refetch by updating state
                  setTimeout(() => window.location.reload(), 100);
                }}
                className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                title="Get new quote"
                disabled={isLoadingQuote}
              >
                <span className={`material-symbols-outlined text-sm ${isLoadingQuote ? 'animate-spin' : ''}`}>refresh</span>
              </button>
            </div>
            <p className="text-base sm:text-lg font-medium text-foreground leading-relaxed italic">
              "{isLoadingQuote ? "Loading..." : dailyQuote}"
            </p>
          </div>

          {/* Middle Column: Focus Today (Span 2) */}
          <div className="glass-surface rounded-2xl p-4 sm:p-5" data-wt="dash-focus">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <span className="material-symbols-outlined text-emerald-500 text-xl">auto_awesome</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground leading-none">Focus</h2>
                  <p className="text-sm text-muted-foreground mt-1">Next best actions</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {isLoadingFocus && <div className="h-20 bg-card/60 animate-pulse rounded-xl" />}
              {focusSuggestions.map((suggestion) => {
                const isCompleted = completedFocus.has(suggestion.id);
                const metaBadge = (
                  <>
                    <span className="text-xs font-semibold text-foreground/80">
                      {suggestion.estimatedDuration}m
                    </span>
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap",
                      isCompleted ? 'text-emerald-500 bg-emerald-500/10' : 'text-primary bg-primary/10'
                    )}>
                      {isCompleted ? 'Done' : suggestion.priority}
                    </span>
                  </>
                );
                return (
                  <div
                    key={suggestion.id}
                    className={cn(
                      "grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] items-start gap-3 p-3 rounded-lg border transition-all overflow-hidden",
                      suggestion.goalId ? "cursor-pointer" : "cursor-default",
                      isCompleted
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-card/60 border-transparent hover:border-border'
                    )}
                    onClick={() => {
                      if (!suggestion.goalId) return;
                      onNavigateToGoals(suggestion.goalId);
                    }}
                  >
                    <button
                      type="button"
                      className={cn(
                        "mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                        isCompleted
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-border hover:border-foreground/40'
                      )}
                      aria-label={isCompleted ? "Mark focus item as not done" : "Mark focus item as done"}
                      onClick={(e) => {
                        e.stopPropagation();
                        const today = new Date().toISOString().split('T')[0];
                        const doneKey = `dlulu_focus_done_${today}`;
                        setCompletedFocus(prev => {
                          const next = new Set(prev);
                          if (next.has(suggestion.id)) next.delete(suggestion.id);
                          else next.add(suggestion.id);
                          localStorage.setItem(doneKey, JSON.stringify(Array.from(next)));
                          return next;
                        });
                      }}
                    >
                      {isCompleted && <span className="material-symbols-outlined text-white text-sm">check</span>}
                    </button>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <p className={cn(
                          "font-bold text-sm leading-snug break-words min-w-0 flex-1",
                          isCompleted ? 'text-emerald-400 line-through' : 'text-foreground'
                        )}>
                          {suggestion.title}
                        </p>
                        {suggestion.goalTitle && (
                          <span className="inline-flex max-w-[13rem] truncate text-xs font-semibold px-2 py-0.5 rounded-full bg-muted/80 text-foreground/85 border border-border shrink-0">
                            {suggestion.goalTitle}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground/95 leading-snug break-words">
                        {suggestion.reason}
                      </p>
                      <div className="flex items-center gap-2 sm:hidden">
                        {metaBadge}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      {metaBadge}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Stats (Span 1) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-surface rounded-xl p-3 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-bold text-foreground">{stats.active}</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Active</span>
            </div>
            <div className="glass-surface rounded-xl p-3 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-bold text-emerald-400">{stats.completed}</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Completed</span>
            </div>
            <div
              className="glass-surface rounded-xl p-3 flex flex-col items-center justify-center text-center cursor-help"
              title={`Paused: ${stats.paused} | Archived: ${stats.abandoned}`}
            >
              <span className="text-xl font-bold text-foreground">{stats.completedTasks}</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Wins</span>
              {(stats.paused > 0 || stats.abandoned > 0) && (
                <span className="text-[8px] text-amber-400/60 mt-0.5">
                  {stats.paused > 0 && `${stats.paused} paused`}
                  {stats.paused > 0 && stats.abandoned > 0 && ' · '}
                  {stats.abandoned > 0 && `${stats.abandoned} archived`}
                </span>
              )}
            </div>
            <div className="glass-surface rounded-xl p-3 flex flex-col items-center justify-center text-center relative min-h-[90px]">
              <div className="flex flex-col items-center mb-1">
                <span className="text-xl font-bold text-foreground">{stats.streak}</span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Streak</span>
              </div>
              {timeRemaining && (
                <div className="absolute bottom-2 left-0 w-full flex justify-center">
                  <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full animate-pulse">
                    {timeRemaining}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Goals Grid */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Your Ambitions</h2>
          <button onClick={() => onNavigateToGoals()} className="text-sm font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 shrink-0">
            VIEW ALL
            <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-6" data-wt="dash-goals">
          {/* Show search results or active manifestations */}
          {(searchQuery ? filteredGoals.filter(g => g.status === 'active') : stats.activeManifestations).map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onClick={() => onNavigateToGoals(goal.id)}
            />
          ))}

          {/* Show "no results" message when searching */}
          {searchQuery && filteredGoals.filter(g => g.status === 'active').length === 0 && (
            <div className="col-span-full text-center py-12">
              <span className="material-symbols-outlined text-4xl text-muted-foreground mb-4 block">search_off</span>
              <p className="text-muted-foreground">No ambitions found matching "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 text-primary hover:underline text-sm"
              >
                Clear search
              </button>
            </div>
          )}

          {onAddGoal && !searchQuery && (
            <AddGoalCard onClick={onAddGoal} />
          )}
        </div>
      </main>


      {/* Floating Action Button */}
      {onAddGoal && (
        <div
          className="fixed right-4 sm:right-8 z-40"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 7.25rem)' }}
        >
          <button
            onClick={onAddGoal}
            className="flex w-14 h-14 sm:w-16 sm:h-16 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 hover:scale-110 transition-transform active:scale-95 group"
            title="Add new ambition"
            aria-label="Add new ambition"
          >
            <span className="material-symbols-outlined text-3xl transition-transform group-hover:rotate-90">add</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
