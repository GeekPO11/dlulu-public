import React, { useState, useEffect, useMemo } from 'react';
import { callEdgeFunction } from '../lib/supabase';
import { logger } from '../lib/logger';
import { analytics, AnalyticsEvents } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import CheckoutModal from './CheckoutModal';

interface SettingsPageProps {
    user: {
        id: string;
        name?: string;
        email?: string;
        role?: string;
        bio?: string;
        chronotype?: string;
        energyLevel?: string;
        createdAt?: Date;
    };
    onBack: () => void;
    onAccountDeleted: () => void;
    onSignOut: () => void;
    onProfileUpdate?: (updates: { name?: string; role?: string; bio?: string; chronotype?: string; energyLevel?: string }) => void;
    onReplayTour?: () => void;
    storageMode?: 'local' | 'session';
    onStorageModeChange?: (mode: 'local' | 'session') => void;
    onNavigateToPricing?: () => void;
}

type PlanSource = 'override' | 'subscription' | 'default';

interface Entitlements {
    plan_id: string;
    max_active_goals: number | null;
    token_hard_cap: number | null;
    token_soft_cap: number | null;
    calendar_sync_enabled: boolean;
}

interface SubscriptionSummary {
    plan_id: string | null;
    status: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean | null;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
    user,
    onBack,
    onAccountDeleted,
    onSignOut,
    onProfileUpdate,
    onReplayTour,
    storageMode,
    onStorageModeChange,
    onNavigateToPricing,
}) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [acceptedConsequences, setAcceptedConsequences] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
    const [entitlementSource, setEntitlementSource] = useState<PlanSource>('default');
    const [billingError, setBillingError] = useState('');
    const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const checkoutPlanId: 'pro_monthly' | 'pro_annual' = 'pro_monthly';
    const [entitlementsRefreshKey, setEntitlementsRefreshKey] = useState(0);

    // Profile editing state
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editName, setEditName] = useState(user.name || '');
    const [editRole, setEditRole] = useState(user.role || '');
    const [editBio, setEditBio] = useState(user.bio || '');
    const [editChronotype, setEditChronotype] = useState(user.chronotype || 'flexible');
    const [editEnergyLevel, setEditEnergyLevel] = useState(user.energyLevel || 'balanced');
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const rememberMeEnabled = storageMode ? storageMode === 'local' : true;

    const handleStorageToggle = (checked: boolean | 'indeterminate') => {
        if (!onStorageModeChange) return;
        onStorageModeChange(checked === true ? 'local' : 'session');
    };

    const resetEditFields = () => {
        setEditName(user.name || '');
        setEditRole(user.role || '');
        setEditBio(user.bio || '');
        setEditChronotype(user.chronotype || 'flexible');
        setEditEnergyLevel(user.energyLevel || 'balanced');
    };

    useEffect(() => {
        if (!isEditingProfile) {
            resetEditFields();
        }
    }, [user, isEditingProfile]);

    // Track settings page view on mount
    useEffect(() => {
        analytics.track(AnalyticsEvents.SETTINGS_VIEWED, {
            plan_id: entitlements?.plan_id || 'unknown',
        });
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadEntitlements = async () => {
            try {
                const authResult = await supabase.auth.getUser();
                const userId = user.id || authResult.data?.user?.id;
                if (!userId) return;

                const now = new Date();
                const { data: override } = await supabase
                    .from('user_entitlement_overrides')
                    .select('override_plan_id, starts_at, ends_at')
                    .eq('user_id', userId)
                    .maybeSingle();

                const isOverrideActive = override && (!override.starts_at || new Date(override.starts_at) <= now)
                    && (!override.ends_at || new Date(override.ends_at) > now);

                let resolvedPlanId = 'free';
                let resolvedSource: PlanSource = 'default';

                if (isOverrideActive && override?.override_plan_id) {
                    resolvedPlanId = override.override_plan_id;
                    resolvedSource = 'override';
                } else {
                    const { data: subscription } = await supabase
                        .from('subscriptions')
                        .select('plan_id, status, current_period_end, cancel_at_period_end')
                        .eq('user_id', userId)
                        .order('current_period_end', { ascending: false, nullsFirst: false })
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    const status = (subscription?.status || '').toLowerCase();
                    const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
                    const isSubscriptionActive =
                        ['active', 'trialing', 'past_due'].includes(status) ||
                        (status === 'canceled' && periodEnd && periodEnd > now);

                    if (isSubscriptionActive && subscription?.plan_id) {
                        resolvedPlanId = subscription.plan_id;
                        resolvedSource = 'subscription';
                    }
                    if (subscription && isMounted) {
                        setSubscription(subscription);
                    }
                }

                const { data: plan } = await supabase
                    .from('plan_entitlements')
                    .select('*')
                    .eq('plan_id', resolvedPlanId)
                    .maybeSingle();

                if (isMounted && plan) {
                    setEntitlements({
                        plan_id: plan.plan_id,
                        max_active_goals: plan.max_active_goals ?? null,
                        token_hard_cap: plan.token_hard_cap ?? null,
                        token_soft_cap: plan.token_soft_cap ?? null,
                        calendar_sync_enabled: plan.calendar_sync_enabled ?? false,
                    });
                    setEntitlementSource(resolvedSource);
                }
            } catch (err) {
                logger.error('Failed to load entitlements', err);
            }
        };

        void loadEntitlements();
        return () => {
            isMounted = false;
        };
    }, [user.id, entitlementsRefreshKey]);

    const handleSaveProfile = async () => {
        if (!onProfileUpdate) return;
        setIsSavingProfile(true);
        try {
            await onProfileUpdate({
                name: editName,
                role: editRole,
                bio: editBio,
                chronotype: editChronotype,
                energyLevel: editEnergyLevel,
            });
            analytics.track(AnalyticsEvents.PROFILE_UPDATED, {
                fields_changed: ['name', 'role', 'bio', 'chronotype', 'energyLevel'].filter(
                    f => (({ name: editName, role: editRole, bio: editBio, chronotype: editChronotype, energyLevel: editEnergyLevel } as any)[f] !== (user as any)[f])
                ),
            });
            setIsEditingProfile(false);
        } catch (err) {
            logger.error('Failed to update profile', err);
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleCancelEdit = () => {
        resetEditFields();
        setIsEditingProfile(false);
    };

    const handleStartEdit = () => {
        resetEditFields();
        setIsEditingProfile(true);
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== 'DELETE' || !acceptedConsequences) return;

        setIsDeleting(true);
        setDeleteError('');

        try {
            const { error } = await callEdgeFunction('delete-account', {});

            if (error) {
                setDeleteError(error);
                setIsDeleting(false);
                return;
            }

            // Account deleted successfully - redirect to landing
            analytics.track(AnalyticsEvents.ACCOUNT_DELETED);
            onAccountDeleted();
        } catch (err: any) {
            setDeleteError(err.message || 'Failed to delete account');
            setIsDeleting(false);
        }
    };

    const handleManageBilling = async () => {
        setBillingError('');
        analytics.track(AnalyticsEvents.BILLING_PORTAL_OPENED, { plan_id: entitlements?.plan_id || 'unknown' });
        if (entitlements?.plan_id === 'pro_early') {
            return;
        }
        const { data, error } = await callEdgeFunction<{ url: string }>('stripe-portal', {});
        if (error || !data?.url) {
            setBillingError(error || 'Unable to open billing portal. Please upgrade first.');
            return;
        }
        window.location.href = data.url;
    };

    const formatDate = (date: Date | undefined) => {
        if (!date) return 'Unknown';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const chronotypeDisplay =
        user.chronotype === 'early_bird'
            ? '🌅 Early Bird'
            : user.chronotype === 'night_owl'
                ? '🦉 Night Owl'
                : user.chronotype === 'midday_peak'
                    ? '🌞 Midday Peak'
                    : '⏰ Flexible';

    const energyDisplay =
        user.energyLevel === 'high' || user.energyLevel === 'high_octane'
            ? '⚡ High Energy'
            : user.energyLevel === 'recovery'
                ? '🔋 Recovery Mode'
                : '⚖️ Balanced';

    const planLabel = entitlements?.plan_id === 'pro_early'
        ? 'Early Adopter'
        : entitlements?.plan_id?.startsWith('pro')
            ? 'Pro'
            : 'Free';
    const isFreeLikePlan = !entitlements?.plan_id || entitlements.plan_id === 'free' || entitlements.plan_id === 'staging_free';

    const planBadgeClass = entitlements?.plan_id === 'pro_early'
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        : entitlements?.plan_id?.startsWith('pro')
            ? 'bg-primary/20 text-primary border-primary/30'
            : 'bg-muted text-muted-foreground border-border';

    const planStatusLabel = (() => {
        const status = (subscription?.status || '').toLowerCase();
        if (!status) return 'No active subscription';
        if (status === 'past_due') return 'Past Due';
        if (status === 'canceled') return 'Canceled';
        if (status === 'trialing') return 'Trial';
        return 'Active';
    })();

    const renewalLabel = useMemo(() => {
        if (!subscription) return '—';
        if (subscription.status === 'active' && !subscription.current_period_end) {
            return 'Active'; // Fallback if date is missing but active
        }
        if (!subscription.current_period_end) return '—';

        const date = new Date(subscription.current_period_end);
        return subscription.cancel_at_period_end
            ? `Ends on ${formatDate(date)}`
            : `Renews on ${formatDate(date)}`;
    }, [subscription]);

    return (
        <div className="text-foreground pb-28 relative overflow-hidden">
            {/* Background Ambient Glow */}
            <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] rounded-full bg-blue-500/5 blur-[100px]" />
            </div>

            <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                {/* Title Section */}
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-foreground text-5xl font-black leading-tight tracking-tight">Settings</h1>
                            {entitlements && (
                                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${planBadgeClass}`}>
                                    {planLabel}
                                </span>
                            )}
                        </div>
                        <p className="text-muted-foreground text-lg font-normal">
                            Manage your profile and account.
                        </p>
                    </div>
                    <Button
                        type="button"
                        onClick={onBack}
                        variant="outline"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/60 hover:bg-card border border-border text-foreground transition-all w-fit font-bold"
                    >
                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                        Back to Dashboard
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Profile */}
                    <div className="lg:col-span-2 glass-surface rounded-2xl p-6" data-wt="settings-profile">
                        <div className="flex items-start sm:items-center justify-between gap-4 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/20 rounded-lg">
                                    <span className="material-symbols-outlined text-primary">person</span>
                                </div>
                                <div>
                                    <h2 className="text-foreground text-xl font-bold">Profile</h2>
                                    <p className="text-sm text-muted-foreground">Your info and preferences</p>
                                </div>
                            </div>
                            {!isEditingProfile && onProfileUpdate && (
                                <Button
                                    type="button"
                                    onClick={handleStartEdit}
                                    variant="outline"
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card/60 hover:bg-card border border-border text-foreground transition-all text-sm font-bold"
                                >
                                    <span className="material-symbols-outlined text-lg">edit</span>
                                    Edit
                                </Button>
                            )}
                        </div>

                        {onReplayTour && (
                            <Button
                                type="button"
                                onClick={onReplayTour}
                                data-wt="settings-replay-tour"
                                variant="outline"
                                className="mb-6 flex items-center gap-2 px-3 py-2 rounded-xl bg-card/60 hover:bg-card border border-border text-foreground transition-all text-sm font-bold w-fit"
                            >
                                <span className="material-symbols-outlined text-lg">play_circle</span>
                                Replay Product Tour
                            </Button>
                        )}

                        {isEditingProfile ? (
                            <div className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="settings-name" className="block text-sm text-muted-foreground mb-1.5 font-bold">Name</Label>
                                        <Input
                                            id="settings-name"
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className="w-full"
                                            placeholder="Your name"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="settings-role" className="block text-sm text-muted-foreground mb-1.5 font-bold">Role</Label>
                                        <Input
                                            id="settings-role"
                                            type="text"
                                            value={editRole}
                                            onChange={(e) => setEditRole(e.target.value)}
                                            className="w-full"
                                            placeholder="e.g., Software Engineer, Student, Entrepreneur"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="settings-bio" className="block text-sm text-muted-foreground mb-1.5 font-bold">Bio</Label>
                                    <textarea
                                        id="settings-bio"
                                        value={editBio}
                                        onChange={(e) => setEditBio(e.target.value)}
                                        className="stitch-input w-full px-4 py-3 rounded-xl resize-none"
                                        placeholder="Tell us about yourself..."
                                        rows={4}
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="settings-chronotype" className="block text-sm text-muted-foreground mb-1.5 font-bold">Chronotype</Label>
                                        <select
                                            id="settings-chronotype"
                                            value={editChronotype}
                                            onChange={(e) => setEditChronotype(e.target.value)}
                                            className="stitch-input w-full px-4 py-3 rounded-xl"
                                        >
                                            <option value="early_bird">🌅 Early Bird</option>
                                            <option value="night_owl">🦉 Night Owl</option>
                                            <option value="flexible">⏰ Flexible</option>
                                        </select>
                                    </div>
                                    <div>
                                        <Label htmlFor="settings-energy" className="block text-sm text-muted-foreground mb-1.5 font-bold">Energy Level</Label>
                                        <select
                                            id="settings-energy"
                                            value={editEnergyLevel}
                                            onChange={(e) => setEditEnergyLevel(e.target.value)}
                                            className="stitch-input w-full px-4 py-3 rounded-xl"
                                        >
                                            <option value="high">⚡ High Energy</option>
                                            <option value="balanced">⚖️ Balanced</option>
                                            <option value="recovery">🔋 Recovery Mode</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                    <Button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        disabled={isSavingProfile}
                                        variant="outline"
                                        className="flex-1 px-4 py-3 rounded-xl bg-card/60 hover:bg-card border border-border text-foreground font-bold transition-all disabled:opacity-50"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={handleSaveProfile}
                                        disabled={isSavingProfile}
                                        variant="brand"
                                        className="flex-1 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isSavingProfile ? (
                                            <>
                                                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-lg">save</span>
                                                Save Changes
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="stitch-card p-4">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Name</div>
                                    <div className="text-lg font-black text-foreground">{user.name || 'Not set'}</div>
                                </div>
                                <div className="stitch-card p-4">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Email</div>
                                    <div className="text-lg font-black text-foreground">{user.email || 'Not set'}</div>
                                </div>
                                <div className="stitch-card p-4">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Role</div>
                                    <div className="text-lg font-black text-foreground">{user.role || 'Not set'}</div>
                                </div>
                                <div className="stitch-card p-4">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Chronotype</div>
                                    <div className="text-lg font-black text-foreground">{chronotypeDisplay}</div>
                                </div>
                                <div className="stitch-card p-4">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Energy</div>
                                    <div className="text-lg font-black text-foreground">{energyDisplay}</div>
                                </div>
                                <div className="stitch-card p-4">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Member Since</div>
                                    <div className="text-lg font-black text-foreground">{formatDate(user.createdAt)}</div>
                                </div>
                                <div className="stitch-card p-4 md:col-span-2">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Bio</div>
                                    <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                                        {user.bio || 'Not set'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Account */}
                    <div className="space-y-6">
                        <div className="glass-surface rounded-2xl p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-card/60 rounded-lg border border-border">
                                    <span className="material-symbols-outlined text-foreground">payments</span>
                                </div>
                                <h2 className="text-foreground text-lg font-bold">Billing</h2>
                            </div>
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div className="text-sm text-muted-foreground">Current Plan</div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${planBadgeClass}`}>
                                    {planLabel}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-muted-foreground mb-4">
                                <div className="stitch-card p-3">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Status</div>
                                    <div className="text-sm font-semibold text-foreground">{planStatusLabel}</div>
                                </div>
                                <div className="stitch-card p-3">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Renewal</div>
                                    <div className="text-sm font-semibold text-foreground">{renewalLabel}</div>
                                </div>
                            </div>

                            {isFreeLikePlan && onNavigateToPricing && (
                                <Button
                                    type="button"
                                    onClick={onNavigateToPricing}
                                    variant="brand"
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors mb-3"
                                >
                                    <span className="material-symbols-outlined text-lg">bolt</span>
                                    Upgrade to Pro
                                </Button>
                            )}

                            {!isFreeLikePlan && (
                                <Button
                                    type="button"
                                    onClick={handleManageBilling}
                                    disabled={entitlements?.plan_id === 'pro_early'}
                                    variant="outline"
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-card/60 hover:bg-card border border-border text-foreground font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    <span className="material-symbols-outlined text-lg">open_in_new</span>
                                    {entitlements?.plan_id === 'pro_early' ? 'Included (Early Adopter)' : 'Manage Billing'}
                                </Button>
                            )}

                            {billingError && (
                                <p className="text-xs text-red-400 mt-3">
                                    {billingError.includes('No such customer')
                                        ? 'Billing profile not found. Please contact support or upgrade again.'
                                        : billingError}
                                </p>
                            )}
                        </div>

                        <div className="glass-surface rounded-2xl p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-card/60 rounded-lg border border-border">
                                    <span className="material-symbols-outlined text-foreground">manage_accounts</span>
                                </div>
                                <h2 className="text-foreground text-lg font-bold">Account</h2>
                            </div>
                            <Button
                                type="button"
                                onClick={onSignOut}
                                variant="outline"
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-card/60 hover:bg-card border border-border text-foreground font-bold transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">logout</span>
                                Sign Out
                            </Button>
                        </div>

                        {onStorageModeChange && (
                            <div className="glass-surface rounded-2xl p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-card/60 rounded-lg border border-border">
                                        <span className="material-symbols-outlined text-foreground">shield_lock</span>
                                    </div>
                                    <h2 className="text-foreground text-lg font-bold">Privacy</h2>
                                </div>

                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        checked={rememberMeEnabled}
                                        onCheckedChange={handleStorageToggle}
                                        id="remember-me-toggle"
                                    />
                                    <div className="space-y-1">
                                        <Label htmlFor="remember-me-toggle" className="text-sm font-semibold text-foreground">
                                            Remember me on this device
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            Keep your profile and goals stored locally. Turn off on shared devices.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="glass-surface rounded-2xl p-6 border border-red-500/30">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                                    <span className="material-symbols-outlined text-red-400">warning</span>
                                </div>
                                <h2 className="text-red-400 text-lg font-bold">Danger Zone</h2>
                            </div>

                            <p className="text-sm text-muted-foreground mb-4">
                                Delete your account and all associated data. This cannot be undone.
                            </p>

                            <Button
                                type="button"
                                onClick={() => setShowDeleteModal(true)}
                                variant="destructive"
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 font-bold hover:bg-red-500/30 transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">delete_forever</span>
                                Delete Account
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={() => !isDeleting && setShowDeleteModal(false)}
                    />

                    <div className="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-red-500">warning</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">Delete Account</h3>
                                    <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {deleteError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                                    {deleteError}
                                </div>
                            )}

                            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                                <p className="text-sm text-amber-400 font-medium mb-2">
                                    The following data will be permanently deleted:
                                </p>
                                <ul className="text-sm text-amber-300/70 space-y-1">
                                    <li>• Your profile and account information</li>
                                    <li>• All your goals, phases, and milestones</li>
                                    <li>• All calendar events and schedules</li>
                                    <li>• Your time constraints and preferences</li>
                                </ul>
                            </div>

                            <div className="flex items-start gap-3">
                                <Checkbox
                                    id="delete-account-consequences"
                                    checked={acceptedConsequences}
                                    onCheckedChange={(checked) => setAcceptedConsequences(checked === true)}
                                    disabled={isDeleting}
                                    className="mt-0.5"
                                />
                                <Label htmlFor="delete-account-consequences" className="text-sm text-muted-foreground leading-5">
                                    I understand that all my data will be permanently deleted and there is no way to recover it.
                                </Label>
                            </div>

                            <div>
                                <Label htmlFor="delete-account-confirmation" className="block text-sm font-medium text-foreground mb-1.5">
                                    Type <span className="font-bold text-red-400">DELETE</span> to confirm
                                </Label>
                                <Input
                                    id="delete-account-confirmation"
                                    type="text"
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                                    placeholder="DELETE"
                                    disabled={isDeleting}
                                    className="stitch-input w-full px-4 py-3 rounded-xl border-red-500/40 focus:border-red-500"
                                />
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Type <span className="font-bold text-red-300">DELETE</span> to enable account deletion.
                                </p>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-muted/40 border-t border-border flex gap-3">
                            <Button
                                type="button"
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                variant="outline"
                                className="flex-1 px-4 py-2.5 rounded-xl glass-surface text-foreground font-medium text-sm hover:border-primary transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleDeleteAccount}
                                disabled={isDeleting || deleteConfirmText !== 'DELETE' || !acceptedConsequences}
                                variant="destructive"
                                className="flex-1 px-4 py-2.5 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-lg">delete_forever</span>
                                        Delete My Account
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <CheckoutModal
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                planId={checkoutPlanId}
                planLabel="Pro Monthly"
                userId={user.id}
                onUpgradeActivated={() => setEntitlementsRefreshKey((prev) => prev + 1)}
            />
        </div>
    );
};

export default SettingsPage;
