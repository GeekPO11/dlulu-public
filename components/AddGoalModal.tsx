import React, { useState, useEffect } from 'react';
import type { Goal, GoalCategory, UserProfile } from '../types';
import { generateGoalRoadmap } from '../services/gemini';
import { logger } from '../lib/logger';
import { analytics, AnalyticsEvents } from '../lib/analytics';
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
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';

// =============================================================================
// Types
// =============================================================================

interface AddGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (goal: Goal) => void;
  userProfile: Partial<UserProfile>;
  existingGoals: Goal[];
}

// =============================================================================
// Constants - Stitch Themed
// =============================================================================

const CATEGORIES: { value: GoalCategory; label: string; icon: string }[] = [
  { value: 'health', label: 'Health & Fitness', icon: 'fitness_center' },
  { value: 'career', label: 'Career', icon: 'work' },
  { value: 'learning', label: 'Learning & Skills', icon: 'school' },
  { value: 'personal', label: 'Personal Growth', icon: 'self_improvement' },
  { value: 'financial', label: 'Financial', icon: 'payments' },
  { value: 'relationships', label: 'Relationships', icon: 'favorite' },
];

const TIMELINES = [
  { value: '4 weeks', weeks: 4 },
  { value: '8 weeks', weeks: 8 },
  { value: '12 weeks', weeks: 12 },
  { value: '16 weeks', weeks: 16 },
  { value: '24 weeks', weeks: 24 },
];

// =============================================================================
// Component
// =============================================================================

