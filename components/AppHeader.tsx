import React, { useState } from 'react';
import ThemeToggle from './ThemeToggle';

interface AppHeaderProps {
    userName?: string;
    userInitial?: string;
    onNavigateToSettings: () => void;
    onLogout: () => Promise<void>;
}

/**
 * Universal App Header - Consistent across all authenticated pages
 * Based on Dashboard header design
 */
const AppHeader: React.FC<AppHeaderProps> = ({
    userName,
    userInitial = 'U',
    onNavigateToSettings,
    onLogout,
}) => {
    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

    return (
        <header className="sticky top-0 z-40 px-4 sm:px-6 lg:px-12 py-4 glass-nav">
            <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                <div className="flex items-center gap-4 sm:gap-8">
                    <div className="flex items-center gap-4 text-foreground">
                        <div className="w-8 h-8 flex items-center justify-center">
                            <img src="/logoFinal.png" className="w-full h-full object-contain" alt="Dlulu Logo" />
                        </div>
                        <h2 className="text-foreground text-lg sm:text-xl font-bold leading-tight tracking-tight">dlulu life</h2>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    <div className="hidden lg:flex items-stretch rounded-xl h-10 bg-card/60 border border-border overflow-hidden w-64">
                        <div className="text-muted-foreground flex items-center justify-center pl-4">
                            <span className="material-symbols-outlined text-lg">search</span>
                        </div>
                        <input
                            type="text"
                            placeholder="Search..."
                            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none w-full px-4 pl-2"
                        />
                    </div>
                    <div className="flex gap-2 items-center relative">
                        <ThemeToggle />
                        <button className="w-10 h-10 rounded-xl bg-card/60 hover:bg-card border border-border text-muted-foreground hover:text-foreground flex items-center justify-center transition-all">
                            <span className="material-symbols-outlined text-[20px]">notifications</span>
                        </button>

                        {/* Profile Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                                className="w-10 h-10 rounded-full bg-brand-gradient flex items-center justify-center text-primary-foreground font-bold border-2 border-primary/50 hover:scale-105 transition-transform"
                            >
                                {userInitial}
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
    );
};

export default AppHeader;
