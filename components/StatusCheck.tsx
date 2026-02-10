// =============================================================================
// STATUS CHECK - Goal Prerequisites Verification Component
// Step 3 in onboarding: User verifies completed prerequisites per goal
// =============================================================================

import React, { useState } from 'react';
import OnboardingHeader from './OnboardingHeader';

// =============================================================================
// Types
// =============================================================================

export interface Prerequisite {
    id: string;
    label: string;
    order: number;
    isCompleted: boolean;
    comment?: string; // User's description of what they've done
}

export interface AnalyzedGoal {
    title: string;
    originalInput: string;
    category: 'health' | 'career' | 'learning' | 'personal' | 'financial' | 'relationships';
    timeline: string;
    estimatedWeeks: number;
    prerequisites: Prerequisite[];
}

interface StatusCheckProps {
    goals: AnalyzedGoal[];
    onComplete: (goalContexts: GoalContext[]) => void;
    onBack: () => void;
    onClose?: () => void;
    isAddGoalMode?: boolean;
}

export interface GoalContext {
    goalTitle: string;
    completedPrerequisites: string[];
    skippedPrerequisites: string[];
    additionalNotes: string;
    prerequisiteComments: Record<string, string>; // prereqId -> comment
}

// =============================================================================
// Category Icons & Colors
// =============================================================================

const CATEGORY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    health: { icon: 'favorite', label: 'HEALTH', color: 'text-rose-400' },
    career: { icon: 'work', label: 'CAREER', color: 'text-primary' },
    learning: { icon: 'school', label: 'LEARNING', color: 'text-blue-400' },
    personal: { icon: 'self_improvement', label: 'PERSONAL', color: 'text-purple-400' },
    financial: { icon: 'payments', label: 'FINANCIAL', color: 'text-green-400' },
    relationships: { icon: 'group', label: 'RELATIONSHIPS', color: 'text-pink-400' },
};

// =============================================================================
// Component
// =============================================================================