const AddGoalModal: React.FC<AddGoalModalProps> = ({
  isOpen,
  onClose,
  onSave,
  userProfile,
  existingGoals,
}) => {
  const [step, setStep] = useState<'input' | 'generating' | 'preview'>('input');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<GoalCategory>('learning');
  const [timeline, setTimeline] = useState('12 weeks');
  const [frequency, setFrequency] = useState(3);
  const [duration, setDuration] = useState(60);
  const [preferredTime, setPreferredTime] = useState<'morning' | 'afternoon' | 'evening' | 'flexible'>('flexible');
  const [additionalContext, setAdditionalContext] = useState('');
  const [generatedGoal, setGeneratedGoal] = useState<Goal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const riskLevel = generatedGoal?.riskLevel || 'low';
  const needsRiskAcknowledgement = riskLevel === 'medium' || riskLevel === 'high';

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && step !== 'generating') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, step]);

  useEffect(() => {
    setRiskAcknowledged(false);
  }, [generatedGoal, step]);

  // Check for duplicate goals
  const checkForDuplicates = (newTitle: string): string | null => {
    const normalizedNew = newTitle.toLowerCase().trim();

    for (const goal of existingGoals) {
      const normalizedExisting = goal.title.toLowerCase().trim();

      // Exact match
      if (normalizedExisting === normalizedNew) {
        return `You already have an ambition called "${goal.title}". Consider refining it instead.`;
      }

      // Very similar (80% overlap in words)
      const newWords = normalizedNew.split(/\s+/).filter(w => w.length > 2);
      const existingWords = normalizedExisting.split(/\s+/).filter(w => w.length > 2);
      const overlap = newWords.filter(w => existingWords.includes(w)).length;
      const similarity = overlap / Math.max(newWords.length, existingWords.length);

      if (similarity >= 0.8) {
        return `This seems very similar to your existing ambition "${goal.title}". Consider updating that ambition instead.`;
      }
    }

    return null;
  };

  const handleGenerate = async () => {
    if (!title.trim()) return;

    // Check for duplicates before generating
    const duplicateWarning = checkForDuplicates(title);
    if (duplicateWarning) {
      setError(duplicateWarning);
      return;
    }

    setStep('generating');
    setError(null);

    try {
      const timelineInfo = TIMELINES.find(t => t.value === timeline);

      const goal = await generateGoalRoadmap({
        goalTitle: title.trim(),
        category,
        additionalContext: additionalContext.trim() || undefined,
        userProfile,
        timeline,
        frequency,
        duration,
        preferredTime,
      });

      setGeneratedGoal(goal);
      setStep('preview');
    } catch (err) {
      logger.error('Failed to generate ambition', err);
      setError('Failed to generate ambition. Please try again.');
      setStep('input');
    }
  };

  const handleSave = () => {
    if (generatedGoal) {
      const needsAcknowledgement = needsRiskAcknowledgement;
      if (needsAcknowledgement && !riskAcknowledged) return;
      const nextGoal: Goal = {
        ...generatedGoal,
        riskAcknowledgedAt: needsAcknowledgement ? new Date() : generatedGoal.riskAcknowledgedAt,
      };
      analytics.track(AnalyticsEvents.GOAL_CREATED, {
        goal_category: generatedGoal.category,
        goal_timeline: timeline,
        frequency,
        duration,
        preferred_time: preferredTime,
        risk_level: riskLevel,
        phase_count: generatedGoal.phases?.length || 0,
        source: 'add_goal_modal',
      });
      onSave(nextGoal);
      handleClose();
    }
  };

  const handleClose = () => {
    setStep('input');
    setTitle('');
    setCategory('learning');
    setTimeline('12 weeks');
    setFrequency(3);
    setDuration(60);
    setAdditionalContext('');
    setGeneratedGoal(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        {step === 'input' && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-2">
                <div className="w-12 h-12 rounded-xl bg-brand-gradient flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary-foreground text-2xl">auto_awesome</span>
                </div>
              </div>
              <DialogTitle className="text-center text-xl">
                Add New Ambition
              </DialogTitle>
              <DialogDescription className="text-center text-muted-foreground">
                Describe your ambition and our AI will create a comprehensive roadmap with phases, milestones, and tasks.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* Goal Title */}
              <div className="grid gap-2">
                <Label htmlFor="goal-title">What do you want to achieve?</Label>
                <Input
                  id="goal-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Learn to play guitar, Run a marathon, Launch a business..."
                  className="stitch-input"
                  autoFocus
                />
              </div>

              {/* Category - Stitch Pills */}
              <div className="grid gap-2">
                <Label>Category</Label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${category === cat.value
                        ? 'bg-brand-gradient text-primary-foreground'
                        : 'glass-surface text-muted-foreground hover:text-foreground hover:border-primary'
                        }`}
                    >
                      <span className="material-symbols-outlined text-lg">{cat.icon}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline */}
              <div className="grid gap-2">
                <Label htmlFor="timeline">Timeline</Label>
                <select
                  id="timeline"
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  className="stitch-input h-11 text-base"
                >
                  {TIMELINES.map(t => (
                    <option key={t.value} value={t.value}>{t.value}</option>
                  ))}
                </select>
              </div>

              {/* Frequency & Duration */}
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="frequency">Sessions/week</Label>
                  <Input
                    id="frequency"
                    type="number"
                    min={1}
                    max={7}
                    value={frequency}
                    onChange={(e) => setFrequency(parseInt(e.target.value) || 3)}
                    className="stitch-input"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="duration">Min/session</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={15}
                    max={180}
                    step={15}
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
                    className="stitch-input"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="time">Preferred Time</Label>
                  <select
                    id="time"
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value as typeof preferredTime)}
                    className="stitch-input h-11 text-base"
                  >
                    <option value="morning">🌅 Morning</option>
                    <option value="afternoon">☀️ Afternoon</option>
                    <option value="evening">🌙 Evening</option>
                    <option value="flexible">⏰ Flexible</option>
                  </select>
                </div>
              </div>

              {/* Additional Context */}
              <div className="grid gap-2">
                <Label htmlFor="context">Additional context (optional)</Label>
                <textarea
                  id="context"
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Any specific requirements, constraints, or details about your current level..."
                  className="stitch-input min-h-[80px] resize-none"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </div>

            <DialogFooter className="flex gap-3 sm:gap-3">
              <Button variant="outline" onClick={handleClose} className="glass-surface text-foreground hover:border-primary">
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={!title.trim()} className="bg-brand-gradient glow-button text-primary-foreground">
                <span className="material-symbols-outlined mr-2">auto_awesome</span>
                Generate Roadmap
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'generating' && (
          <div className="py-16 text-center">
            <div className="relative mx-auto w-16 h-16 mb-6">
              <div className="absolute inset-0 bg-primary rounded-2xl blur-xl opacity-50 animate-pulse" />
              <div className="relative w-16 h-16 rounded-2xl bg-brand-gradient flex items-center justify-center">
                <span className="material-symbols-outlined text-primary-foreground text-3xl animate-spin" style={{ animationDuration: '2s' }}>progress_activity</span>
              </div>
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Generating Your Roadmap</h3>
            <p className="text-muted-foreground mb-6">
              Our AI is creating a personalized plan for your ambition...
            </p>
            <button
              onClick={() => {
                setStep('input');
                setError('Generation cancelled. You can try again.');
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
            >
              Cancel generation
            </button>
          </div>
        )}

        {step === 'preview' && generatedGoal && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-2">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-emerald-500 text-2xl">check_circle</span>
                </div>
              </div>
              <DialogTitle className="text-center text-xl">Review Your Ambition</DialogTitle>
              <DialogDescription className="text-center text-muted-foreground">
                Here's the AI-generated roadmap for your ambition. You can save it and refine later.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4 max-h-[400px] overflow-y-auto">
              {/* Goal Summary */}
              <div className="glass-surface rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-primary/20 text-primary border-primary/30">{generatedGoal.category}</Badge>
                  <Badge className="glass-surface text-muted-foreground">{generatedGoal.timeline}</Badge>
                </div>
                <h3 className="text-lg font-bold text-foreground">{generatedGoal.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{generatedGoal.strategyOverview}</p>
              </div>

              {/* Phases */}
              <div className="space-y-3">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-lg">flag</span>
                  Phases ({generatedGoal.phases.length})
                </h4>
                {generatedGoal.phases.map(phase => (
                  <div key={phase.id} className="glass-surface rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        Phase {phase.number}: {phase.title}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                        Weeks {phase.startWeek}-{phase.endWeek}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{phase.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {phase.focus.map((f, i) => (
                        <Badge key={i} className="bg-primary/10 text-primary border-primary/20 text-xs">{f}</Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">task_alt</span>
                      {phase.milestones.length} milestones
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {needsRiskAcknowledgement && (
              <div className={`glass-surface rounded-xl p-4 border ${riskLevel === 'high' ? 'border-red-500/40' : 'border-amber-500/40'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`material-symbols-outlined ${riskLevel === 'high' ? 'text-red-400' : 'text-amber-400'}`}>health_and_safety</span>
                  <p className="text-sm font-semibold text-foreground">
                    Safety check: {riskLevel.toUpperCase()} risk
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  This ambition touches on health, finance, or safety. Please confirm you understand and will seek professional guidance if needed.
                </p>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="risk-acknowledge"
                    checked={riskAcknowledged}
                    onCheckedChange={(checked) => setRiskAcknowledged(checked === true)}
                  />
                  <Label htmlFor="risk-acknowledge" className="text-sm text-foreground">
                    I understand and accept the safety guidance for this plan.
                  </Label>
                </div>
              </div>
            )}

            <DialogFooter className="flex gap-3 sm:gap-3">
              <Button variant="outline" onClick={() => setStep('input')} className="glass-surface text-foreground hover:border-primary">
                <span className="material-symbols-outlined mr-2 text-lg">arrow_back</span>
                Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={needsRiskAcknowledgement && !riskAcknowledged}
                className="bg-brand-gradient glow-button text-primary-foreground"
              >
                <span className="material-symbols-outlined mr-2 text-lg">save</span>
                Save Ambition
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddGoalModal;
