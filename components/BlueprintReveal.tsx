import React from 'react';
import type { Goal } from '../types';
import PhaseExplorer from './PhaseExplorer';
import OnboardingHeader from './OnboardingHeader';

interface BlueprintRevealProps {
    goal: Goal;
    goalIndex: number;
    totalGoals: number;
    onNextGoal: () => void;
    onPrevGoal: () => void;
    onStartPlan?: () => void; // Only present on the last goal
    onClose: () => void;
    isAddGoalMode?: boolean;
    onBack?: () => void;
}

const BlueprintReveal: React.FC<BlueprintRevealProps> = ({
    goal,
    goalIndex,
    totalGoals,
    onNextGoal,
    onPrevGoal,
    onStartPlan,
    onClose,
    isAddGoalMode = false,
    onBack
}) => {
    const isLastGoal = goalIndex === totalGoals - 1;

    return (
        <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
            <OnboardingHeader
                progressStep={2}
                isAddGoalMode={isAddGoalMode}
                onClose={onClose}
            />

            <div className="mt-16 flex items-center justify-between border-b border-border px-6 py-4 bg-card/80 z-20 shrink-0">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                    )}

                    <div className="size-8 flex items-center justify-center rounded bg-primary/10 text-primary">
                        <span className="material-symbols-outlined text-xl">dataset</span>
                    </div>
                    <div>
                        <h2 className="text-base font-bold leading-tight tracking-tight">Blueprint Explorer</h2>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">AI-generated strategic roadmap</p>
                    </div>
                </div>

                {/* Goal Navigation */}
                <div className="flex items-center gap-6" data-wt="ob-blueprint-nav">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onPrevGoal}
                            disabled={goalIndex === 0 && !onBack}
                            className={`p-2 rounded-lg transition-colors ${(goalIndex === 0 && !onBack) ? 'text-muted-foreground/40' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                            <span className="material-symbols-outlined">chevron_left</span>
                        </button>
                        <div className="text-right">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Ambition {goalIndex + 1}/{totalGoals}</p>
                            <p className="text-sm font-bold text-foreground truncate max-w-[240px]">{goal.title}</p>
                        </div>
                        <button
                            onClick={onNextGoal}
                            disabled={isLastGoal}
                            className={`p-2 rounded-lg transition-colors ${isLastGoal ? 'text-muted-foreground/40' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                            <span className="material-symbols-outlined">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto px-6 py-6">
                    <div className="mx-auto w-full max-w-6xl" data-wt="ob-blueprint-content">
                        <PhaseExplorer goal={goal} readOnly />
                    </div>
                </div>
            </main>

            {/* Footer Status Bar */}
            <footer className="h-12 bg-card/80 border-t border-border px-6 flex items-center justify-between z-30 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-[10px] font-bold text-muted-foreground tracking-wider">SYSTEM ONLINE</span>
                    </div>
                    <div className="h-4 w-px bg-border"></div>
                    <span className="text-[10px] text-muted-foreground">Synced just now</span>
                </div>

                {onStartPlan && isLastGoal && (
                    <button
                        onClick={onStartPlan}
                        data-wt="ob-blueprint-start"
                        className="bg-brand-gradient glow-button hover:brightness-110 text-primary-foreground text-xs font-bold py-2 px-6 rounded-lg flex items-center gap-2 transition-all"
                    >
                        <span>INITIATE PROTOCOL</span>
                        <span className="material-symbols-outlined text-sm">rocket_launch</span>
                    </button>
                )}
            </footer>
        </div>
    );
};

export default BlueprintReveal;
