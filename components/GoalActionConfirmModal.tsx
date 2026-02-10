import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

// =============================================================================
// Types
// =============================================================================

export type ConfirmActionType = 'pause' | 'resume' | 'abandon' | 'delete' | 'delete_events' | 'rebuild_calendar';

interface GoalActionConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    action: ConfirmActionType;
    goalTitle: string;
}

// =============================================================================
// Constants
// =============================================================================

const ACTION_CONFIG = {
    pause: {
        title: 'Pause Ambition',
        description: 'Taking a break? Your calendar events will be cleared but your progress is saved.',
        confirmPhrase: 'I WILL BE BACK',
        confirmLabel: 'Type "I WILL BE BACK" to confirm',
        requiresTextInput: true,
        buttonText: 'Pause Ambition',
        icon: 'pause_circle',
        iconBg: 'bg-amber-500/20',
        iconColor: 'text-amber-500',
        buttonClass: 'bg-amber-500 hover:bg-amber-600 text-white',
        warningBg: 'bg-amber-500/10',
        warningBorder: 'border-amber-500/30',
        warningText: 'text-amber-300',
        cancelText: 'Keep Working',
        bullets: [
            'All scheduled calendar events will be removed',
            'Your ambition will be moved to the Paused tab',
            'All your progress and data will be preserved',
            'You can resume and re-schedule at any time',
        ],
    },
    resume: {
        title: 'Resume Ambition',
        description: 'Ready to get back on track?',
        confirmPhrase: '',
        confirmLabel: '',
        requiresTextInput: false,
        buttonText: 'Resume Ambition',
        icon: 'play_arrow',
        iconBg: 'bg-emerald-500/20',
        iconColor: 'text-emerald-500',
        buttonClass: 'bg-emerald-500 hover:bg-emerald-600 text-white',
        warningBg: 'bg-emerald-500/10',
        warningBorder: 'border-emerald-500/30',
        warningText: 'text-emerald-300',
        cancelText: 'Cancel',
        bullets: [
            'Your ambition will be moved back to Active',
            'You can re-schedule calendar events',
            'All your previous progress is preserved',
        ],
    },
    abandon: {
        title: 'Abandon Ambition',
        description: 'This is a significant decision. We want to make sure you\'re certain.',
        confirmPhrase: 'I GIVE UP',
        confirmLabel: 'Type "I GIVE UP" to confirm',
        requiresTextInput: true,
        buttonText: 'Abandon Ambition',
        icon: 'close',
        iconBg: 'bg-red-500/20',
        iconColor: 'text-red-500',
        buttonClass: 'bg-red-500 hover:bg-red-600 text-white',
        warningBg: 'bg-red-500/10',
        warningBorder: 'border-red-500/30',
        warningText: 'text-red-300',
        cancelText: 'Keep Working',
        bullets: [
            'All scheduled calendar events will be deleted',
            'Your ambition will be moved to the Abandoned tab',
            'You can still view your progress history',
        ],
    },
    delete: {
        title: 'Delete Ambition Permanently',
        description: 'This action cannot be undone. The ambition and all its data will be permanently removed.',
        confirmPhrase: '',
        confirmLabel: '',
        requiresTextInput: false,
        buttonText: 'Delete Permanently',
        icon: 'delete_forever',
        iconBg: 'bg-red-500/20',
        iconColor: 'text-red-500',
        buttonClass: 'bg-red-500 hover:bg-red-600 text-white',
        warningBg: 'bg-red-500/10',
        warningBorder: 'border-red-500/30',
        warningText: 'text-red-300',
        cancelText: 'Cancel',
        bullets: [
            'The ambition record will be permanently deleted',
            'All phases, milestones, and subtasks will be removed',
            'This action cannot be undone',
        ],
    },
    delete_events: {
        title: 'Clear Calendar Events',
        description: 'Remove all scheduled calendar events for this ambition.',
        confirmPhrase: '',
        confirmLabel: '',
        requiresTextInput: false,
        buttonText: 'Clear Events',
        icon: 'calendar_month',
        iconBg: 'bg-primary/20',
        iconColor: 'text-primary',
        buttonClass: 'bg-brand-gradient text-primary-foreground',
        warningBg: 'bg-primary/10',
        warningBorder: 'border-primary/30',
        warningText: 'text-primary',
        cancelText: 'Cancel',
        bullets: [
            'All calendar events for this ambition will be deleted',
            'The ambition itself will remain active',
            'You can rebuild the calendar later',
        ],
    },
    rebuild_calendar: {
        title: 'Rebuild Calendar',
        description: 'Clear and regenerate the calendar schedule for this ambition.',
        confirmPhrase: '',
        confirmLabel: '',
        requiresTextInput: false,
        buttonText: 'Rebuild Calendar',
        icon: 'autorenew',
        iconBg: 'bg-primary/20',
        iconColor: 'text-primary',
        buttonClass: 'bg-brand-gradient text-primary-foreground',
        warningBg: 'bg-primary/10',
        warningBorder: 'border-primary/30',
        warningText: 'text-primary',
        cancelText: 'Cancel',
        bullets: [
            'All existing calendar events for this ambition will be deleted',
            'A new schedule will be generated from scratch',
            'You can always clear events without rebuilding',
        ],
    },
};

