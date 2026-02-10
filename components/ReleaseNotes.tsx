import React, { useState } from 'react';
import { Calendar, Wrench, Sparkles, Zap, AlertTriangle, Package, Flower2 } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

// =============================================================================
// RELEASE NOTES DATA
// =============================================================================

interface ReleaseNote {
    id: string;
    version: string;
    date: string; // YYYY-MM-DD format
    type: 'fix' | 'feature' | 'improvement' | 'breaking';
    title: string;
    description: string;
    details: string[];
}

const RELEASE_NOTES: ReleaseNote[] = [
    {
        id: 'v2.0.0',
        version: '2.0.0',
        date: '2026-02-08',
        type: 'feature',
        title: 'The Manifestation Engine',
        description: 'A complete reimagining of dlulu life with powerful new tools to turn your delusions into reality.',
        details: [
            'Major UI Overhaul: A stunning new interface with glassmorphism, smooth animations, and a refined color palette.',
            'Enhanced Onboarding: A new, immersive onboarding experience to help you articulate your ambitions clearly.',
            'Stripe Integration: Seamless payment flow for Pro memberships with secure checkout.',
            'AI Logic Improvements: Smarter breakdown of ambitions into actionable milestones and tasks.',
            'Drill-Down Goals: Navigate from high-level ambitions down to daily tasks with the new 4-column view.',
            'Performance Boost: Significant optimizations for faster load times and smoother interactions.',
            'Security Hardening: improved authentication and data protection measures.',
        ],
    },
    {
        id: 'v0.1.4',
        version: '0.1.4',
        date: '2026-01-16',
        type: 'feature',
        title: 'Edit & Delete Ambitions + Bug Fixes',
        description: 'New edit/delete functionality for ambitions, tasks, and milestones, plus critical bug fixes.',
        details: [
            'Added edit/delete buttons for subtasks, tasks, and milestones (hover to reveal)',
            'Fixed "(custom)" tag incorrectly appearing on AI-created tasks',
            'Standardized error logging across all Edge Functions',
            'Fixed authentication double-loading issue causing slow startup',
            'Improved chatbot responsiveness by decoupling from auth state',
        ],
    },
    {
        id: 'v0.1.3',
        version: '0.1.3',
        date: '2026-01-10',
        type: 'fix',
        title: 'Onboarding & AI Fixes',
        description: 'Critical fixes for the onboarding flow and AI-powered ambition planning features.',
        details: [
            'Fixed AI ambition analysis failing during onboarding',
            'Resolved authentication issues with AI features',
            'Improved onboarding flow reliability',
            'Fixed ambition blueprint generation for new users',
        ],
    },
    {
        id: 'v0.1.2',
        version: '0.1.2',
        date: '2026-01-08',
        type: 'improvement',
        title: 'Performance & Production Readiness',
        description: 'Major infrastructure updates to improved performance, reliability, and observability.',
        details: [
            'Implemented Cache-First (Stale-While-Revalidate) architecture for instant loads on refresh',
            'Fixed sign-out regression ensuring session and cache are fully cleared',
            'Implemented Parallel Data Fetching to reduce load times by ~95%',
            'Integrated Middleware.io RUM for real-time monitoring',
            'Added comprehensive centralized logging system',
            'Fixed authentication race conditions',
            'Improved error handling for database timeouts',
            'Fixed false-positive onboarding redirects',
            'Implemented robust zombie session protection',
        ],
    },
    {
        id: 'v0.1.0',
        version: '0.1.0',
        date: '2026-01-01',
        type: 'feature',
        title: 'Initial Launch',
        description: 'The first public release of dlulu life - your AI-powered ambition companion.',
        details: [
            'AI-powered ambition planning with personalized strategies',
            'Interactive dashboard with ambition tracking',
            'Calendar integration for scheduling',
            'Sprint view for weekly focus',
            'Roadmap visualization for long-term planning',
            'Google OAuth authentication',
            'Beautiful Gen-Z inspired UI with warm Indian aesthetics',
        ],
    },
];

// =============================================================================
// RELEASE NOTES COMPONENT
// =============================================================================

interface ReleaseNotesProps {
    onBack: () => void;
}

