// =============================================================================
// ChatAssistant - Search Bar Style AI Interface
// Always visible at top of screen, expands into full chat when active
// =============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  sendChatbotMessage,
  getQuickSuggestions,
  ChatMessage,
  ChatAction,
  ChatbotContext,
} from '../services/gemini/chatbot';
import { executeChatAction, getConfirmationPrompt } from '../services/gemini/chatExecutor';
import { useChatData } from '../lib/hooks/useChatData';
import { logger } from '../lib/logger';
import { analytics, AnalyticsEvents } from '../lib/analytics';
import ChatConfirmationDialog from './ChatConfirmationDialog';
import { requiresConfirmation } from '../services/gemini/chatbotTypes';
import type { PendingConfirmation, ActionResult } from '../services/gemini/chatbotTypes';
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

// =============================================================================
// Rotating Placeholder Text
// =============================================================================

const PLACEHOLDER_TEXTS = [
  "Need to discuss your ambitions?",
  "Want more guidance on your plan?",
  "Ask me to add a new ambition...",
  "Need help scheduling your tasks?",
  "Want to update your milestones?",
  "Looking for productivity tips?",
  "Need to reschedule something?",
  "Ask about your progress...",
];

// =============================================================================
// Props Interface
// =============================================================================

interface ChatAssistantProps {
  userProfile: UserProfile;
  goals: Goal[];
  constraints: TimeConstraints;
  calendarEvents: CalendarEvent[];
  currentView?: 'dashboard' | 'goals' | 'calendar';
  focusedGoalId?: string;

  // Goal handlers
  onAddGoal: (goalData: Partial<Goal> | Goal) => void;
  onEditGoal: (goalId: string, updates: Partial<Goal>) => void;
  onDeleteGoal: (goalId: string) => void;

  // Phase handlers
  onAddPhase: (goalId: string, phase: Partial<Phase>) => void;
  onEditPhase: (phaseId: string, updates: Partial<Phase>) => void;
  onDeletePhase: (phaseId: string) => void;

  // Milestone handlers
  onAddMilestone: (goalId: string, phaseId: string, milestone: Partial<Milestone>) => void;
  onEditMilestone: (milestoneId: string, updates: Partial<Milestone>) => void;
  onCompleteMilestone: (milestoneId: string, notes?: string) => void;
  onDeleteMilestone: (milestoneId: string) => void;

  // Subtask handlers
  onAddSubTask: (taskId: string, subtask: Partial<SubTask>) => void;
  onEditSubTask: (subtaskId: string, updates: Partial<SubTask>) => void;
  onCompleteSubTask: (subtaskId: string) => void;
  onDeleteSubTask: (subtaskId: string, strikethrough?: boolean) => void;

  // Task handlers
  onAddTask: (milestoneId: string, task: Partial<Task>) => void;
  onEditTask: (taskId: string, updates: Partial<Task>) => void;
  onCompleteTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;

  // Note handler
  onAddNote: (targetType: string, targetId: string, note: string) => void;