const StatusCheck: React.FC<StatusCheckProps> = ({
    goals,
    onComplete,
    onBack,
    onClose,
    isAddGoalMode = false,
}) => {
    const [currentGoalIndex, setCurrentGoalIndex] = useState(0);
    const [goalStates, setGoalStates] = useState<Record<number, {
        prerequisites: Prerequisite[];
        additionalNotes: string;
    }>>(() => {
        // Initialize state for all goals
        const initial: Record<number, { prerequisites: Prerequisite[]; additionalNotes: string }> = {};
        goals.forEach((goal, index) => {
            initial[index] = {
                prerequisites: goal.prerequisites.map(p => ({ ...p, isCompleted: false, comment: '' })),
                additionalNotes: '',
            };
        });
        return initial;
    });

    // Track which prerequisite has comment input expanded
    const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);

    const currentGoal = goals[currentGoalIndex];
    const currentState = goalStates[currentGoalIndex];
    const totalGoals = goals.length;
    const isFirstGoal = currentGoalIndex === 0;
    const isLastGoal = currentGoalIndex === totalGoals - 1;

    const categoryConfig = CATEGORY_CONFIG[currentGoal?.category] || CATEGORY_CONFIG.personal;

    // Toggle prerequisite completion
    const handleTogglePrerequisite = (prereqId: string) => {
        setGoalStates(prev => {
            const current = prev[currentGoalIndex];
            const updatedPrereqs = current.prerequisites.map(p => {
                if (p.id === prereqId) {
                    const newCompleted = !p.isCompleted;
                    // If unchecking, also collapse comment and clear it
                    if (!newCompleted) {
                        setExpandedCommentId(null);
                        return { ...p, isCompleted: false, comment: '' };
                    }
                    // If checking, expand comment input
                    setExpandedCommentId(prereqId);
                    return { ...p, isCompleted: true };
                }
                return p;
            });
            return {
                ...prev,
                [currentGoalIndex]: { ...current, prerequisites: updatedPrereqs }
            };
        });
    };

    // Update prerequisite comment
    const handleCommentChange = (prereqId: string, comment: string) => {
        setGoalStates(prev => {
            const current = prev[currentGoalIndex];
            const updatedPrereqs = current.prerequisites.map(p =>
                p.id === prereqId ? { ...p, comment } : p
            );
            return {
                ...prev,
                [currentGoalIndex]: { ...current, prerequisites: updatedPrereqs }
            };
        });
    };

    // Update additional notes
    const handleNotesChange = (notes: string) => {
        setGoalStates(prev => ({
            ...prev,
            [currentGoalIndex]: { ...prev[currentGoalIndex], additionalNotes: notes }
        }));
    };

    // Navigation
    const handlePreviousGoal = () => {
        if (!isFirstGoal) {
            setCurrentGoalIndex(prev => prev - 1);
            setExpandedCommentId(null);
        } else {
            onBack();
        }
    };

    const handleNextGoal = () => {
        if (!isLastGoal) {
            setCurrentGoalIndex(prev => prev + 1);
            setExpandedCommentId(null);
        }
    };

    // Complete verification for all goals
    const handleComplete = () => {
        const goalContexts: GoalContext[] = goals.map((goal, index) => {
            const state = goalStates[index];
            const completed = state.prerequisites.filter(p => p.isCompleted).map(p => p.label);
            const skipped = state.prerequisites.filter(p => !p.isCompleted).map(p => p.label);
            const comments: Record<string, string> = {};
            state.prerequisites.forEach(p => {
                if (p.comment) comments[p.id] = p.comment;
            });
            return {
                goalTitle: goal.title,
                completedPrerequisites: completed,
                skippedPrerequisites: skipped,
                additionalNotes: state.additionalNotes,
                prerequisiteComments: comments,
            };
        });
        onComplete(goalContexts);
    };

    // Intake questions now run before this step.
    const onboardingProgress = 85;

    if (!currentGoal) return null;

    // Split prerequisites into 2 columns
    const prereqs = currentState.prerequisites;
    const midPoint = Math.ceil(prereqs.length / 2);
    const leftColumn = prereqs.slice(0, midPoint);
    const rightColumn = prereqs.slice(midPoint);

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <OnboardingHeader
                progressStep={2}
                isAddGoalMode={isAddGoalMode}
                onClose={onClose || onBack}
            />

            {/* Status Context Bar */}
            <div className="mt-16 flex items-center justify-between px-6 py-4 glass-nav border-b border-border" data-wt="ob-status-header">
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider">
                        Ambition {currentGoalIndex + 1} of {totalGoals}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                        Step 4: Verification
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Onboarding Progress</span>
                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${onboardingProgress}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-[720px]">
                    {/* Goal Header */}
                    {/* Goal Header */}
                    <div className="flex flex-col md:flex-row items-start gap-6 mb-8">
                        <div className="flex flex-col items-center md:items-start gap-3 shrink-0">
                            <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-primary/10">
                                <span className="material-symbols-outlined text-primary text-3xl">flag</span>
                            </div>
                            <span className={`inline-block px-3 py-1 rounded-full bg-muted text-[10px] font-bold uppercase tracking-widest ${categoryConfig.color}`}>
                                {categoryConfig.label}
                            </span>
                        </div>

                        <div className="flex-1 text-center md:text-left pt-1">
                            <h1 className="text-foreground text-3xl md:text-4xl font-bold leading-tight mb-2">
                                What have you already completed?
                            </h1>
                            <p className="text-primary font-medium text-sm">
                                We will skip these steps in your personalized roadmap.
                            </p>
                        </div>
                    </div>

                    {/* Goal Context Card */}
                    <div className="bg-card/60 border border-border rounded-2xl p-6 mb-8 flex flex-col items-center text-center">
                        <h2 className="text-foreground text-xl font-bold">{currentGoal.title}</h2>
                    </div>

                    {/* Prerequisites Card Container */}
                    <div className="bg-card/90 border border-border rounded-2xl p-6 md:p-8 mb-8 shadow-xl" data-wt="ob-status-prereqs">
                        {/* Prerequisites Grid - 2 Columns */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                            {/* Left Column */}
                            <div className="space-y-4">
                                {leftColumn.map(prereq => (
                                    <PrerequisiteItem
                                        key={prereq.id}
                                        prereq={prereq}
                                        isExpanded={expandedCommentId === prereq.id}
                                        onToggle={() => handleTogglePrerequisite(prereq.id)}
                                        onCommentChange={(comment) => handleCommentChange(prereq.id, comment)}
                                        onExpandComment={() => setExpandedCommentId(prereq.id)}
                                        onCollapseComment={() => setExpandedCommentId(null)}
                                    />
                                ))}
                            </div>
                            {/* Right Column */}
                            <div className="space-y-4">
                                {rightColumn.map(prereq => (
                                    <PrerequisiteItem
                                        key={prereq.id}
                                        prereq={prereq}
                                        isExpanded={expandedCommentId === prereq.id}
                                        onToggle={() => handleTogglePrerequisite(prereq.id)}
                                        onCommentChange={(comment) => handleCommentChange(prereq.id, comment)}
                                        onExpandComment={() => setExpandedCommentId(prereq.id)}
                                        onCollapseComment={() => setExpandedCommentId(null)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Additional Context */}
                    <div className="mb-8">
                        <label className="block text-muted-foreground text-sm mb-2">
                            Additional Context (Optional)
                        </label>
                        <textarea
                            value={currentState.additionalNotes}
                            onChange={(e) => handleNotesChange(e.target.value)}
                            placeholder="Add any specific requirements or notes for this ambition..."
                            className="w-full bg-card/60 border border-border rounded-xl p-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none min-h-[100px]"
                        />
                    </div>
                </div>
            </main>

            {/* Footer Navigation */}
            <div className="border-t border-border px-6 py-4" data-wt="ob-status-action">
                <div className="max-w-[720px] mx-auto flex items-center justify-between">
                    {/* Previous Button */}
                    <button
                        onClick={handlePreviousGoal}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-card/60 border border-border text-foreground hover:bg-card transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                        <span className="text-sm font-medium">
                            {isFirstGoal ? 'Back' : 'Previous Ambition'}
                        </span>
                    </button>

                    {/* Goal Progress Dots */}
                    <div className="flex items-center gap-2">
                        {goals.map((_, index) => (
                            <div
                                key={index}
                                className={`w-2 h-2 rounded-full transition-all ${index === currentGoalIndex
                                    ? 'w-3 bg-primary'
                                    : index < currentGoalIndex
                                        ? 'bg-primary/60'
                                        : 'bg-muted'
                                    }`}
                            />
                        ))}
                    </div>

                    {/* Next / Generate Button */}
                    {isLastGoal ? (
                        <button
                            onClick={handleComplete}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-gradient text-primary-foreground font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/25"
                        >
                            <span>Generate Blueprint</span>
                            <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                        </button>
                    ) : (
                        <button
                            onClick={handleNextGoal}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:brightness-110 transition-all"
                        >
                            <span>Next Ambition</span>
                            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// =============================================================================
// Prerequisite Item Sub-Component
// =============================================================================

interface PrerequisiteItemProps {
    prereq: Prerequisite;
    isExpanded: boolean;
    onToggle: () => void;
    onCommentChange: (comment: string) => void;
    onExpandComment: () => void;
    onCollapseComment: () => void;
}

const PrerequisiteItem: React.FC<PrerequisiteItemProps> = ({
    prereq,
    isExpanded,
    onToggle,
    onCommentChange,
    onExpandComment,
    onCollapseComment,
}) => {
    return (
        <div className="group">
            <button
                onClick={onToggle}
                className="flex items-start gap-3 w-full text-left py-1 group"
            >
                {/* Custom Checkbox */}
                <div className={`flex-shrink-0 size-6 rounded-full border-2 flex items-center justify-center transition-all ${prereq.isCompleted
                    ? 'bg-primary border-primary'
                    : 'border-border hover:border-primary/50'
                    }`}>
                    {prereq.isCompleted && (
                        <span className="material-symbols-outlined text-primary-foreground text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                            check
                        </span>
                    )}
                </div>
                {/* Label */}
                <span className="text-sm leading-relaxed transition-colors text-foreground font-medium">
                    {prereq.label}
                </span>
            </button>

            {/* Comment Input (shows after checkmark) */}
            {prereq.isCompleted && (
                <div className="ml-9 mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    {isExpanded ? (
                        <div className="space-y-2">
                            <input
                                type="text"
                                value={prereq.comment || ''}
                                onChange={(e) => onCommentChange(e.target.value)}
                                placeholder="Describe what you did..."
                                className="w-full bg-card/60 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                                autoFocus
                            />
                            <div className="flex justify-end">
                                <button
                                    onClick={onCollapseComment}
                                    className="text-xs text-primary hover:text-primary/80"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={onExpandComment}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                            <span className="material-symbols-outlined text-[14px]">add_circle</span>
                            <span>{prereq.comment ? 'Edit note' : 'Add note'}</span>
                            {prereq.comment && (
                                <span className="text-muted-foreground/70 ml-1 truncate max-w-[150px]">
                                    — {prereq.comment}
                                </span>
                            )}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default StatusCheck;
