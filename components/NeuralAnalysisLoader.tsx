import React, { useEffect, useState } from 'react';

/**
 * NeuralAnalysisLoader Component
 * 
 * Demonstrates AI processing with a "Neural Core" animation.
 * Replaces the generic loader for the "Analyzing Ambitions" step.
 * 
 * Design System: Stitch Dark
 */

interface StatConfig {
    label: string;
    value: string | number;
    subtext?: string;
    status?: 'pending' | 'active' | 'completed';
}

interface NeuralAnalysisLoaderProps {
    onComplete?: () => void;
    progress?: number; // 0-100
    phases?: string[]; // Custom text cycles
    duration?: number; // Simulation duration in ms
    stats?: StatConfig[]; // Custom bottom stats
    headless?: boolean; // If true, hides internal header
}

const DEFAULT_STATS: StatConfig[] = [
    { label: 'Phases Designed', value: 0, subtext: '/ 5' },
    { label: 'Milestones', value: 0, subtext: 'Weekly checkpoints' },
    { label: 'Tasks Planned', value: 0, subtext: 'Actionable steps' }
];

const NeuralAnalysisLoader: React.FC<NeuralAnalysisLoaderProps> = ({
    onComplete,
    progress: externalProgress,
    phases = [
        'Initializing Neural Core',
        'Analyzing Your Ambitions',
        'Architecting Your Reality',
        'Finalizing Blueprint'
    ],
    duration = 5000,
    stats: customStats,
    headless = false
}) => {
    const [internalProgress, setInternalProgress] = useState(0);
    const [statusText, setStatusText] = useState(phases[0]);

    // Use external progress if available, otherwise simulate
    const progress = externalProgress !== undefined ? externalProgress : internalProgress;

    // Use custom stats or default (with simulated values if default)
    const stats = customStats || DEFAULT_STATS.map(stat => ({
        ...stat,
        value: stat.label === 'Phases Designed' ? Math.ceil((progress / 100) * 5) :
            stat.label === 'Milestones' ? Math.ceil(progress / 5) :
                stat.label === 'Tasks Planned' ? Math.ceil(progress / 2) : stat.value
    }));

    // Simulate progress and stats
    useEffect(() => {
        if (externalProgress !== undefined) {
            const newIndex = Math.min(Math.floor((externalProgress / 100) * phases.length), phases.length - 1);
            setStatusText(phases[newIndex]);
            return;
        }

        const startTime = Date.now();

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const newProgress = Math.min((elapsed / duration) * 100, 100);

            setInternalProgress(newProgress);

            // Cycle status text based on phases array
            const phaseIndex = Math.min(
                Math.floor((newProgress / 100) * phases.length),
                phases.length - 1
            );
            setStatusText(phases[phaseIndex]);

            if (newProgress >= 100) {
                clearInterval(interval);
                if (onComplete) setTimeout(onComplete, 500);
            }
        }, 50);

        return () => clearInterval(interval);
    }, [externalProgress, onComplete, duration, phases]);

    return (
        <div className={`relative flex flex-col overflow-hidden bg-background text-foreground font-display selection:bg-primary/30 ${headless ? 'h-full' : 'min-h-screen'}`}>
            {/* Header Section */}
            {!headless && (
                <div className="z-20 w-full flex justify-center py-5 px-6">
                    <header className="w-full max-w-[1200px] flex items-center justify-between border-b border-border pb-4">
                        <div className="flex items-center gap-3">
                            <div className="size-8 bg-primary rounded-lg flex items-center justify-center shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
                                <span className="material-symbols-outlined text-primary-foreground text-xl">psychology</span>
                            </div>
                            <div>
                                <h2 className="text-foreground text-lg font-bold leading-tight tracking-tight">dlulu life</h2>
                                <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">Ambition Engine</p>
                            </div>
                        </div>
                    </header>
                </div>
            )}

            {/* Main Content Area: Neural Core */}
            <main className="relative flex-1 flex flex-col items-center justify-center px-6">
                {/* Background Neural Glow */}
                <div className="absolute inset-0 z-0 pointer-events-none" style={{
                    background: 'radial-gradient(circle at center, hsl(var(--primary) / 0.15) 0%, hsl(var(--background) / 0) 70%)'
                }}></div>

                <div className="z-10 flex flex-col items-center max-w-2xl w-full">
                    {/* Central Visual */}
                    <div className="relative flex items-center justify-center mb-16 scale-110">
                        {/* Static Rings (Perfect Geometry) */}
                        <div className="absolute w-[500px] h-[500px] rounded-full border border-border/60"></div>
                        <div className="absolute w-[350px] h-[350px] rounded-full border border-border/80"></div>
                        <div className="absolute w-[600px] h-[600px] rounded-full border border-border/50 opacity-50"></div>

                        {/* Pulse Ring */}
                        <div className="absolute w-72 h-72 rounded-full border border-primary/30 animate-pulse-ring"></div>

                        {/* Orbiting Electrons Layer 1 (Active Rotation) */}
                        <div className="absolute w-[500px] h-[500px] rounded-full animate-orbit pointer-events-none">
                            {/* Glowing Electron */}
                            <div className="absolute top-1/2 -left-1 w-2 h-2 bg-foreground rounded-full shadow-[0_0_15px_hsl(var(--foreground)/0.9)]"></div>
                            <div className="absolute top-0 left-1/2 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_10px_hsl(var(--primary)/0.8)]"></div>
                        </div>

                        {/* Orbiting Electrons Layer 2 (Reverse Rotation) */}
                        <div className="absolute w-[350px] h-[350px] rounded-full animate-orbit-reverse pointer-events-none" style={{ animationDuration: '20s' }}>
                            <div className="absolute bottom-0 left-1/2 w-2 h-2 bg-primary rounded-full shadow-[0_0_15px_hsl(var(--primary)/0.9)]"></div>
                            <div className="absolute top-1/2 -right-1 w-1.5 h-1.5 bg-foreground rounded-full shadow-[0_0_10px_hsl(var(--foreground)/0.8)]"></div>
                        </div>

                        {/* Outer Satellite (Slow) */}
                        <div className="absolute w-[600px] h-[600px] rounded-full animate-orbit pointer-events-none" style={{ animationDuration: '45s' }}>
                            <div className="absolute top-[15%] left-[15%] w-1 h-1 bg-foreground/50 rounded-full blur-[1px]"></div>
                        </div>


                        {/* Neural Core Center */}
                        <div className="relative w-32 h-32 rounded-full bg-primary flex items-center justify-center shadow-[0_0_60px_hsl(var(--primary)/0.6)] border-4 border-background z-20 overflow-hidden">
                            {/* Inner Scan Line - Made subtler */}
                            <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-transparent via-foreground/10 to-transparent animate-scan opacity-50"></div>
                            <span className="material-symbols-outlined text-primary-foreground text-5xl animate-pulse relative z-10">hub</span>
                        </div>
                    </div>

                    {/* Status Text Section */}
                    <div className="text-center space-y-4 relative z-30">
                        {/* Clean Modern Text */}
                        <h1 className="text-foreground tracking-tight text-4xl md:text-5xl font-bold leading-tight min-h-[1.2em]">
                            {statusText}
                        </h1>

                        {/* Subtitle */}
                        <div className="flex items-center justify-center gap-2 opacity-80">
                            <span className="material-symbols-outlined text-primary text-sm">auto_awesome</span>
                            <p className="text-primary tracking-wide text-lg font-medium">
                                Architecting your future<span className="animate-pulse">...</span>
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Bottom Stats Counter */}
            {stats.length > 0 && (
                <div className="z-20 w-full flex flex-col items-center pb-12 px-6">
                    <div className="glass-card px-8 py-6 rounded-2xl flex flex-col md:flex-row items-center gap-8 md:gap-16 max-w-4xl w-full border-t border-border backdrop-blur-xl bg-card/60">
                        {stats.map((stat, index) => (
                            <React.Fragment key={index}>
                                {index > 0 && <div className="hidden md:block w-px h-12 bg-border"></div>}
                                <div className="flex flex-col gap-1 items-center md:items-start flex-1">
                                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">{stat.label}</p>
                                    <div className="flex items-center gap-2">
                                        {/* Returned to sans-serif font, fixed width for stability */}
                                        <p className="text-foreground tracking-tight text-3xl font-bold nums-tabular w-[2ch]">{stat.value}</p>
                                        {stat.status === 'active' && (
                                            <span className="text-emerald-400 text-sm font-bold bg-emerald-400/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs">check_circle</span>
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    {stat.subtext && <p className="text-muted-foreground/70 text-xs font-medium">{stat.subtext}</p>}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Progress Hint */}
                    <p className="text-muted-foreground/60 text-[10px] mt-6 uppercase tracking-[0.2em] font-medium animate-pulse">
                        Please wait while your roadmap initializes
                    </p>
                </div>
            )}

            {/* Decorative elements */}
            <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

            {/* Custom Animations */}
            <style>{`
                @keyframes pulse-ring {
                    0% { transform: scale(0.8); opacity: 0; }
                    50% { opacity: 0.5; }
                    100% { transform: scale(1.3); opacity: 0; }
                }
                .animate-pulse-ring {
                    animation: pulse-ring 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                @keyframes orbit {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-orbit {
                    animation: orbit 30s linear infinite;
                }
                @keyframes orbit-reverse {
                    from { transform: rotate(360deg); }
                    to { transform: rotate(0deg); }
                }
                .animate-orbit-reverse {
                    animation: orbit-reverse 40s linear infinite;
                }
                 @keyframes scan {
                    0% { transform: translateY(-100%); }
                    100% { transform: translateY(100%); }
                }
                .animate-scan {
                    animation: scan 2s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default NeuralAnalysisLoader;
