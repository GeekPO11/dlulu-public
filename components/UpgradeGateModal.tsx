import React, { useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { analytics, AnalyticsEvents } from '../lib/analytics';

interface UpgradeGateModalProps {
  open: boolean;
  maxActiveGoals: number | null;
  onUpgrade: () => void;
  onDismiss: () => void;
  onViewPlans?: () => void;
}

const UpgradeGateModal: React.FC<UpgradeGateModalProps> = ({
  open,
  maxActiveGoals,
  onUpgrade,
  onDismiss,
  onViewPlans,
}) => {
  const limitLabel = maxActiveGoals === null ? 'your plan limit' : `${maxActiveGoals} active goal${maxActiveGoals === 1 ? '' : 's'}`;

  // Track gate impression
  useEffect(() => {
    if (open) {
      analytics.track(AnalyticsEvents.UPGRADE_GATE_SHOWN, { max_active_goals: maxActiveGoals });
    }
  }, [open]);

  const handleUpgrade = () => {
    analytics.track(AnalyticsEvents.UPGRADE_GATE_CLICKED, { max_active_goals: maxActiveGoals });
    onUpgrade();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>You’ve reached your goal limit</DialogTitle>
          <DialogDescription>
            Free plan allows {limitLabel}. Upgrade to add this goal.
          </DialogDescription>
        </DialogHeader>

        <div className="glass-surface rounded-xl border border-border p-4 text-sm text-muted-foreground">
          Upgrade to Pro for unlimited goals, calendar sync, and higher AI usage.
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={handleUpgrade} className="w-full">
            Upgrade to Pro
          </Button>
          <Button variant="ghost" onClick={onDismiss} className="w-full">
            Not now
          </Button>
          {onViewPlans && (
            <button
              onClick={onViewPlans}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View Plans
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeGateModal;