// =============================================================================
// Component
// =============================================================================

const GoalActionConfirmModal: React.FC<GoalActionConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    action,
    goalTitle,
}) => {
    const [inputValue, setInputValue] = useState('');
    const config = ACTION_CONFIG[action];

    const isConfirmEnabled = config.requiresTextInput
        ? inputValue.toUpperCase() === config.confirmPhrase
        : true;

    const handleConfirm = () => {
        if (isConfirmEnabled) {
            onConfirm();
            setInputValue('');
            onClose();
        }
    };

    const handleClose = () => {
        setInputValue('');
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    {/* Icon Header */}
                    <div className="flex justify-center mb-4">
                        <div className={`w-16 h-16 rounded-2xl ${config.iconBg} flex items-center justify-center`}>
                            <span className={`material-symbols-outlined text-3xl ${config.iconColor}`}>
                                {config.icon}
                            </span>
                        </div>
                    </div>

                    <DialogTitle className="text-center text-xl">
                        {config.title}
                    </DialogTitle>
                    <DialogDescription className="text-center text-muted-foreground">
                        {config.description}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {/* Goal Being Affected */}
                    <div className="p-4 glass-surface rounded-xl">
                        <p className="text-xs font-medium text-muted-foreground mb-1">AMBITION</p>
                        <p className="font-semibold text-foreground">{goalTitle}</p>
                    </div>

                    {/* Warning Box */}
                    <div className={`p-4 rounded-xl border ${config.warningBg} ${config.warningBorder}`}>
                        <div className="flex items-start gap-3">
                            <span className={`material-symbols-outlined mt-0.5 flex-shrink-0 ${config.iconColor}`}>
                                warning
                            </span>
                            <div>
                                <p className={`text-sm font-medium ${config.warningText} mb-2`}>
                                    What will happen:
                                </p>
                                <ul className="text-sm text-muted-foreground space-y-1">
                                    {config.bullets.map((bullet, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <span className="mt-1.5 w-1 h-1 rounded-full bg-current flex-shrink-0" />
                                            {bullet}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Confirmation Input - Only for actions that require it */}
                    {config.requiresTextInput && (
                        <div className="space-y-2">
                            <Label htmlFor="confirm-input" className="text-sm font-medium">
                                {config.confirmLabel}
                            </Label>
                            <Input
                                id="confirm-input"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder={config.confirmPhrase}
                                className="stitch-input font-mono text-center text-lg tracking-wide"
                                autoComplete="off"
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground text-center">
                                This ensures you're making a deliberate choice
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex gap-3 sm:gap-3">
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        className="flex-1 glass-surface text-foreground hover:border-primary"
                    >
                        {config.cancelText}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!isConfirmEnabled}
                        className={`flex-1 ${config.buttonClass} disabled:opacity-50`}
                    >
                        <span className="material-symbols-outlined mr-2 text-lg">{config.icon}</span>
                        {config.buttonText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default GoalActionConfirmModal;
