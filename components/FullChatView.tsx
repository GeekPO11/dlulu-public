import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import {
    sendChatbotMessage,
    getQuickSuggestions,
    ChatMessage as ChatMessageType,
    ChatAction,
    ChatbotContext,
} from '../services/gemini/chatbot';
import { executeChatAction, getConfirmationPrompt } from '../services/gemini/chatExecutor';
import { useChatData } from '../lib/hooks/useChatData';
import { logger } from '../lib/logger';
import { analytics, AnalyticsEvents } from '../lib/analytics';
import ChatConfirmationDialog from './ChatConfirmationDialog';
import ThemeToggle from './ThemeToggle';
import { requiresConfirmation } from '../services/gemini/chatbotTypes';
import type { ActionResult } from '../services/gemini/chatbotTypes';
import type {
    Goal,
    Phase,
    Task,
    UserProfile,
    TimeConstraints,
    Milestone,
    SubTask,
} from '../types';
import type { CalendarEvent } from '../constants/calendarTypes';

interface FullChatViewProps {
    userProfile: UserProfile;
    goals: Goal[];
    constraints: TimeConstraints;
    calendarEvents: CalendarEvent[];
    currentView?: 'dashboard' | 'goals' | 'calendar' | 'settings' | 'chat' | 'pricing';
    focusedGoalId?: string;

    // Handlers
    onAddGoal: (goalData: Partial<Goal> | Goal) => void;
    onEditGoal: (goalId: string, updates: Partial<Goal>) => void;
    onDeleteGoal: (goalId: string) => void;
    onAddPhase: (goalId: string, phase: Partial<Phase>) => void;
    onEditPhase: (phaseId: string, updates: Partial<Phase>) => void;
    onDeletePhase: (phaseId: string) => void;
    onAddMilestone: (goalId: string, phaseId: string, milestone: Partial<Milestone>) => void;
    onEditMilestone: (milestoneId: string, updates: Partial<Milestone>) => void;
    onCompleteMilestone: (milestoneId: string, notes?: string) => void;
    onDeleteMilestone: (milestoneId: string) => void;
    onAddSubTask: (taskId: string, subtask: Partial<SubTask>) => void;
    onEditSubTask: (subtaskId: string, updates: Partial<SubTask>) => void;
    onCompleteSubTask: (subtaskId: string) => void;
    onDeleteSubTask: (subtaskId: string, strikethrough?: boolean) => void;
    onAddTask: (milestoneId: string, task: Partial<Task>) => void;
    onEditTask: (taskId: string, updates: Partial<Task>) => void;
    onCompleteTask: (taskId: string) => void;
    onDeleteTask: (taskId: string) => void;
    onAddNote: (targetType: string, targetId: string, note: string) => void;
    onCreateEvent: (event: Partial<CalendarEvent>) => void;
    onEditEvent: (eventId: string, updates: Partial<CalendarEvent>) => void;
    onDeleteEvent: (eventId: string) => void;
    onBuildSchedule: (goalId: string, options?: { startDate?: string }) => void | Promise<void>;
    onClearSchedule: (goalId: string) => void | Promise<void>;
    onNavigate: (view: 'dashboard' | 'goals' | 'calendar' | 'settings' | 'chat' | 'pricing') => void;
}

