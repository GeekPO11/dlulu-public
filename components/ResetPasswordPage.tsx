import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { analytics, AnalyticsEvents } from '../lib/analytics';
import ThemeToggle from './ThemeToggle';

interface ResetPasswordPageProps {
    onUpdatePassword: (newPassword: string) => Promise<{ error: string | null }>;
    onBackToLanding: () => void;
}

const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({
    onUpdatePassword,
    onBackToLanding,
}) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

    const ThemeSelector = () => (
        <div className="fixed top-4 right-4 z-50">
            <ThemeToggle />
        </div>
    );

    // Check for PASSWORD_RECOVERY event on mount
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            // If there's a session and we're on the reset-password page, 
            // we assume they came from a valid reset link
            if (session) {
                setIsValidSession(true);
            } else {
                setIsValidSession(false);
            }
        };

        checkSession();

        // Listen for PASSWORD_RECOVERY event
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            // Auth state change event
            if (event === 'PASSWORD_RECOVERY') {
                setIsValidSession(true);
            }
            if (event === 'USER_UPDATED') {
                // Password update successful
                setIsLoading(false);
                setSuccess(true);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // Success state effect - MUST be before any early returns to maintain hook order
    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => {
                // Redirecting after success
                onBackToLanding();
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [success, onBackToLanding]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!password) {
            setError('Please enter a new password');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);

        try {
            // Updating password
            const result = await onUpdatePassword(password);
            if (result.error) {
                logger.error('[ResetPassword] Update failed', new Error(result.error || 'Password update failed'), { error: result.error });
                setError(result.error);
            } else {
                // Password updated successfully
                analytics.track(AnalyticsEvents.PASSWORD_RESET_COMPLETED);
                setSuccess(true);
            }
        } catch (err: any) {
            logger.error('[ResetPassword] Exception during update', err);
            setError(err.message || 'Failed to update password');
        } finally {
            setIsLoading(false);
        }
    };

    // Verify session validity
    if (isValidSession === null) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <ThemeSelector />
                <div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    // Invalid/expired session
    if (!isValidSession) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-background via-muted/40 to-accent/30">
                <ThemeSelector />
                {/* Background Orbs */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-15%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-primary/15 to-primary/5 rounded-full blur-3xl" />
                    <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-gradient-to-br from-primary/10 to-accent/20 rounded-full blur-3xl" />
                </div>

                <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-card rounded-3xl shadow-2xl overflow-hidden p-8 text-center border border-border">
                        {/* Warning Icon */}
                        <div className="w-20 h-20 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>

                        <h2 className="text-2xl font-bold text-foreground mb-2">
                            link expired or invalid 😢
                        </h2>
                        <p className="text-muted-foreground text-sm mb-6">
                            this password reset link has expired or is no longer valid.
                            <br />
                            please request a new one.
                        </p>

                        <button
                            onClick={onBackToLanding}
                            className="w-full py-3 bg-brand-gradient text-primary-foreground rounded-xl font-semibold text-sm transition-all hover:shadow-lg hover:shadow-primary/25"
                        >
                            back to sign in
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Success state


    // Success state
    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-background via-muted/40 to-accent/30">
                <ThemeSelector />
                {/* Background Orbs */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-15%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-primary/15 to-primary/5 rounded-full blur-3xl" />
                    <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-gradient-to-br from-primary/10 to-accent/20 rounded-full blur-3xl" />
                </div>

                <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-card rounded-3xl shadow-2xl overflow-hidden p-8 text-center border border-border">
                        {/* Success Icon */}
                        <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-emerald-100 to-green-100 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>

                        <h2 className="text-2xl font-bold text-foreground mb-2">
                            password updated! 🎉
                        </h2>
                        <p className="text-muted-foreground text-sm mb-6">
                            your password has been successfully changed.
                            <br />
                            redirecting you to sign in...
                        </p>

                        <div className="flex justify-center gap-1 mb-6">
                            <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>

                        <button
                            onClick={onBackToLanding}
                            className="text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                        >
                            stuck? click here to sign in
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Reset password form
    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-muted/40 to-accent/30">
            <ThemeSelector />
            {/* Background Orbs */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-15%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-primary/15 to-primary/5 rounded-full blur-3xl" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-gradient-to-br from-primary/10 to-accent/20 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-card rounded-3xl shadow-2xl overflow-hidden border border-border">
                    <div className="px-8 pt-8 pb-6">
                        {/* Key Icon */}
                        <div className="w-20 h-20 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                        </div>

                        <h2 className="text-2xl font-bold text-foreground text-center mb-2">
                            set your new password 🔐
                        </h2>
                        <p className="text-muted-foreground text-sm text-center mb-6">
                            choose a strong password to keep your account secure
                        </p>

                        {error && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* New Password Field */}
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="new password"
                                    className="w-full px-4 py-3 pr-12 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>

                            {/* Confirm Password Field */}
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="confirm new password"
                                    className="w-full px-4 py-3 pr-12 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showConfirmPassword ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                password must be at least 6 characters
                            </p>

                            <button
                                type="submit"
                                disabled={isLoading || !password || !confirmPassword}
                                className="w-full py-3 bg-brand-gradient text-primary-foreground rounded-xl font-semibold text-sm transition-all hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? 'updating...' : 'update password'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResetPasswordPage;
