import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import type { Goal } from '../types';

// =============================================================================
// Motivational Quotes
// =============================================================================

const MOTIVATIONAL_QUOTES = [
    { quote: "You did what you said you would do. That's powerful.", author: "Unknown" },
    { quote: "The secret of getting ahead is getting started. You've done both.", author: "Mark Twain" },
    { quote: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
    { quote: "You've proven that your dreams are not just dreams.", author: "dlulu life" },
    { quote: "What seemed impossible is now your new normal.", author: "Unknown" },
    { quote: "Every accomplishment starts with the decision to try. You tried and won.", author: "Unknown" },
    { quote: "You manifested this. Believe in your next ambition just as much.", author: "dlulu life" },
    { quote: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
];

// =============================================================================
// Confetti Component
// =============================================================================

const Confetti: React.FC = () => {
    const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 3}s`,
        duration: `${2 + Math.random() * 2}s`,
        color: ['#f97316', '#f43f5e', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'][Math.floor(Math.random() * 6)],
        size: `${6 + Math.random() * 8}px`,
    }));

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {confettiPieces.map((piece) => (
                <div
                    key={piece.id}
                    className="absolute animate-confetti"
                    style={{
                        left: piece.left,
                        top: '-20px',
                        width: piece.size,
                        height: piece.size,
                        backgroundColor: piece.color,
                        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                        animationDelay: piece.delay,
                        animationDuration: piece.duration,
                    }}
                />
            ))}
            <style>{`
                @keyframes confetti {
                    0% {
                        transform: translateY(0) rotate(0deg);
                        opacity: 1;
                    }
                    100% {
                        transform: translateY(100vh) rotate(720deg);
                        opacity: 0;
                    }
                }
                .animate-confetti {
                    animation: confetti linear forwards;
                }
            `}</style>
        </div>
    );
};

// =============================================================================
// Types
// =============================================================================

interface GoalCompletedModalProps {
    isOpen: boolean;
    onClose: () => void;
    goal: Goal;
    onViewCompleted?: () => void;
    onStartNew?: () => void;
}

// =============================================================================
// Component
// =============================================================================

const GoalCompletedModal: React.FC<GoalCompletedModalProps> = ({
    isOpen,
    onClose,
    goal,
    onViewCompleted,
    onStartNew,
}) => {
    const [quote] = useState(() =>
        MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]
    );

    // Calculate stats
    const totalMilestones = goal.phases?.reduce((acc, p) => acc + (p.milestones?.length || 0), 0) || 0;
    const totalPhases = goal.phases?.length || 0;

    // Calculate time taken (from creation to now)
    const createdAt = goal.createdAt ? new Date(goal.createdAt) : new Date();
    const now = new Date();
    const daysTaken = Math.ceil((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    // Get a notable habit/task
    const topHabit = goal.phases?.[0]?.milestones?.[0]?.title || 'Deep Work';

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px] overflow-hidden p-0">
                {/* Confetti Animation */}
                {isOpen && <Confetti />}

                {/* Gradient Overlay at Top */}
                <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none" />

                <div className="relative z-10 p-6">
                    <DialogHeader>
                        {/* Trophy Icon with Glow */}
                        <div className="flex justify-center mb-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-primary rounded-2xl blur-xl opacity-50 animate-pulse" />
                                <div className="relative w-16 h-16 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-lg">
                                    <span className="material-symbols-outlined text-primary-foreground text-3xl">emoji_events</span>
                                </div>
                            </div>
                        </div>

                        <DialogTitle className="text-center text-2xl font-bold">
                            Ambition Manifested!
                        </DialogTitle>
                        <DialogDescription className="text-center text-muted-foreground mt-2">
                            Your vision has become reality. The path you carved through focus and AI insights has reached its destination.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-6 space-y-4">
                        {/* Stats Grid - Stitch Style */}
                        <div className="grid grid-cols-3 gap-3">
                            {/* Milestones */}
                            <div className="glass-surface rounded-xl p-4 text-center">
                                <div className="flex justify-center mb-2">
                                    <span className="material-symbols-outlined text-primary text-xl">flag</span>
                                </div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Milestones</p>
                                <p className="text-xl font-bold text-foreground">{totalMilestones}/{totalMilestones}</p>
                                <p className="text-xs text-emerald-400 flex items-center justify-center gap-1 mt-1">
                                    <span className="material-symbols-outlined text-xs">trending_up</span>
                                    100%
                                </p>
                            </div>

                            {/* Duration */}
                            <div className="glass-surface rounded-xl p-4 text-center">
                                <div className="flex justify-center mb-2">
                                    <span className="material-symbols-outlined text-primary text-xl">schedule</span>
                                </div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Duration</p>
                                <p className="text-xl font-bold text-foreground">{daysTaken} Days</p>
                                <p className="text-xs text-muted-foreground mt-1">Ahead of schedule</p>
                            </div>

                            {/* Top Habit */}
                            <div className="glass-surface rounded-xl p-4 text-center">
                                <div className="flex justify-center mb-2">
                                    <span className="material-symbols-outlined text-primary text-xl">bolt</span>
                                </div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Top Habit</p>
                                <p className="text-lg font-bold text-foreground truncate">{topHabit}</p>
                                <p className="text-xs text-muted-foreground mt-1">92% consistency</p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex gap-3 sm:gap-3">
                        {onViewCompleted && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    onViewCompleted();
                                    onClose();
                                }}
                                className="flex-1 glass-surface text-foreground hover:border-primary"
                            >
                                <span className="material-symbols-outlined mr-2 text-lg">route</span>
                                View Journey
                            </Button>
                        )}
                        {onStartNew && (
                            <Button
                                onClick={() => {
                                    onStartNew();
                                    onClose();
                                }}
                                className="flex-1 bg-brand-gradient glow-button text-primary-foreground"
                            >
                                <span className="material-symbols-outlined mr-2 text-lg">auto_awesome</span>
                                Dismiss
                            </Button>
                        )}
                        {!onViewCompleted && !onStartNew && (
                            <Button
                                onClick={onClose}
                                className="flex-1 bg-brand-gradient glow-button text-primary-foreground"
                            >
                                <span className="material-symbols-outlined mr-2 text-lg">celebration</span>
                                Celebrate! 🎊
                            </Button>
                        )}
                    </DialogFooter>

                    {/* AI Status Footer */}
                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <span className="material-symbols-outlined text-sm text-primary">auto_awesome</span>
                        AI Analysis complete. Ready for your next vision.
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default GoalCompletedModal;
