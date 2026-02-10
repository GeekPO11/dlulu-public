import React, { useState } from 'react';
import type { Commitment, Goal, Phase, Milestone } from '../types';

interface CommitmentDetailProps {
  commitment: Commitment;
  goal?: Goal;
  onClose: () => void;
  onAction: (action: 'done' | 'skip' | 'snooze' | 'reschedule', data?: any) => void;
}

const CommitmentDetail: React.FC<CommitmentDetailProps> = ({
  commitment,
  goal,
  onClose,
  onAction,
}) => {
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [showSkipDialog, setShowSkipDialog] = useState(false);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const currentPhase = goal?.phases[goal.currentPhaseIndex];
  const currentMilestones = currentPhase?.milestones.filter(m => !m.isCompleted) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-foreground">
              Commitment Details
            </h2>
            <button 
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Main Info */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                commitment.status === 'completed'
                  ? 'bg-emerald-500/15 text-emerald-600'
                  : commitment.status === 'skipped'
                  ? 'bg-muted text-muted-foreground'
                  : commitment.status === 'snoozed'
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  : 'bg-primary/10 text-primary'
              }`}>
                {commitment.status.charAt(0).toUpperCase() + commitment.status.slice(1)}
              </span>
              {commitment.isRecurring && (
                <span className="px-2 py-0.5 rounded bg-muted/50 text-muted-foreground text-xs font-medium">
                  Recurring
                </span>
              )}
            </div>
            
            <h3 className="text-2xl font-bold text-foreground mb-2">
              {commitment.title}
            </h3>
            
            <div className="flex items-center gap-4 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{formatDate(commitment.start)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{formatTime(commitment.start)} - {formatTime(commitment.end)}</span>
              </div>
            </div>
          </div>

          {/* AI Rationale */}
          {commitment.aiRationale && (
            <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="text-sm font-medium text-primary">Why this time?</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {commitment.aiRationale}
              </p>
            </div>
          )}

          {/* Goal Context */}
          {goal && (
            <div className="p-4 bg-card/60 rounded-xl border border-border">
              <h4 className="font-semibold text-foreground mb-1">
                Part of: {goal.title}
              </h4>
              <p className="text-sm text-muted-foreground mb-3">
                {goal.timeline} • Phase {(goal.currentPhaseIndex || 0) + 1}: {currentPhase?.title || 'Setup'}
              </p>
              
              {/* Progress */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Overall Progress</span>
                  <span className="font-medium text-foreground">{goal.overallProgress || 0}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-brand-gradient rounded-full transition-all"
                    style={{ width: `${goal.overallProgress || 0}%` }}
                  />
                </div>
              </div>

              {/* Current Milestones */}
              {currentMilestones.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-foreground mb-2">
                    Current Milestones:
                  </h5>
                  <div className="space-y-1.5">
                    {currentMilestones.slice(0, 3).map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {m.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {commitment.description && (
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">Notes</h4>
              <p className="text-muted-foreground">
                {commitment.description}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        {commitment.status === 'scheduled' && (
          <div className="sticky bottom-0 bg-card/60 border-t border-border px-6 py-4">
            {showSkipDialog ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Reason for skipping (optional)"
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  className="w-full px-4 py-2 bg-card/60 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus-ring"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSkipDialog(false)}
                    className="flex-1 py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onAction('skip', skipReason)}
                    className="flex-1 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
                  >
                    Skip
                  </button>
                </div>
              </div>
            ) : showSnoozeOptions ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => onAction('snooze', mins)}
                      className="py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors text-sm font-medium"
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowSnoozeOptions(false)}
                  className="w-full py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => onAction('done')}
                  className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Done
                </button>
                <button
                  onClick={() => setShowSnoozeOptions(true)}
                  className="px-4 py-3 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowSkipDialog(true)}
                  className="px-4 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommitmentDetail;
