// =============================================================================
// CHAT CONFIRMATION DIALOG
// Shows confirmation prompt for destructive chatbot actions
// =============================================================================

import React from 'react';
import type { ChatAction, PendingConfirmation } from '../services/gemini/chatbotTypes';

interface ChatConfirmationDialogProps {
    confirmation: PendingConfirmation;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export const ChatConfirmationDialog: React.FC<ChatConfirmationDialogProps> = ({
    confirmation,
    onConfirm,
    onCancel,
    isLoading = false,
}) => {
    const { action, confirmationPrompt } = confirmation;

    // Determine the action type for styling
    const isDestructive = ['delete_goal', 'delete_phase', 'delete_milestone', 'abandon_goal', 'clear_schedule'].includes(action.type);
    const isCreative = ['create_goal', 'build_schedule'].includes(action.type);

    // Get action-specific icon and colors
    const getActionIcon = () => {
        if (isDestructive) {
            return (
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
            );
        }
        if (isCreative) {
            return (
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
            );
        }
        return (
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
        );
    };

    // Get action title
    const getActionTitle = () => {
        const titles: Record<string, string> = {
            create_goal: 'Create New Ambition',
            delete_goal: 'Delete Ambition',
            abandon_goal: 'Abandon Ambition',
            delete_phase: 'Delete Phase',
            delete_milestone: 'Delete Milestone',
            build_schedule: 'Build Schedule',
            clear_schedule: 'Clear Schedule',
            optimize_schedule: 'Optimize Schedule',
            adjust_goal_timeline: 'Adjust Timeline',
        };
        return titles[action.type] || action.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
                className="bg-card rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Icon */}
                <div className="flex flex-col items-center text-center">
                    {getActionIcon()}

                    {/* Title */}
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                        {getActionTitle()}
                    </h3>

                    {/* Confirmation message */}
                    <p className="text-muted-foreground text-sm mb-6">
                        {confirmationPrompt}
                    </p>

                    {/* Target info if available */}
                    {action.data && (
                        <div className="w-full bg-muted/40 rounded-lg p-3 mb-6 text-left">
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                                Target
                            </div>
                            <div className="text-sm font-medium text-foreground">
                                {(action.data as any).title || (action.data as any).goalId || 'Selected item'}
                            </div>
                        </div>
                    )}
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="flex-1 px-4 py-2.5 rounded-lg border border-border text-muted-foreground font-medium hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${isDestructive
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }`}
                    >
                        {isLoading && (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                        {isDestructive ? 'Delete' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatConfirmationDialog;