const FullChatView: React.FC<FullChatViewProps> = ({
    userProfile,
    goals,
    constraints,
    calendarEvents,
    currentView = 'dashboard',
    focusedGoalId,
    onAddGoal,
    onEditGoal,
    onDeleteGoal,
    onAddPhase,
    onEditPhase,
    onDeletePhase,
    onAddMilestone,
    onEditMilestone,
    onCompleteMilestone,
    onDeleteMilestone,
    onAddSubTask,
    onEditSubTask,
    onCompleteSubTask,
    onDeleteSubTask,
    onAddTask,
    onEditTask,
    onCompleteTask,
    onDeleteTask,
    onAddNote,
    onCreateEvent,
    onEditEvent,
    onDeleteEvent,
    onBuildSchedule,
    onClearSchedule,
    onNavigate,
}) => {
    // Hooks
    const {
        messages,
        sessions,
        currentSession,
        saveMessage,
        loadSessions,
        startNewSession,
        loadConversationHistory,
        deleteSession,
        isLoading: isHistoryLoading,
        pendingConfirmation,
        setPendingConfirmation,
        confirmAction,
        cancelAction,
    } = useChatData(userProfile.id);

    // State
    const [inputValue, setInputValue] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [quickSuggestions, setQuickSuggestions] = useState<string[]>([]);
    const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const focusedGoal = useMemo(() => {
        if (!focusedGoalId) return null;
        return goals.find(goal => goal.id === focusedGoalId) || null;
    }, [goals, focusedGoalId]);

    // Refs
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isGenerating]);

    // Load sessions on mount
    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    // Suggestions
    const buildChatContext = useCallback((): ChatbotContext => ({
        userProfile,
        goals,
        constraints,
        calendarEvents,
        currentDate: new Date(),
        currentView: currentView as any,
        focusedGoalId,
    }), [userProfile, goals, constraints, calendarEvents, currentView, focusedGoalId]);

    useEffect(() => {
        const loadSuggestions = async () => {
            const suggestions = await getQuickSuggestions(buildChatContext());
            setQuickSuggestions(suggestions.slice(0, 3));
        };
        loadSuggestions();
    }, [buildChatContext]);

    useEffect(() => {
        const loadFollowUps = async () => {
            if (!messages.length) {
                setFollowUpSuggestions([]);
                return;
            }
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role !== 'assistant') return;
            const suggestions = await getQuickSuggestions(buildChatContext());
            const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content?.trim().toLowerCase();
            const filtered = suggestions.filter(s => s.trim().toLowerCase() !== lastUser);
            setFollowUpSuggestions(filtered.slice(0, 3));
        };
        if (!isGenerating) loadFollowUps();
    }, [messages, isGenerating, buildChatContext]);

    // =============================================================================
    // ACTION EXECUTOR
    // =============================================================================

    const executeAction = useCallback(async (action: ChatAction, isConfirmed = false): Promise<ActionResult> => {
        if (requiresConfirmation(action.type) && !isConfirmed) {
            setPendingConfirmation({
                action,
                confirmationPrompt: getConfirmationPrompt(action),
                confirmed: false,
            });
            return { success: false, message: 'Awaiting user confirmation.' };
        }

        return executeChatAction(
            action,
            { userProfile, goals, calendarEvents },
            {
                onAddGoal,
                onEditGoal,
                onDeleteGoal,
                onAddPhase,
                onEditPhase,
                onDeletePhase,
                onAddMilestone,
                onEditMilestone,
                onCompleteMilestone,
                onDeleteMilestone,
                onAddTask,
                onEditTask,
                onCompleteTask,
                onDeleteTask,
                onAddSubTask,
                onEditSubTask,
                onCompleteSubTask,
                onDeleteSubTask,
                onAddNote,
                onCreateEvent,
                onEditEvent,
                onDeleteEvent,
                onBuildSchedule,
                onClearSchedule,
            }
        );
    }, [
        userProfile,
        goals,
        calendarEvents,
        onAddGoal,
        onEditGoal,
        onDeleteGoal,
        onAddPhase,
        onEditPhase,
        onDeletePhase,
        onAddMilestone,
        onEditMilestone,
        onCompleteMilestone,
        onDeleteMilestone,
        onAddTask,
        onEditTask,
        onCompleteTask,
        onDeleteTask,
        onAddSubTask,
        onEditSubTask,
        onCompleteSubTask,
        onDeleteSubTask,
        onAddNote,
        onCreateEvent,
        onEditEvent,
        onDeleteEvent,
        onBuildSchedule,
        onClearSchedule,
        setPendingConfirmation,
    ]);

    const handleConfirmAction = useCallback(async () => {
        if (pendingConfirmation) {
            await confirmAction();
            await executeAction(pendingConfirmation.action, true);
        }
    }, [pendingConfirmation, confirmAction, executeAction]);

    // =============================================================================
    // HANDLERS
    // =============================================================================

    const handleSendMessage = async () => {
        const msg = inputValue.trim();
        if (!msg || isGenerating) return;

        setInputValue('');
        setIsGenerating(true);

        const userMsg: ChatMessageType = {
            id: crypto.randomUUID(),
            role: 'user',
            content: msg,
            timestamp: new Date(),
        };

        await saveMessage(userMsg);
        analytics.track(AnalyticsEvents.CHAT_MESSAGE_SENT, {
            message_length: msg.length,
            has_focused_goal: !!focusedGoalId,
            source: 'full_chat',
        });

        try {
            const context: ChatbotContext = {
                userProfile,
                goals,
                constraints,
                calendarEvents,
                currentDate: new Date(),
                currentView: currentView as any,
                focusedGoalId,
            };

            const response = await sendChatbotMessage(msg, messages, context);

            if (response && response.message) {
                const assistantMsg: ChatMessageType = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: response.message,
                    timestamp: new Date(),
                    actions: response.actions,
                };

                await saveMessage(assistantMsg);

                const actionResults: Array<{ type: string; success: boolean; executed: boolean; result?: ActionResult; error?: string }> = [];
                for (const action of response.actions) {
                    try {
                        const needsConfirmation = requiresConfirmation(action.type);
                        if (needsConfirmation) {
                            await executeAction(action);
                            actionResults.push({ type: action.type, success: true, executed: false });
                        } else {
                            const result = await executeAction(action);
                            actionResults.push({
                                type: action.type,
                                success: result.success,
                                executed: true,
                                result,
                                error: result.success ? undefined : result.message,
                            });
                        }
                    } catch (err: any) {
                        actionResults.push({ type: action.type, success: false, executed: true, error: err.message });
                    }
                }

                const executedActions = actionResults.filter(a => a.executed);
                if (executedActions.length > 0) {
                    const toolResultSummary = executedActions.map(r =>
                        `[TOOL_RESULT] ${r.type}: ${r.success ? 'SUCCESS' : 'FAILED'}${r.error ? ` - ${r.error}` : ''}`
                    ).join('\n');

                    const updatedContext: ChatbotContext = {
                        userProfile,
                        goals,
                        constraints,
                        calendarEvents,
                        currentDate: new Date(),
                        currentView: currentView as any,
                        focusedGoalId,
                    };

                    const confirmationResponse = await sendChatbotMessage(
                        toolResultSummary,
                        [...messages, assistantMsg],
                        updatedContext
                    );

                    if (confirmationResponse && confirmationResponse.message) {
                        await saveMessage({
                            id: crypto.randomUUID(),
                            role: 'assistant',
                            content: confirmationResponse.message,
                            timestamp: new Date(),
                        });
                    }
                }
            }
        } catch (err) {
            logger.error('[FullChatView] Send message error', err);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex flex-col h-screen w-full font-display overflow-hidden bg-background text-foreground">
            <style>{`
                .chat-container::-webkit-scrollbar {
                    width: 4px;
                }
                .chat-container::-webkit-scrollbar-track {
                    background: transparent;
                }
                .chat-container::-webkit-scrollbar-thumb {
                    background: hsl(var(--border));
                    border-radius: 10px;
                }
            `}</style>

            {/* Top Header with Navigation */}
            <header className="sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-4 glass-nav w-full">
                <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                    <div className="flex items-center gap-4 sm:gap-8 flex-wrap">
                        <div className="flex items-center gap-4 text-foreground">
                            <div className="w-8 h-8 flex items-center justify-center">
                                <img src="/logoFinal.png" className="w-full h-full object-contain" alt="Dlulu Logo" />
                            </div>
                            <h2 className="text-foreground text-xl font-bold leading-tight tracking-tight">dlulu life</h2>
                        </div>

                        {/* Navigation Links in Header */}
                        <nav className="hidden lg:flex items-center gap-1">
                            <button
                                onClick={() => onNavigate('dashboard')}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    currentView === 'dashboard'
                                        ? "bg-card/70 border border-border text-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                <span className="material-symbols-outlined text-lg">home</span>
                                Home
                            </button>
                            <button
                                onClick={() => onNavigate('goals')}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    currentView === 'goals'
                                        ? "bg-card/70 border border-border text-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                <span className="material-symbols-outlined text-lg">flag</span>
                                Ambitions
                            </button>
                            <button
                                onClick={() => onNavigate('calendar')}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    currentView === 'calendar'
                                        ? "bg-card/70 border border-border text-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                <span className="material-symbols-outlined text-lg">calendar_today</span>
                                Calendar
                            </button>
                            <button
                                onClick={() => onNavigate('settings')}
                                data-wt="chat-settings"
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                <span className="material-symbols-outlined text-lg">settings</span>
                                Settings
                            </button>
                            <button
                                onClick={() => onNavigate('pricing')}
                                data-wt="chat-pricing"
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                                    currentView === 'pricing'
                                        ? "bg-primary/20 border border-primary/30 text-primary"
                                        : "text-primary hover:bg-primary/10"
                                )}
                            >
                                <span className="material-symbols-outlined text-lg">workspace_premium</span>
                                Upgrade
                            </button>
                        </nav>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-xs font-semibold text-emerald-500">Solulu</span>
                        </div>
                        {focusedGoal && (
                            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/60 border border-border text-foreground/80 max-w-[260px]">
                                <span className="material-symbols-outlined text-[16px] text-primary">target</span>
                                <span className="text-xs font-semibold truncate">Focused: {focusedGoal.title}</span>
                            </div>
                        )}
                        <ThemeToggle />
                        <div className="relative flex items-center gap-2">
                            <button
                                onClick={() => { startNewSession(); analytics.track(AnalyticsEvents.CHAT_SESSION_STARTED, { source: 'full_chat_header' }); }}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-semibold hover:bg-primary/20 transition-all"
                                title="New Chat"
                            >
                                <span className="material-symbols-outlined text-base">add</span>
                                <span className="text-xs">New Chat</span>
                            </button>
                            <button
                                onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                                className="flex items-center justify-center size-10 rounded-xl bg-card/60 hover:bg-card border border-border text-muted-foreground hover:text-foreground transition-all"
                                title="Menu"
                                aria-expanded={isMobileMenuOpen}
                            >
                                <span className="material-symbols-outlined text-[20px]">menu</span>
                            </button>
                            {isMobileMenuOpen && (
                                <div className="absolute right-0 top-12 z-50 w-44 rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-2">
                                    <button
                                        onClick={() => { setIsMobileMenuOpen(false); onNavigate('dashboard'); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                                    >
                                        <span className="material-symbols-outlined text-base">home</span>
                                        Home
                                    </button>
                                    <button
                                        onClick={() => { setIsMobileMenuOpen(false); onNavigate('goals'); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                                    >
                                        <span className="material-symbols-outlined text-base">flag</span>
                                        Ambitions
                                    </button>
                                    <button
                                        onClick={() => { setIsMobileMenuOpen(false); onNavigate('calendar'); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                                    >
                                        <span className="material-symbols-outlined text-base">calendar_today</span>
                                        Calendar
                                    </button>
                                    <button
                                        onClick={() => { setIsMobileMenuOpen(false); onNavigate('settings'); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                                    >
                                        <span className="material-symbols-outlined text-base">settings</span>
                                        Settings
                                    </button>
                                    <button
                                        onClick={() => { setIsMobileMenuOpen(false); onNavigate('pricing'); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-primary hover:text-primary hover:bg-primary/10 transition-all"
                                    >
                                        <span className="material-symbols-outlined text-base">workspace_premium</span>
                                        Upgrade
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                alert('Notifications\n\nReal-time notifications are coming soon!\n\nYou will be notified about:\n• New Solulu insights and suggestions\n• Ambition milestone reminders\n• Scheduled session alerts\n• Progress celebrations');
                            }}
                            className="hidden sm:flex w-10 h-10 rounded-xl bg-card/60 hover:bg-card border border-border text-muted-foreground hover:text-foreground items-center justify-center transition-all"
                            title="Notifications (coming soon)"
                        >
                            <span className="material-symbols-outlined text-[20px]">notifications</span>
                        </button>
                        <div className="hidden sm:flex w-10 h-10 rounded-full bg-brand-gradient items-center justify-center text-primary-foreground font-bold border-2 border-primary/50">
                            {userProfile.name?.charAt(0) || 'U'}
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar - Chat History Only */}
                <aside className="w-64 hidden lg:flex flex-col border-r border-border bg-background text-foreground p-4 shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <p className="text-muted-foreground text-xs uppercase tracking-widest font-bold">Chat History</p>
                            {sessions.length > 0 && (
                                <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                                    {sessions.length}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => { startNewSession(); analytics.track(AnalyticsEvents.CHAT_SESSION_STARTED, { source: 'full_chat_sidebar' }); }}
                            className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                            title="New Chat"
                        >
                            <span className="material-symbols-outlined text-lg">add</span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className={cn(
                                    "group flex items-center gap-2 px-3 py-2 rounded-lg transition-all",
                                    currentSession?.id === session.id
                                        ? "bg-primary/10"
                                        : "hover:bg-muted"
                                )}
                            >
                                <button
                                    onClick={() => loadConversationHistory(session.id)}
                                    className={cn(
                                        "flex-1 text-left text-sm truncate",
                                        currentSession?.id === session.id
                                            ? "text-primary font-medium"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {session.title || 'Untitled Chat'}
                                </button>
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        if (confirm('Delete this chat session? This cannot be undone.')) {
                                            await deleteSession(session.id);
                                        }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-400 transition-all rounded"
                                    title="Delete session"
                                >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                            </div>
                        ))}
                        {sessions.length === 0 && (
                            <p className="text-muted-foreground text-xs text-center py-8">No chat history yet</p>
                        )}
                    </div>
                </aside>

                {/* Main Chat Area */}
                <main className="flex-1 flex flex-col relative h-full bg-background text-foreground overflow-hidden">

                    {/* Chat Content */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto chat-container flex flex-col items-center pb-40 space-y-8 px-6 py-8"
                    >
                        {messages.length === 0 && !isHistoryLoading && (
                            <div className="h-full flex flex-col items-center justify-center opacity-50 space-y-4">
                                <div className="flex items-center justify-center rounded-full size-20 border border-primary/30 bg-primary/10">
                                    <span className="material-symbols-outlined text-4xl text-primary">smart_toy</span>
                                </div>
                                <p className="text-muted-foreground text-sm font-bold uppercase tracking-wide">Ready to Manifest</p>
                            </div>
                        )}

                        {messages.map((message) => {
                            const isUser = message.role === 'user';
                            return (
                                <div
                                    key={message.id}
                                    className={cn(
                                        "flex items-end gap-4 max-w-[85%] w-full",
                                        isUser ? "self-end justify-end" : "self-start"
                                    )}
                                >
                                    {/* AI Avatar (Left) */}
                                    {!isUser && (
                                        <div className="flex items-center justify-center rounded-full size-10 shrink-0 border border-primary/30 bg-primary/10">
                                            <span className="material-symbols-outlined text-xl text-primary">smart_toy</span>
                                        </div>
                                    )}

                                    <div className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
                                        <p className={cn(
                                            "text-muted-foreground text-[11px] font-bold uppercase tracking-wide",
                                            isUser ? "mr-1" : "ml-1"
                                        )}>
                                            {isUser ? (userProfile.name || 'You') : 'Solulu'}
                                        </p>
                                        <div className={cn(
                                            "px-5 py-4 text-base leading-relaxed shadow-lg",
                                            isUser
                                                ? "bg-primary text-primary-foreground rounded-2xl rounded-br-none shadow-primary/10"
                                                : "glass-ai text-foreground rounded-2xl rounded-bl-none"
                                        )}>
                                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {message.content}
                                                </ReactMarkdown>
                                            </div>
                                        </div>

                                        {/* Action Chips under AI message */}
                                        {message.actions && message.actions.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {message.actions.map((action, i) => (
                                                    <div key={i} className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                                                        <span className="material-symbols-outlined text-sm">check_circle</span>
                                                        {action.type.replace(/_/g, ' ')}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* User Avatar (Right) */}
                                    {isUser && (
                                        <div className="flex items-center justify-center rounded-full size-10 shrink-0 border border-border bg-brand-gradient text-primary-foreground font-bold text-sm">
                                            {userProfile.name?.charAt(0).toUpperCase() || 'U'}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Thinking State */}
                        {isGenerating && (
                            <div className="flex items-end gap-4 self-start max-w-[85%]">
                                <div className="flex items-center justify-center rounded-full size-10 shrink-0 border border-primary/30 bg-primary/10 opacity-50">
                                    <span className="material-symbols-outlined text-xl text-primary">smart_toy</span>
                                </div>
                                <div className="glass-ai rounded-2xl rounded-bl-none px-6 py-4 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Input Bar Area */}
                    <div className="absolute bottom-0 left-0 w-full p-8 flex flex-col items-center pointer-events-none">
                        <div className="w-full max-w-3xl flex flex-col gap-4 pointer-events-auto">
                            {/* Quick Action Chips */}
                            <div className="flex items-center gap-2 justify-center flex-wrap" data-wt="chat-suggestions">
                                {(messages.length > 0 ? followUpSuggestions : quickSuggestions).map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        onClick={() => { setInputValue(suggestion); analytics.track(AnalyticsEvents.CHAT_SUGGESTION_USED, { suggestion, source: 'full_chat' }); inputRef.current?.focus(); }}
                                        className="px-4 py-2 rounded-full border border-border bg-card/60 text-foreground/80 text-xs font-semibold hover:bg-muted hover:border-primary/30 transition-all flex items-center gap-2 backdrop-blur-md"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                                        {suggestion}
                                    </button>
                                ))}
                            </div>

                            {/* Main Input */}
                            <div className="relative group">
                                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-primary/10 rounded-2xl blur opacity-25 group-focus-within:opacity-100 transition duration-1000"></div>
                                <div className="relative bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-2 flex items-center gap-2 shadow-2xl">
                                    <button
                                        onClick={() => {
                                            alert('File Attachments\n\nShare files with Solulu (coming soon)!\n\nSupported formats:\n• Images (progress photos, screenshots)\n• Documents (PDFs, notes)\n• Spreadsheets (tracking data)\n\nFor now, describe your files in chat.');
                                        }}
                                        className="flex items-center justify-center size-10 rounded-xl text-muted-foreground hover:text-primary transition-all"
                                        title="Attach file (coming soon)"
                                    >
                                        <span className="material-symbols-outlined">attach_file</span>
                                    </button>
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                        placeholder="Ask anything or type an ambition..."
                                        data-wt="chat-input"
                                        className="flex-1 bg-transparent border-none text-foreground focus:ring-0 placeholder:text-muted-foreground font-medium py-3 text-base focus:outline-none"
                                        disabled={isGenerating}
                                    />
                                    <button
                                        onClick={() => {
                                            alert('Voice Input\n\nSpeak to Solulu (coming soon)!\n\n• Hands-free ambition updates\n• Voice notes and reflections\n• Quick task completion\n\nFor now, type your message.');
                                        }}
                                        className="flex items-center justify-center size-10 rounded-xl text-muted-foreground hover:text-primary transition-all"
                                        title="Voice input (coming soon)"
                                    >
                                        <span className="material-symbols-outlined">mic</span>
                                    </button>
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={!inputValue.trim() || isGenerating}
                                        data-wt="chat-send"
                                        className={cn(
                                            "bg-primary text-primary-foreground size-10 flex items-center justify-center rounded-xl transition-all shadow-lg shadow-primary/20",
                                            (inputValue.trim() && !isGenerating) ? "hover:scale-105 active:scale-95" : "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <span className="material-symbols-outlined">send</span>
                                    </button>
                                </div>
                            </div>
                            <p className="text-center text-[10px] text-muted-foreground font-medium tracking-wide pb-2">dlulu life • powered by solulu</p>
                        </div>
                    </div>

                    {/* History loading overlay */}
                    {isHistoryLoading && messages.length === 0 && (
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-4">
                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-primary-foreground/80 font-bold tracking-widest uppercase text-xs">Retrieving Memories...</p>
                        </div>
                    )}
                </main>
            </div>

            {/* Confirmation Dialogs */}
            {pendingConfirmation && (
                <ChatConfirmationDialog
                    confirmation={pendingConfirmation}
                    onConfirm={handleConfirmAction}
                    onCancel={cancelAction}
                />
            )}
        </div>
    );
};

export default FullChatView;
