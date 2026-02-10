import React from 'react';
import { cn } from '../lib/utils';

interface FloatingDockProps {
    activeTab: 'dashboard' | 'goals' | 'calendar' | 'settings' | 'chat';
    onNavigateToDashboard: () => void;
    onNavigateToGoals: () => void;
    onNavigateToCalendar: () => void;
    onNavigateToSettings: () => void;
    onNavigateToChat?: () => void;
}

const FloatingDock: React.FC<FloatingDockProps> = ({
    activeTab,
    onNavigateToDashboard,
    onNavigateToGoals,
    onNavigateToCalendar,
    onNavigateToSettings,
    onNavigateToChat
}) => {
    return (
        <div
            className="fixed left-1/2 -translate-x-1/2 z-40"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
            <div className="px-2 sm:px-6 py-2.5 sm:py-3 rounded-full flex items-center justify-between sm:justify-center gap-0.5 sm:gap-2 shadow-2xl glass-dock w-[min(94vw,760px)] sm:w-auto max-w-[94vw] overflow-hidden">
                <button
                    type="button"
                    onClick={onNavigateToDashboard}
                    data-wt="dock-dashboard"
                    aria-label="Go to dashboard"
                    aria-current={activeTab === 'dashboard' ? 'page' : undefined}
                    title="Dashboard"
                    className={`flex w-10 h-10 sm:w-12 sm:h-12 items-center justify-center rounded-full transition-all ${activeTab === 'dashboard'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                >
                    <span className="material-symbols-outlined">home</span>
                </button>

                <div className="hidden sm:block w-px h-6 bg-border mx-2"></div>

                <button
                    type="button"
                    onClick={onNavigateToCalendar}
                    data-wt="dock-calendar"
                    aria-label="Go to calendar"
                    aria-current={activeTab === 'calendar' ? 'page' : undefined}
                    title="Calendar"
                    className={`flex w-10 h-10 sm:w-12 sm:h-12 items-center justify-center rounded-full transition-all ${activeTab === 'calendar'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                >
                    <span className="material-symbols-outlined">calendar_today</span>
                </button>

                <button
                    type="button"
                    onClick={onNavigateToGoals}
                    data-wt="dock-goals"
                    aria-label="Go to goals"
                    aria-current={activeTab === 'goals' ? 'page' : undefined}
                    title="Goals"
                    className={`flex w-10 h-10 sm:w-12 sm:h-12 items-center justify-center rounded-full transition-all ${activeTab === 'goals'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                >
                    <span className="material-symbols-outlined">flag</span>
                </button>

                <button
                    type="button"
                    onClick={onNavigateToSettings}
                    data-wt="dock-settings"
                    aria-label="Go to settings"
                    aria-current={activeTab === 'settings' ? 'page' : undefined}
                    title="Settings"
                    className={`flex w-10 h-10 sm:w-12 sm:h-12 items-center justify-center rounded-full transition-all ${activeTab === 'settings'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                >
                    <span className="material-symbols-outlined">settings</span>
                </button>

                <div className="hidden sm:block w-px h-6 bg-border mx-2"></div>

                {onNavigateToChat && (
                    <button
                        type="button"
                        onClick={onNavigateToChat}
                        data-wt="dock-chat"
                        aria-label="Open Solulu chat"
                        aria-current={activeTab === 'chat' ? 'page' : undefined}
                        title="Solulu"
                            className={cn(
                                "flex items-center justify-center gap-2 rounded-full h-10 sm:h-12 px-3 sm:px-6 transition-all",
                                activeTab === 'chat'
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 font-black"
                                : "bg-primary/10 border border-primary/20 text-primary font-bold hover:bg-primary/15"
                        )}
                    >
                        <span className="material-symbols-outlined text-[20px] fill-current">bolt</span>
                        <span className="hidden sm:inline">Solulu</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default FloatingDock;