const ReleaseNotes: React.FC<ReleaseNotesProps> = ({ onBack }) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set([RELEASE_NOTES[0]?.id]));

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Group releases by date
    const groupedByDate = RELEASE_NOTES.reduce((acc, note) => {
        if (!acc[note.date]) {
            acc[note.date] = [];
        }
        acc[note.date].push(note);
        return acc;
    }, {} as Record<string, ReleaseNote[]>);

    const sortedDates = Object.keys(groupedByDate).sort((a, b) =>
        new Date(b).getTime() - new Date(a).getTime()
    );

    const formatDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const dateOnly = new Date(date);
        dateOnly.setHours(0, 0, 0, 0);

        if (dateOnly.getTime() === today.getTime()) {
            return 'Today';
        }
        if (dateOnly.getTime() === yesterday.getTime()) {
            return 'Yesterday';
        }
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const getTypeIcon = (type: ReleaseNote['type']) => {
        const iconClass = "w-5 h-5";
        switch (type) {
            case 'fix':
                return <Wrench className={iconClass} />;
            case 'feature':
                return <Sparkles className={iconClass} />;
            case 'improvement':
                return <Zap className={iconClass} />;
            case 'breaking':
                return <AlertTriangle className={iconClass} />;
            default:
                return <Package className={iconClass} />;
        }
    };

    const getTypeBadge = (type: ReleaseNote['type']) => {
        const baseClasses = 'px-2 py-0.5 rounded-full text-xs font-medium';
        switch (type) {
            case 'fix':
                return `${baseClasses} bg-blue-500/20 text-blue-400 border border-blue-500/30`;
            case 'feature':
                return `${baseClasses} bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`;
            case 'improvement':
                return `${baseClasses} bg-amber-500/20 text-amber-400 border border-amber-500/30`;
            case 'breaking':
                return `${baseClasses} bg-red-500/20 text-red-400 border border-red-500/30`;
            default:
                return `${baseClasses} bg-muted/60 text-muted-foreground border border-border`;
        }
    };

    return (
        <div className="min-h-screen bg-background font-sans text-foreground relative overflow-hidden">
            {/* Background Accent Glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-chart-3/10 blur-[100px] rounded-full" />
            </div>

            <div className="relative z-10 min-h-screen">
                {/* Stitch Glass Navigation */}
                <header className="sticky top-0 z-50 glass-nav">
                    <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 py-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onBack}
                                className="w-8 h-8 rounded-full bg-card/60 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">arrow_back</span>
                            </button>
                            <div>
                                <h1 className="text-xl font-bold text-foreground tracking-tight">Release Notes</h1>
                                <p className="text-sm text-muted-foreground">What's new in dlulu life</p>
                            </div>
                        </div>
                        <ThemeToggle />
                    </div>
                </header>

                {/* Content */}
                <main className="px-6 lg:px-12 py-12">
                    <div className="max-w-4xl mx-auto">
                        {/* Timeline */}
                        <div className="relative">
                            {/* Timeline Line */}
                            <div className="absolute left-[27px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 via-chart-3/50 to-primary/20" />

                            {sortedDates.map((date, dateIndex) => (
                                <div key={date} className="relative">
                                    {/* Date Marker */}
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="relative z-10 w-14 h-14 rounded-2xl bg-brand-gradient shadow-lg shadow-primary/20 flex items-center justify-center ring-4 ring-background">
                                            <Calendar className="w-6 h-6 text-primary-foreground" />
                                        </div>
                                        <div>
                                            <span className="text-lg font-bold text-foreground">{formatDate(date)}</span>
                                            <span className="ml-2 text-sm text-muted-foreground">
                                                {groupedByDate[date].length} release{groupedByDate[date].length > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Releases for this date */}
                                    <div className="ml-[54px] space-y-4 mb-8">
                                        {groupedByDate[date].map((note) => {
                                            const isExpanded = expandedIds.has(note.id);

                                            return (
                                                <div
                                                    key={note.id}
                                                    className={`glass-surface rounded-2xl shadow-lg overflow-hidden transition-all duration-300 border border-border ${isExpanded ? 'ring-1 ring-primary/50' : ''
                                                        }`}
                                                >
                                                    {/* Release Header */}
                                                    <button
                                                        onClick={() => toggleExpand(note.id)}
                                                        className="w-full px-5 py-4 flex items-start gap-4 text-left hover:bg-muted/60 transition-colors"
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center text-muted-foreground border border-foreground/10">
                                                            {getTypeIcon(note.type)}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-foreground">v{note.version}</span>
                                                                <span className={getTypeBadge(note.type)}>
                                                                    {note.type}
                                                                </span>
                                                            </div>
                                                            <h3 className="font-semibold text-foreground mt-1">{note.title}</h3>
                                                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                                                                {note.description}
                                                            </p>
                                                        </div>
                                                        <span className={`material-symbols-outlined text-muted-foreground transition-transform duration-200 flex-shrink-0 mt-1 ${isExpanded ? 'rotate-180' : ''}`}>
                                                            expand_more
                                                        </span>
                                                    </button>

                                                    {/* Release Details (Expandable) */}
                                                    {isExpanded && (
                                                        <div className="px-5 pb-5 pt-2 border-t border-border/60">
                                                            <p className="text-sm text-muted-foreground mb-4">{note.description}</p>
                                                            <div className="space-y-2">
                                                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                                    Changes
                                                                </h4>
                                                                <ul className="space-y-2">
                                                                    {note.details.map((detail, idx) => (
                                                                        <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                                                                            <span className="text-primary mt-0.5">•</span>
                                                                            {detail}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                            {/* End of Timeline */}
                            <div className="flex items-center gap-4 ml-[3px]">
                                <div className="w-12 h-12 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center ring-4 ring-background">
                                    <Flower2 className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <span className="text-sm text-muted-foreground italic">the beginning of your journey...</span>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default ReleaseNotes;