  // Event handlers
  onCreateEvent: (event: Partial<CalendarEvent>) => void;
  onEditEvent: (eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent: (eventId: string) => void;

  // Utility handlers
  // Utility handlers
  onBuildSchedule: (goalId: string, options?: { startDate?: string }) => void | Promise<void>;
  onClearSchedule: (goalId: string) => void | Promise<void>;
  defaultExpanded?: boolean;
  onClose?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
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
  defaultExpanded = true,
  onClose,
}) => {
  // State
  // State
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [inputValue, setInputValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isTypingPlaceholder, setIsTypingPlaceholder] = useState(true);
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState('');
  const [quickSuggestions, setQuickSuggestions] = useState<string[]>([]);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);

  // Chat Persistence Hook
  const {
    messages,
    saveMessage,
    isLoading: isHistoryLoading,
    pendingConfirmation,
    setPendingConfirmation,
    confirmAction,
    cancelAction,
    startNewSession,
  } = useChatData(userProfile.id);

  // Local loading state for current request
  const [isGenerating, setIsGenerating] = useState(false);

  // FIXED: Only use isGenerating for blocking input, NOT isHistoryLoading
  // This prevents auth token refreshes from blocking the chatbot
  const isLoading = isGenerating;

  // Show subtle loading indicator for history, but DON'T block input
  const showHistoryLoading = isHistoryLoading && messages.length === 0;
  const showChatLayout = messages.length > 0;

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ==========================================================================
  // Rotating Placeholder Animation
  // ==========================================================================

  useEffect(() => {
    if (isExpanded || inputValue) return;

    const currentText = PLACEHOLDER_TEXTS[placeholderIndex];
    let charIndex = 0;
    let isDeleting = false;

    const typeInterval = setInterval(() => {
      if (!isDeleting) {
        // Typing
        if (charIndex <= currentText.length) {
          setDisplayedPlaceholder(currentText.slice(0, charIndex));
          charIndex++;
        } else {
          // Pause before deleting
          setTimeout(() => {
            isDeleting = true;
          }, 2000);
        }
      } else {
        // Deleting
        if (charIndex > 0) {
          charIndex--;
          setDisplayedPlaceholder(currentText.slice(0, charIndex));
        } else {
          // Move to next text
          isDeleting = false;
          setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_TEXTS.length);
          clearInterval(typeInterval);
        }
      }
    }, 50);

    return () => clearInterval(typeInterval);
  }, [placeholderIndex, isExpanded, inputValue]);

  // ==========================================================================
  // Load Suggestions
  // ==========================================================================

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
      try {
        const suggestions = await getQuickSuggestions(buildChatContext());
        setQuickSuggestions(suggestions.slice(0, 3));
      } catch (error) {
        logger.error('Failed to load suggestions', error);
      }
    };
    if (isExpanded) loadSuggestions();
  }, [isExpanded, buildChatContext]);

  useEffect(() => {
    const loadFollowUps = async () => {
      try {
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
      } catch (error) {
        logger.error('Failed to load follow-up suggestions', error);
      }
    };
    if (isExpanded && !isLoading) loadFollowUps();
  }, [isExpanded, isLoading, messages, buildChatContext]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Click outside to collapse
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (!isLoading && messages.length === 0) {
          setIsExpanded(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLoading, messages.length]);

  // ==========================================================================
  // Action Executor
  // ==========================================================================

  // ==========================================================================
  // Action Executor
  // ==========================================================================

  const executeAction = useCallback(async (action: ChatAction, isConfirmed = false): Promise<ActionResult> => {
    if (requiresConfirmation(action.type) && !isConfirmed) {
      setPendingConfirmation({
        action,
        confirmationPrompt: getConfirmationPrompt(action),
        confirmed: false
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

  // Handle confirmation
  const handleConfirmAction = useCallback(async () => {
    if (pendingConfirmation) {
      await confirmAction();
      await executeAction(pendingConfirmation.action, true);
    }
  }, [pendingConfirmation, confirmAction, executeAction]);

  // Debug: Log when messages change
  useEffect(() => {
    // Messages state updated
  }, [messages]);

  // ==========================================================================
  // Send Message
  // ==========================================================================

  const handleSendMessage = async () => {
    const message = inputValue.trim();
    if (!message || isLoading) return;

    analytics.track(AnalyticsEvents.CHAT_MESSAGE_SENT, {
      message_length: message.length,
      current_view: currentView,
    });

    // Add user message via hook (persists to DB)
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setInputValue('');
    try {
      await saveMessage(userMessage);
    } catch (err) {
      logger.error('Failed to save user message', err);
    }
    setIsGenerating(true);

    try {
      // Build context
      const context: ChatbotContext = {
        userProfile,
        goals,
        constraints,
        calendarEvents,
        currentDate: new Date(),
        currentView: currentView as any,
        focusedGoalId,
      };

      // Get AI response
      // Sending message to AI
      const response = await sendChatbotMessage(message, messages, context);

      if (!response || !response.message) {
        logger.warn('[ChatAssistant] Empty response from AI');
        throw new Error('Empty response from AI');
      }

      // Add assistant message via hook
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        actions: response.actions,
      };

      // Saving assistant message
      await saveMessage(assistantMessage);

      // Execute any actions and collect results
      // NOTE: Actions requiring confirmation won't execute immediately - they return early
      const actionResults: Array<{ type: string; success: boolean; executed: boolean; result?: ActionResult; error?: string }> = [];
      for (const action of response.actions) {
        // Processing action
        try {
          // Check if this action requires confirmation
          const needsConfirmation = requiresConfirmation(action.type);
          if (needsConfirmation) {
            // Don't count this as executed - it will be handled by the confirmation flow
            // Action deferred pending confirmation
            await executeAction(action); // This will set up pending confirmation
            actionResults.push({ type: action.type, success: true, executed: false });
          } else {
            // Execute immediately
            const result = await executeAction(action);
            analytics.track(AnalyticsEvents.CHAT_ACTION_EXECUTED, {
              action_type: action.type,
              success: result.success,
            });
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

      // Only send follow-up for actions that ACTUALLY executed (not pending confirmation)
      const executedActions = actionResults.filter(a => a.executed);
      if (executedActions.length > 0) {
        // Sending tool results to AI for confirmation

        // Format the tool results as a pseudo-message
        const toolResultSummary = executedActions.map(r =>
          `[TOOL_RESULT] ${r.type}: ${r.success ? 'SUCCESS' : 'FAILED'}${r.error ? ` - ${r.error}` : ''}`
        ).join('\n');

        // Build updated context (since actions may have changed state, we use current state)
        const updatedContext: ChatbotContext = {
          userProfile,
          goals,
          constraints,
          calendarEvents,
          currentDate: new Date(),
          currentView: currentView as any,
          focusedGoalId,
        };

        // Get AI confirmation
        const confirmationResponse = await sendChatbotMessage(
          toolResultSummary,
          [...messages, assistantMessage], // Include the action message in history
          updatedContext
        );
        // Confirmation response received

        // Save the confirmation message
        if (confirmationResponse && confirmationResponse.message) {
          const confirmationMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: confirmationResponse.message,
            timestamp: new Date(),
          };
          await saveMessage(confirmationMessage);
          // Confirmation message saved
        }
      }

    } catch (error) {
      logger.error('[ChatAssistant] Error', error);
      // Save error message locally only (optional, here we save to keys consistency)
      // or just to DB if we want to log errors
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
        isError: true,
      };

      // We'll save errors to DB so the user sees them and we have a record
      await saveMessage(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    if (e.key === 'Escape') {
      if (messages.length === 0) {
        setIsExpanded(false);
        setInputValue('');
      }
    }
  };

  const handleFocus = () => {
    if (!isExpanded) {
      analytics.track(AnalyticsEvents.CHAT_SESSION_STARTED, {
        current_view: currentView,
      });
    }
    setIsExpanded(true);
  };

  const handleClose = () => {
    setIsExpanded(false);
    onClose?.();
    // Do NOT clear messages or input. User might want to resume later.
  };

  const handleStartNewChat = async () => {
    analytics.track(AnalyticsEvents.CHAT_SESSION_ENDED, {
      messages_count: messages.length,
    });
    await startNewSession();
    setInputValue('');
    if (inputRef.current) inputRef.current.focus();
  };

  const handleSuggestionClick = (suggestion: string) => {
    analytics.track(AnalyticsEvents.CHAT_SUGGESTION_USED, {
      suggestion_text: suggestion,
    });
    setInputValue(suggestion);
    inputRef.current?.focus();
  };

  // ==========================================================================
  // Render Action Badge
  // ==========================================================================

  const renderActionBadge = (action: ChatAction, index: number) => {
    const statusStyles = {
      pending: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
      pending_confirmation: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
      executing: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
      success: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
      failed: 'bg-red-500/20 text-red-600 dark:text-red-400',
      cancelled: 'bg-slate-500/20 text-slate-600 dark:text-slate-400',
    };

    const label = action.type.replace(/_/g, ' ');
    const status = action.status || 'pending';

    return (
      <span
        key={`${action.type}-${index}-${action.targetId || crypto.randomUUID()}`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium capitalize ${statusStyles[status]}`}
      >
        {(status === 'pending' || status === 'executing') && (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {status === 'success' && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {status === 'failed' && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {label}
      </span>
    );
  };

  // ==========================================================================
  // Render Input Bar (Refactored for reuse)
  // ==========================================================================

  const renderInputBar = (isBottom = false) => (
    <div className={`transition-all duration-300 ${isBottom
      ? 'mx-4 mb-4 mt-2 glass-surface rounded-2xl p-2.5'
      : isExpanded
        ? 'glass-surface rounded-2xl shadow-2xl mx-4'
        : 'glass-surface rounded-2xl shadow-lg mx-4 lg:mx-8'
      }`}>
      <div className={`flex items-center gap-3 ${isBottom ? '' : 'px-4 py-3'}`}>
        {/* AI Icon (Only show in top bar mode) */}
        {!isBottom && (
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isExpanded
            ? 'bg-brand-gradient'
            : 'bg-card'
            }`}>
            <span className="material-symbols-outlined text-primary-foreground text-xl">auto_awesome</span>
          </div>
        )}

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyPress}
          placeholder={isExpanded ? "Ask me anything..." : displayedPlaceholder || PLACEHOLDER_TEXTS[0]}
          className="stitch-input flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-base focus:outline-none border-none"
          disabled={isLoading}
        />

        {/* Send / Close Button */}
        {isExpanded ? (
          <div className="flex items-center gap-2">
            {inputValue.trim() && (
              <button
                onClick={handleSendMessage}
                disabled={isLoading}
                className="p-2 bg-brand-gradient glow-button hover:scale-105 disabled:opacity-50 rounded-xl transition-all"
              >
                <span className="material-symbols-outlined text-primary-foreground text-xl">send</span>
              </button>
            )}
            {!isBottom && (
              <button
                onClick={handleClose}
                className="p-2 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={handleFocus}
            className="p-2 bg-brand-gradient glow-button rounded-xl"
          >
            <span className="material-symbols-outlined text-primary-foreground text-xl">send</span>
          </button>
        )}
      </div>
    </div>
  );


  // ==========================================================================
  // Render
  // ==========================================================================


  return (
    <div
      ref={containerRef}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out ${isExpanded ? 'bg-background/95 backdrop-blur-xl' : ''
        }`}
      style={{ height: isExpanded ? '100vh' : 'auto' }}
    >
      <div className={`max-w-3xl mx-auto transition-all duration-300 ${isExpanded ? 'pt-8' : 'pt-4'}`}>

        {/* Main Container */}
        <div className={`relative flex flex-col transition-all duration-300 ${showChatLayout && isExpanded
          ? 'glass-surface rounded-2xl shadow-2xl h-[85vh] mx-4'
          : '' // In hero mode, renderInputBar handles the container style
          }`}>

          {/* Chat Header (Only in Chat Mode) */}
          {showChatLayout && isExpanded && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-gradient flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary-foreground text-xl">auto_awesome</span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Ask Solulu</span>
                  <div className="flex items-center gap-1 text-xs text-emerald-400">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                    Solulu
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleStartNewChat}
                  className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl transition-all"
                >
                  + New Session
                </button>
                <button
                  onClick={handleClose}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
          )}

          {/* Top Search Bar (Hero Mode Only when expanded, always visible when collapsed) */}
          {(!showChatLayout || !isExpanded) && renderInputBar(false)}

          {/* Expanded Content */}
          {isExpanded && (
            <div className={`flex flex-col flex-1 overflow-hidden ${showChatLayout ? '' : 'mt-4 bg-card rounded-2xl shadow-2xl border border-border mx-4'}`}>

              {/* Quick Suggestions */}
              {messages.length === 0 && quickSuggestions.length > 0 && !showChatLayout && (
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs text-muted-foreground mb-2">Quick actions</p>
                  <div className="flex flex-wrap gap-2">
                    {quickSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="px-4 py-2 text-sm bg-card border border-border hover:border-primary text-foreground rounded-xl transition-colors flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-primary text-sm">auto_fix</span>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* AI Avatar */}
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-brand-gradient flex-shrink-0 flex items-center justify-center mr-3">
                        <span className="material-symbols-outlined text-primary-foreground text-sm">auto_awesome</span>
                      </div>
                    )}
                    <div className={`max-w-[75%] ${message.role === 'user'
                      ? 'bg-brand-gradient text-primary-foreground rounded-2xl rounded-br-md'
                      : message.isError
                        ? 'bg-red-500/20 text-red-300 border border-red-500/50 rounded-2xl rounded-bl-md'
                        : 'glass-surface text-foreground rounded-2xl rounded-bl-md'
                      } px-4 py-3`}>
                      {/* Message label */}
                      {message.role === 'assistant' && !message.isError && (
                        <p className="text-xs text-primary font-medium mb-1">AMBITION AI</p>
                      )}
                      {/* Use ReactMarkdown for rich text rendering */}
                      <div className="text-sm leading-relaxed markdown-content">
                        {message.role === 'user' ? (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        )}
                      </div>

                      {/* Actions */}
                      {message.actions && message.actions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border">
                          {message.actions.map(renderActionBadge)}
                        </div>
                      )}

                      <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-primary-foreground/80' : 'text-muted-foreground'
                        }`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {/* User Avatar */}
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-primary flex-shrink-0 flex items-center justify-center ml-3">
                        <span className="material-symbols-outlined text-primary-foreground text-sm">person</span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Follow-up Suggestions */}
                {!isLoading && messages.length > 0 && followUpSuggestions.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground mb-2">Next prompts</p>
                    <div className="flex flex-wrap gap-2">
                      {followUpSuggestions.map((suggestion, idx) => (
                        <button
                          key={`${suggestion}-${idx}`}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="px-3 py-1.5 text-xs bg-card border border-border hover:border-primary text-foreground rounded-full transition-colors flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-primary text-[14px]">auto_fix</span>
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="w-8 h-8 rounded-full bg-brand-gradient flex-shrink-0 flex items-center justify-center mr-3">
                      <span className="material-symbols-outlined text-primary-foreground text-sm">auto_awesome</span>
                    </div>
                    <div className="glass-surface rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Bottom Input (Chat Mode Only) */}
              {showChatLayout && renderInputBar(true)}
            </div>
          )}
        </div>
      </div>

      {/* Backdrop overlay when expanded */}
      {isExpanded && (
        <div
          className="absolute inset-0 -z-10"
          onClick={handleClose}
        />
      )}

      {/* Confirmation Dialog */}
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

export default ChatAssistant;
