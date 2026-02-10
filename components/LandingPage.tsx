import React, { useState, useMemo } from 'react';

import { POPULAR_GOALS } from '../constants/goals';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import ThemeToggle from './ThemeToggle';
import { analytics, AnalyticsEvents } from '../lib/analytics';

interface AuthResult {
  error: string | null;
  needsEmailVerification?: boolean;
  message?: string;
}

interface LandingPageProps {
  onStartOnboarding: (initialAmbition?: string) => void;
  onSignUp?: (email: string, password: string, name?: string, ambition?: string) => Promise<AuthResult>;
  onSignIn?: (email: string, password: string, ambition?: string) => Promise<AuthResult>;
  onSignInWithGoogle?: () => Promise<{ error: string | null }>;
  onResetPassword?: (email: string) => Promise<{ error: string | null }>;
  onShowReleaseNotes?: () => void;
}

// =============================================================================
// Contact Modal Component
// =============================================================================

const ContactModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [formState, setFormState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormState('submitting');

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('email', formData.email);
      formDataToSend.append('subject', formData.subject);
      formDataToSend.append('message', formData.message);
      formDataToSend.append('_subject', `New Contact from dlulu life: ${formData.subject}`);
      formDataToSend.append('_captcha', 'false');
      formDataToSend.append('_template', 'table');

      if (selectedFile) {
        formDataToSend.append('attachment', selectedFile);
      }

      const response = await fetch('https://formsubmit.co/ajax/contact@dlulu.life', {
        method: 'POST',
        body: formDataToSend,
      });

      if (response.ok) {
        setFormState('success');
        // Auto-close after 3 seconds
        setTimeout(() => {
          onClose();
        }, 3000);
      } else {
        setFormState('error');
      }
    } catch (err) {
      setFormState('error');
    }
  };

  if (formState === 'success') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md bg-card rounded-3xl shadow-2xl overflow-hidden animate-modal-in p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Message Sent!</h2>
          <p className="text-muted-foreground mb-6">Thank you for reaching out. We'll get back to you within 24-48 hours.</p>
          <Button
            type="button"
            onClick={onClose}
            variant="brand"
            className="px-6 py-2.5 glow-button"
          >
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg glass-surface rounded-3xl shadow-2xl overflow-hidden animate-modal-in border border-border">
        <div className="sticky top-0 glass-nav px-8 py-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Contact Us</h2>
            <p className="text-sm text-muted-foreground mt-1">We'd love to hear from you</p>
          </div>
          <button
            type="button"
            aria-label="Close contact modal"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        <div className="px-8 py-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl">
            <p className="text-sm text-primary">
              <strong>Email us directly at:</strong>{' '}
              <a href="mailto:contact@dlulu.life" className="underline font-medium hover:text-primary/80">
                contact@dlulu.life
              </a>
            </p>
          </div>

          {formState === 'error' && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-sm text-red-400">Something went wrong. Please try again or email us directly.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact-name" className="block text-sm mb-1.5">Name</Label>
                <Input
                  id="contact-name"
                  type="text"
                  required
                  placeholder="Your name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full h-10 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="contact-email" className="block text-sm mb-1.5">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full h-10 text-sm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="contact-subject" className="block text-sm mb-1.5">Subject</Label>
              <select
                id="contact-subject"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="stitch-input w-full px-4 py-2.5 rounded-xl text-sm"
              >
                <option value="" className="bg-card">Select a topic...</option>
                <option value="Bug Report" className="bg-card">Bug Report</option>
                <option value="Feature Request" className="bg-card">Feature Request</option>
                <option value="General Feedback" className="bg-card">General Feedback</option>
                <option value="Account Issue" className="bg-card">Account Issue</option>
                <option value="Privacy Concern" className="bg-card">Privacy Concern</option>
                <option value="Other" className="bg-card">Other</option>
              </select>
            </div>

            <div>
              <Label htmlFor="contact-message" className="block text-sm mb-1.5">Message</Label>
              <textarea
                id="contact-message"
                required
                rows={4}
                placeholder="Tell us what's on your mind..."
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="stitch-input w-full px-4 py-2.5 rounded-xl text-sm resize-none"
              />
            </div>

            <div>
              <Label htmlFor="contact-attachment" className="block text-sm mb-1.5">
                Attachment <span className="text-muted-foreground/70 font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="contact-attachment"
                  type="file"
                  accept="image/*,.pdf,.txt,.doc,.docx"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full h-10 text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
                />
              </div>
              {selectedFile && (
                <p className="text-xs text-emerald-400 mt-1">Selected: {selectedFile.name}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Max 5MB. Images, PDF, or text files.</p>
            </div>

            <Button
              type="submit"
              disabled={formState === 'submitting'}
              variant="brand"
              className="w-full h-11 glow-button font-semibold text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {formState === 'submitting' ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending...
                </>
              ) : (
                'Send Message'
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            We typically respond within 24-48 hours.
          </p>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Main Landing Page - Delulu Life Gen Z Vibes
// =============================================================================

const LandingPage: React.FC<LandingPageProps> = ({
  onStartOnboarding,
  onSignUp,
  onSignIn,
  onSignInWithGoogle,
  onResetPassword,
  onShowReleaseNotes,
}) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');

  const ambitionText = useMemo(() => {
    const parts = [...selectedGoals];
    if (customInput.trim()) {
      parts.push(customInput.trim());
    }
    return parts.join(', ');
  }, [selectedGoals, customInput]);

  const handleGoalToggle = (goal: string) => {
    setSelectedGoals(prev =>
      prev.includes(goal)
        ? prev.filter(g => g !== goal)
        : [...prev, goal]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (isSignUp && !acceptedTerms) {
      setError('Please accept the Terms & Conditions');
      return;
    }

    setIsAuthLoading(true);

    // Track auth started event
    analytics.track(isSignUp ? AnalyticsEvents.AUTH_SIGNUP_STARTED : AnalyticsEvents.AUTH_SIGNIN_COMPLETED, {
      method: 'email',
    });

    try {
      // Backup ambition to sessionStorage for robust passing
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dlulu_onboarding_ambition', ambitionText);
      }

      // Call the signup/signin handler
      if (isSignUp && onSignUp) {
        // Pass ambitionText to preserve context during auth
        const result = await onSignUp(email, password, email.split('@')[0], ambitionText);
        if (result.error) {
          setError(result.error);
          setIsAuthLoading(false);
          return;
        }
        // Show email verification screen if needed
        if (result.needsEmailVerification) {
          setShowEmailVerification(true);
          setIsAuthLoading(false);
          return;
        }
        // Track successful signup
        analytics.track(AnalyticsEvents.AUTH_SIGNUP_COMPLETED, {
          method: 'email',
        });
      } else if (!isSignUp && onSignIn) {
        // Pass ambitionText to preserve context during auth
        const result = await onSignIn(email, password, ambitionText);
        if (result.error) {
          // Show helpful message for unverified emails
          if (result.needsEmailVerification) {
            setShowEmailVerification(true);
          }
          setError(result.error);
          setIsAuthLoading(false);
          return;
        }
        // Track successful signin
        analytics.track(AnalyticsEvents.AUTH_SIGNIN_COMPLETED, {
          method: 'email',
        });
      }

      // Proceed to onboarding after successful auth
      handleAuthSuccess();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onResetPassword || !forgotPasswordEmail) return;

    setIsAuthLoading(true);
    setError('');

    try {
      const result = await onResetPassword(forgotPasswordEmail);
      if (result.error) {
        setError(result.error);
      } else {
        setForgotPasswordSuccess(true);
        // Track password reset request
        analytics.track(AnalyticsEvents.AUTH_PASSWORD_RESET_REQUESTED);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (!onSignInWithGoogle) return;

    setIsAuthLoading(true);
    setError('');

    try {
      // Backup ambition to sessionStorage before redirect
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dlulu_onboarding_ambition', ambitionText);
      }

      // Track Google auth started
      analytics.track(AnalyticsEvents.AUTH_SIGNUP_STARTED, {
        method: 'google',
      });

      const result = await onSignInWithGoogle();
      if (result.error) {
        setError(result.error);
      }
      // Google OAuth will redirect, so we don't need to handle success here
    } catch (err: any) {
      setError(err.message || 'Google authentication failed');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleStartPlanning = () => {
    // Backup ambition to sessionStorage immediately
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dlulu_onboarding_ambition', ambitionText);
    }

    // Show auth modal first - user must sign up/in before proceeding
    setIsSignUp(true);
    setShowAuthModal(true);
  };

  // Called after successful auth to proceed to onboarding
  const handleAuthSuccess = () => {
    // Auth success - processing ambition data
    setShowAuthModal(false);
    onStartOnboarding(ambitionText || undefined);
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground transition-colors duration-300 relative overflow-hidden">
      {/* Background Accent Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-chart-3/10 blur-[100px] rounded-full" />
      </div>

      {/* Main Layout */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Stitch Glass Navigation */}
        <header className="fixed top-0 left-0 right-0 z-50 glass-nav">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 flex items-center justify-center">
                <img src="/logoFinal.png" className="w-full h-full object-contain" alt="Dlulu Logo" />
              </div>
              <span className="text-foreground font-bold text-lg">dlulu life</span>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button
                onClick={() => { setIsSignUp(false); setShowAuthModal(true); }}
                className="hidden sm:block text-foreground text-sm font-bold px-4 py-2 hover:bg-muted rounded-xl transition-all"
              >
                Login
              </button>
              <button
                onClick={handleStartPlanning}
                className="bg-primary text-primary-foreground text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all shadow-sm"
              >
                Get Started
              </button>
            </div>
          </div>
        </header>
        {/* Hero Content */}
        <main className="flex-1 pt-32 pb-20 px-6">
          <div className="max-w-[1600px] mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left Column: Text Content */}
              <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
                {/* Live Badge */}
                <div className="mb-6 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 inline-flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <span className="text-primary text-xs font-bold uppercase tracking-widest">v2.0 Now Live</span>
                </div>



                {/* Headline */}
                <h1 className="text-foreground text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tighter leading-[1.1] mb-6">
                  Turn <span className="text-gradient">Delusion</span> <br /> into Execution
                </h1>

                {/* Subheadline */}
                <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
                  Your AI-powered ambition engine. We bridge the gap between visualization and real-world results with algorithmic precision.
                </p>

                {/* CTA Input + Button Inline */}
                <div className="w-full max-w-xl mb-6">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      placeholder="I want to..."
                      className="flex-1 bg-card border border-input rounded-xl px-6 py-4 text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all"
                    />
                    <button
                      onClick={handleStartPlanning}
                      className="bg-primary text-primary-foreground text-lg font-bold px-8 py-4 rounded-xl hover:bg-primary/90 transition-colors whitespace-nowrap shadow-sm"
                    >
                      Start Manifesting
                    </button>
                  </div>

                  {/* Ambition Chips - Directly Below Input */}
                  <div className="mt-6">
                    <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest mb-4 text-center lg:text-left">
                      or choose from below
                    </p>
                    <div className="flex flex-wrap justify-center lg:justify-start gap-2 md:gap-3">
                      {[
                        { icon: 'directions_run', label: 'Run a Marathon' },
                        { icon: 'rocket_launch', label: 'Launch a Startup' },
                        { icon: 'menu_book', label: 'Write a Bestseller' },
                        { icon: 'flight', label: 'Travel the World' },
                        { icon: 'house', label: 'Buy a Dream Home' },
                        { icon: 'savings', label: 'Financial Freedom' },
                        { icon: 'fitness_center', label: 'Get in Shape' },
                        { icon: 'favorite', label: 'Find True Love' },
                      ].map((item) => {
                        const isSelected = selectedGoals.includes(item.label);
                        return (
                          <button
                            key={item.label}
                            onClick={() => handleGoalToggle(item.label)}
                            className={`
                              floating-chip px-4 py-2 rounded-full flex items-center gap-2 border transition-all duration-300 hover:scale-105
	                              ${isSelected
                                ? 'bg-primary border-primary shadow-lg shadow-primary/25'
                                : 'bg-card border-border hover:border-primary/40 text-foreground'
                              }
	                            `}
                          >
                            <span className={`material-symbols-outlined !text-[16px] ${isSelected ? 'text-primary-foreground' : 'text-primary'}`}>
                              {item.icon}
                            </span>
                            <span className={`text-sm font-semibold ${isSelected ? 'text-primary-foreground' : 'text-foreground'}`}>
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Hero Visual (Logo) */}
              <div className="hidden lg:flex justify-center items-center relative group">
                {/* Decorative background glow behind logo */}
                <div className="absolute inset-0 bg-primary/20 blur-[120px] rounded-full scale-75 group-hover:scale-100 transition-transform duration-1000"></div>

                <div className="relative z-10 p-8 animate-float">
                  <img
                    src="/logoFinal.png"
                    className="max-w-full h-auto drop-shadow-[0_0_50px_rgba(249,115,22,0.3)] hover:drop-shadow-[0_0_80px_rgba(249,115,22,0.5)] transition-all duration-500"
                    alt="Dlulu Logo Visual"
                  />
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Stats Section - Product Truth Metrics */}
        <section id="stats" className="py-20 border-t border-border bg-muted/20">
          <div className="max-w-[1600px] mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col gap-2 rounded-2xl p-8 bg-card border border-border shadow-sm">
                <p className="text-muted-foreground text-sm font-bold uppercase tracking-wider">Every Step is Real</p>
                <p className="text-foreground text-4xl font-black tracking-tight">100% Actionable</p>
                <div className="h-1 w-12 bg-primary rounded-full mt-2"></div>
              </div>
              <div className="flex flex-col gap-2 rounded-2xl p-8 bg-card border border-border shadow-sm">
                <p className="text-muted-foreground text-sm font-bold uppercase tracking-wider">Never Lose Focus</p>
                <p className="text-foreground text-4xl font-black tracking-tight">24h Momentum</p>
                <div className="h-1 w-12 bg-primary rounded-full mt-2"></div>
              </div>
              <div className="flex flex-col gap-2 rounded-2xl p-8 bg-card border border-border shadow-sm">
                <p className="text-muted-foreground text-sm font-bold uppercase tracking-wider">See Your Path</p>
                <p className="text-foreground text-4xl font-black tracking-tight">10x Clarity</p>
                <div className="h-1 w-12 bg-primary rounded-full mt-2"></div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section - Common Man Copy */}
        <section id="features" className="py-24 px-6 bg-muted/40">
          <div className="max-w-[1600px] mx-auto">
            <div className="flex flex-col gap-4 mb-16">
              <h2 className="text-foreground text-3xl md:text-4xl lg:text-5xl font-black tracking-tight max-w-[720px]">
                Finally, a Plan That Actually Works
              </h2>
              <p className="text-muted-foreground text-lg max-w-[720px]">
                Stop feeling overwhelmed. We break down your biggest dreams into simple daily actions you can actually do.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { icon: 'map', title: 'Crystal Clear Roadmaps', desc: 'Tell us your ambition and we create a step-by-step roadmap. No more guessing what to do next — just follow the plan.' },
                { icon: 'today', title: 'Daily Action Focus', desc: 'Each day you get exactly what to work on. Small, doable tasks that add up to massive results over time.' },
                { icon: 'rocket_launch', title: 'Unbreakable Momentum', desc: 'Track your streaks, celebrate wins, and never fall off. We keep you moving forward even on tough days.' },
              ].map((feature) => (
                <div key={feature.title} className="flex flex-col gap-6 p-8 rounded-2xl bg-card border border-border transition-all hover:border-primary/50 group">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <span className="material-symbols-outlined">{feature.icon}</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <h3 className="text-foreground text-xl font-bold">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Product Preview Section - From Dream to Done */}
        <section className="pt-20 pb-10 px-6 overflow-hidden bg-background">
          <div className="max-w-[1600px] mx-auto bg-card rounded-3xl p-4 md:p-12 relative border border-border">
            <div className="absolute -top-12 -right-12 w-64 h-64 bg-chart-3/20 blur-[100px] rounded-full"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-foreground text-4xl font-black mb-6">From Dream to Done</h2>
                <ul className="space-y-4">
                  <li className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">check_circle</span>
                    <span className="text-muted-foreground font-medium">Your personal roadmap, built in minutes</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">check_circle</span>
                    <span className="text-muted-foreground font-medium">Daily focus mode to stay on track</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">check_circle</span>
                    <span className="text-muted-foreground font-medium">Watch your progress grow every day</span>
                  </li>
                </ul>
              </div>
              <div className="relative bg-black rounded-xl aspect-video shadow-2xl overflow-hidden border border-border">
                <video
                  className="w-full h-full object-cover"
                  controls
                  playsInline
                  preload="metadata"
                >
                  <source src="/DluluProductVideoWebsite.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-3 px-6 bg-background">
          <div className="max-w-4xl mx-auto">
            {/* Disclaimer */}
            <div className="mb-4 p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl">
              <p className="text-xs text-amber-700 text-center leading-relaxed">
                <span className="font-semibold">⚠️ Experimental Project:</span> This is a beta product under active development.
                Please avoid storing highly sensitive information while we continue hardening reliability and security.
              </p>
            </div>

            {/* Links and Credits */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-4">
                <button onClick={() => setShowTermsModal(true)} className="hover:text-orange-500 transition-colors">Terms & Conditions</button>
                <span className="opacity-50">•</span>
                <button onClick={() => setShowPrivacyModal(true)} className="hover:text-orange-500 transition-colors">Privacy Policy</button>
                <span className="opacity-50">•</span>
                <button onClick={onShowReleaseNotes} className="hover:text-orange-500 transition-colors">Release Notes</button>
                <span className="opacity-50">•</span>
                <button onClick={() => setShowContactModal(true)} className="hover:text-orange-500 transition-colors">Contact</button>
              </div>
              <span className="hidden sm:inline opacity-50">•</span>
              <div className="flex items-center gap-2">
                <span className="opacity-50">•</span>
                <span className="font-medium text-orange-500">dlulu life</span>
              </div>

              <span className="font-medium text-orange-500">© 2026 dlulu life. All rights reserved.</span>

            </div>
          </div>
        </footer>
      </div >

      {/* Auth Modal - Stitch Dark Theme */}
      {
        showAuthModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowAuthModal(false)}
            />

            <div className="relative w-full max-w-md glass-surface rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
              {/* Email Verification Screen */}
              {showEmailVerification ? (
                <div className="px-8 py-12 text-center">
                  <button
                    type="button"
                    aria-label="Close authentication modal"
                    onClick={() => { setShowAuthModal(false); setShowEmailVerification(false); }}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>

                  <div className="w-20 h-20 mx-auto mb-6 bg-brand-gradient rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary-foreground text-4xl">mail</span>
                  </div>

                  <h2 className="text-2xl font-bold text-foreground mb-2">Check Your Inbox 📧</h2>
                  <p className="text-muted-foreground text-sm mb-6">
                    We sent a verification link to<br />
                    <span className="font-medium text-foreground">{email}</span>
                  </p>

                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Click the link in your email to verify your account,<br />
                      then come back here to sign in
                    </p>

                    <div className="pt-4 space-y-2">
                      <Button
                        type="button"
                        onClick={() => {
                          setShowEmailVerification(false);
                          setIsSignUp(false);
                          setError('');
                          setPassword('');
                        }}
                        variant="brand"
                        className="w-full h-11 bg-brand-gradient glow-button text-primary-foreground font-medium rounded-xl transition-all"
                      >
                        Back to Sign In
                      </Button>

                      <p className="text-xs text-muted-foreground">
                        Didn't receive it?{' '}
                        <button
                          type="button"
                          className="text-primary hover:text-primary/80 font-medium"
                          onClick={() => {
                            setError('');
                            setShowEmailVerification(false);
                          }}
                        >
                          Try again
                        </button>
                      </p>
                    </div>
                  </div>
                </div>
              ) : showForgotPassword ? (
                /* Forgot Password Screen */
                <div className="px-8 py-12 text-center">
                  <button
                    type="button"
                    aria-label="Close forgot password"
                    onClick={() => { setShowForgotPassword(false); setForgotPasswordSuccess(false); setError(''); }}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>

                  {forgotPasswordSuccess ? (
                    <>
                      <div className="w-20 h-20 mx-auto mb-6 bg-emerald-500 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary-foreground text-4xl">check_circle</span>
                      </div>

                      <h2 className="text-2xl font-bold text-foreground mb-2">Check Your Inbox 📧</h2>
                      <p className="text-muted-foreground text-sm mb-6">
                        We sent a password reset link to<br />
                        <span className="font-medium text-foreground">{forgotPasswordEmail}</span>
                      </p>

                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Click the link in your email to reset your password,<br />
                          then come back here to sign in with your new password
                        </p>

                        <div className="pt-4">
                          <Button
                            type="button"
                            onClick={() => {
                              setShowForgotPassword(false);
                              setForgotPasswordSuccess(false);
                              setIsSignUp(false);
                              setError('');
                            }}
                            variant="brand"
                            className="w-full h-11 bg-brand-gradient glow-button text-primary-foreground font-medium rounded-xl transition-all"
                          >
                            Back to Sign In
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 mx-auto mb-6 bg-brand-gradient rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary-foreground text-4xl">key</span>
                      </div>

                      <h2 className="text-2xl font-bold text-foreground mb-2">Forgot Your Password? 🔐</h2>
                      <p className="text-muted-foreground text-sm mb-6">
                        No worries! Enter your email and we'll send you a reset link
                      </p>

                      {error && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
                          {error}
                        </div>
                      )}

                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <Input
                          id="forgot-password-email"
                          type="email"
                          value={forgotPasswordEmail}
                          onChange={(e) => setForgotPasswordEmail(e.target.value)}
                          placeholder="Your email address"
                          className="w-full h-11 text-sm"
                          required
                          autoComplete="email"
                        />

                        <Button
                          type="submit"
                          disabled={isAuthLoading || !forgotPasswordEmail}
                          variant="brand"
                          className="w-full h-11 bg-brand-gradient glow-button rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAuthLoading ? 'Sending...' : 'Send Reset Link →'}
                        </Button>
                      </form>

                      <p className="text-center text-muted-foreground text-sm mt-4">
                        Remembered it?{' '}
                        <button
                          type="button"
                          onClick={() => { setShowForgotPassword(false); setError(''); }}
                          className="text-primary font-medium hover:underline"
                        >
                          Back to Sign In
                        </button>
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="px-8 pt-8 pb-4 text-center">
                    <button
                      type="button"
                      aria-label="Close authentication modal"
                      onClick={() => setShowAuthModal(false)}
                      className="absolute top-4 right-4 w-8 h-8 rounded-full bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>

                    <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Manifest Your Vision</p>
                    <h2 className="text-2xl font-bold text-foreground">
                      {isSignUp ? 'Start Your Journey' : 'Welcome Back'}
                    </h2>

                    {/* Sign In / Sign Up Tabs */}
                    <div className="flex justify-center gap-6 mt-6 border-b border-border">
                      <button
                        type="button"
                        onClick={() => setIsSignUp(false)}
                        className={`pb-3 px-2 text-sm font-semibold transition-colors ${!isSignUp
                          ? 'text-foreground border-b-2 border-primary'
                          : 'text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        Sign In
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsSignUp(true)}
                        className={`pb-3 px-2 text-sm font-semibold transition-colors ${isSignUp
                          ? 'text-foreground border-b-2 border-primary'
                          : 'text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        Sign Up
                      </button>
                    </div>

                    {/* Show selected goals preview */}
                    {ambitionText && (
                      <div className="mt-4 p-3 bg-primary/10 rounded-xl border border-primary/30">
                        <p className="text-xs font-medium text-primary mb-1">Your ambitions:</p>
                        <p className="text-sm text-foreground line-clamp-2">{ambitionText}</p>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">
                    {/* OAuth Buttons */}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleGoogleAuth}
                        disabled={isAuthLoading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-card rounded-xl text-foreground font-medium text-sm hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Continue with Google
                      </button>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Or Email</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    {error && (
                      <div role="alert" className="p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
                        {error}
                      </div>
                    )}

                    {/* Email Input */}
                    <div>
                      <Label htmlFor="auth-email" className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">Work Email</Label>
                      <Input
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full h-11 text-sm"
                        autoComplete="email"
                      />
                    </div>

                    {/* Password Input */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label htmlFor="auth-password" className="text-xs text-muted-foreground uppercase tracking-wider">Password</Label>
                        {!isSignUp && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowForgotPassword(true);
                              setForgotPasswordEmail(email);
                              setError('');
                            }}
                            className="text-xs text-primary hover:text-primary/80 font-medium"
                          >
                            Forgot?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          id="auth-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full h-11 pr-12 text-sm"
                          autoComplete={isSignUp ? 'new-password' : 'current-password'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg">
                            {showPassword ? 'visibility_off' : 'visibility'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Confirm Password (Sign Up only) */}
                    {isSignUp && (
                      <div>
                        <Label htmlFor="auth-confirm-password" className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">Confirm Password</Label>
                        <div className="relative">
                          <Input
                            id="auth-confirm-password"
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full h-11 pr-12 text-sm"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <span className="material-symbols-outlined text-lg">
                              {showConfirmPassword ? 'visibility_off' : 'visibility'}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Terms & Conditions Checkbox */}
                    {isSignUp && (
                      <label className="flex items-start gap-3 cursor-pointer group" htmlFor="auth-accepted-terms">
                        <Checkbox
                          id="auth-accepted-terms"
                          checked={acceptedTerms}
                          onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                          className="mt-0.5"
                        />
                        <span className="text-xs text-muted-foreground leading-relaxed">
                          I agree to the{' '}
                          <button type="button" onClick={() => setShowTermsModal(true)} className="text-primary hover:underline font-medium">Terms & Conditions</button>
                          {' '}and{' '}
                          <button type="button" onClick={() => setShowPrivacyModal(true)} className="text-primary hover:underline font-medium">Privacy Policy</button>
                        </span>
                      </label>
                    )}

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      disabled={isAuthLoading}
                      variant="brand"
                      className="w-full h-11 bg-brand-gradient glow-button rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAuthLoading ? 'Processing...' : (isSignUp ? 'Join Now →' : 'Sign In →')}
                    </Button>

                    {/* Toggle Sign In/Up */}
                    <p className="text-center text-muted-foreground text-sm">
                      {isSignUp ? "Already have an account?" : "Don't have an account?"}{' '}
                      <button
                        type="button"
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="text-foreground font-semibold hover:underline"
                      >
                        {isSignUp ? 'Sign In' : 'Sign Up'}
                      </button>
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        )
      }

      {/* Terms & Conditions Modal */}
      {
        showTermsModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowTermsModal(false)}
            />
            <div className="relative w-full max-w-2xl max-h-[80vh] glass-surface rounded-3xl shadow-2xl overflow-hidden animate-modal-in border border-border">
              <div className="sticky top-0 glass-nav px-8 py-6 border-b border-border flex items-center justify-between">
                <h2 className="text-2xl font-bold text-foreground">Terms & Conditions</h2>
                <button
                  type="button"
                  aria-label="Close terms and conditions"
                  onClick={() => setShowTermsModal(false)}
                  className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
              <div className="px-8 py-6 overflow-y-auto max-h-[calc(80vh-80px)] text-muted-foreground text-sm leading-relaxed space-y-4 custom-scrollbar">
                <p className="text-xs text-primary bg-primary/10 p-3 rounded-lg border border-primary/20">
                  <strong>Last Updated:</strong> January 2026 | <strong>Effective Date:</strong> January 2026
                </p>

                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-amber-300 font-bold text-sm">Beta Notice</p>
                  <p className="text-amber-200/80 text-sm mt-2">
                    dlulu life is in active beta. We continuously improve reliability and security, but occasional defects and incomplete AI output can still occur.
                  </p>
                </div>

                <h3 className="text-lg font-semibold text-foreground mt-6">1. Acceptance of Terms</h3>
                <p>By accessing or using dlulu life ("the Service"), you agree to be bound by these Terms & Conditions. If you do not agree to these terms, please do not use the Service.</p>

                <h3 className="text-lg font-semibold text-foreground mt-6">2. Beta Service Scope</h3>
                <p>
                  dlulu life is a beta product under active development. The service is provided on an
                  &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis, and features may evolve as we improve stability, quality, and safety.
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Features and UX may change during beta</li>
                  <li>Service interruptions may happen while we iterate</li>
                  <li>AI-generated content can be incomplete or inaccurate</li>
                  <li>You should validate important decisions independently</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6">3. Payments & Checkout (Beta)</h3>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <p className="text-emerald-300 font-bold text-sm">No Charges</p>
                  <p className="text-emerald-200/80 text-sm mt-2">
                    The checkout and payment features visible in dlulu life are currently in beta testing mode only. <strong>No real charges are made to any user.</strong> All payment functionality is for testing and development purposes. If a paid plan is introduced in the future, we will notify users in advance and obtain explicit consent before processing any payments.
                  </p>
                </div>

                <h3 className="text-lg font-semibold text-foreground mt-6">4. Limitation of Liability</h3>
                <p><strong className="text-red-600">To the maximum extent permitted by law, liability is limited for:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Indirect, incidental, or consequential damages arising from use of the service</li>
                  <li>Reliance on AI-generated plans, schedules, or suggestions</li>
                  <li>Impacts from third-party providers used by the service</li>
                  <li>Outages, interruptions, or beta-related feature changes</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6">5. User Responsibilities & Acknowledgements</h3>
                <p>By using this Service, you acknowledge and agree that:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>You will use reasonable judgment before acting on AI-generated guidance</li>
                  <li>You will not store highly sensitive personal data (for example SSN, banking credentials, or health records)</li>
                  <li>You are responsible for maintaining your own backups of any important data</li>
                  <li>You understand the service is in beta and may change over time</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6">6. AI-Generated Content</h3>
                <p><strong className="text-amber-600">Please review AI output carefully:</strong> The service uses AI-generated recommendations that:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>May be inaccurate, unreliable, or completely wrong</li>
                  <li>Are informational and not guaranteed outcomes</li>
                  <li>Are not professional advice (medical, legal, financial, or otherwise)</li>
                  <li>Should be validated before high-impact decisions</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6">7. Modifications</h3>
                <p>We reserve the right to modify these terms at any time without notice. Continued use of the Service after changes constitutes acceptance of the new terms.</p>

                <h3 className="text-lg font-semibold text-foreground mt-6">8. Contact</h3>
                <p>For questions about these terms, please contact us at <strong>contact@dlulu.life</strong>.</p>

                <div className="mt-8 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                  <p className="text-foreground font-medium">
                    By using dlulu life, you acknowledge that you have read, understood, and agree to these Terms & Conditions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Privacy Policy Modal */}
      {
        showPrivacyModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowPrivacyModal(false)}
            />
            <div className="relative w-full max-w-2xl max-h-[80vh] glass-surface rounded-3xl shadow-2xl overflow-hidden animate-modal-in border border-border">
              <div className="sticky top-0 glass-nav px-8 py-6 border-b border-border flex items-center justify-between">
                <h2 className="text-2xl font-bold text-foreground">Privacy Policy</h2>
                <button
                  type="button"
                  aria-label="Close privacy policy"
                  onClick={() => setShowPrivacyModal(false)}
                  className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
              <div className="px-8 py-6 overflow-y-auto max-h-[calc(80vh-80px)] text-muted-foreground text-sm leading-relaxed space-y-4 custom-scrollbar">
                <p className="text-xs text-primary bg-primary/10 p-3 rounded-lg border border-primary/20">
                  <strong>Last Updated:</strong> January 2026 | <strong>Effective Date:</strong> January 2026
                </p>

                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-amber-300 font-bold text-sm">Beta Privacy Notice</p>
                  <p className="text-amber-200/80 text-sm mt-2">
                    We apply reasonable safeguards and continuously improve controls, but no online system can guarantee absolute security.
                  </p>
                </div>

                <h3 className="text-lg font-semibold text-foreground mt-6">1. Information We Collect</h3>
                <p>dlulu life may collect the following information:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li><strong>Account Information:</strong> Email address and password (hashed)</li>
                  <li><strong>Profile Data:</strong> Name, role, bio, productivity preferences</li>
                  <li><strong>Ambitions & Tasks:</strong> Ambitions you create, tasks, schedules, and progress</li>
                  <li><strong>Usage Data:</strong> How you interact with the Service</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6">2. How We Use Your Information</h3>
                <p>Your information is used to:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Provide and personalize the Service</li>
                  <li>Generate AI-powered ambition plans and schedules</li>
                  <li>Improve the Service and user experience</li>
                  <li>Communicate important updates (if applicable)</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6">3. Data Storage & Security</h3>
                <p><strong className="text-red-600">Security Notes:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>This is a beta project and security controls are continuously improving</li>
                  <li>Data is stored on third-party services beyond our control</li>
                  <li>We cannot guarantee absolute security of any online service</li>
                  <li>Do not store sensitive, confidential, financial, or critical information</li>
                  <li>Use strong passwords and secure devices when accessing your account</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6">4. Third-Party Services</h3>
                <p>The Service uses third-party services that have access to your data:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>AI processing (Google Gemini)</li>
                  <li>Authentication (Google OAuth, Supabase)</li>
                  <li>Data storage (Supabase, cloud providers)</li>
                  <li>Payment processing (Stripe) — <strong>currently in beta testing only; no real charges are processed</strong></li>
                </ul>
                <p>These services have their own privacy policies and we have no control over how they use your data.</p>

                <h3 className="text-lg font-semibold text-foreground mt-6">5. Data Sharing</h3>
                <p>We do <strong>NOT</strong> intentionally sell your personal data. However, data may be accessible to:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>AI services for generating personalized content</li>
                  <li>Third-party infrastructure providers</li>
                  <li>Law enforcement if required by law</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6">6. Your Rights</h3>
                <p>You have the right to:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Request access to your data</li>
                  <li>Request deletion of your account and associated data</li>
                  <li>Export your data (where technically feasible)</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground mt-6">7. Children's Privacy</h3>
                <p>dlulu life is not intended for users under 13 years of age. We do not knowingly collect data from children.</p>

                <h3 className="text-lg font-semibold text-foreground mt-6">8. Changes to This Policy</h3>
                <p>We may update this Privacy Policy at any time without notice. Continued use of the Service constitutes acceptance of the updated policy.</p>

                <h3 className="text-lg font-semibold text-foreground mt-6">9. Contact</h3>
                <p>For privacy-related questions or concerns, please contact us at <strong>contact@dlulu.life</strong>.</p>

                <div className="mt-8 p-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-xl border border-red-200">
                  <p className="text-foreground font-medium">By using dlulu life, you acknowledge that you understand the experimental nature of this service and accept all risks associated with using it.</p>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Contact Modal */}
      {
        showContactModal && (
          <ContactModal onClose={() => setShowContactModal(false)} />
        )
      }

      {/* CSS Animations */}
      <style>{`
        @keyframes modal-in {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-modal-in {
          animation: modal-in 0.2s ease-out forwards;
        }
        @keyframes float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(20px, -15px) scale(1.02); }
          66% { transform: translate(-15px, 10px) scale(0.98); }
        }
        @keyframes float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-20px, 20px) scale(1.03); }
        }
        @keyframes float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(15px, 15px) scale(1.01); }
          66% { transform: translate(-10px, -10px) scale(0.99); }
        }
        .animate-float-1 { animation: float-1 18s ease-in-out infinite; }
        .animate-float-2 { animation: float-2 22s ease-in-out infinite; }
        .animate-float-3 { animation: float-3 15s ease-in-out infinite; }
      `}</style>
    </div >
  );
};

export default LandingPage;
