// =============================================================================
// CHAT DATA HOOK
// Handles chat session and message persistence in Supabase
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { logger } from '../logger';
import type { Database } from '../database.types';
import type { ChatMessage, ChatAction, PendingConfirmation } from '../../services/gemini/chatbotTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface ChatSession {
    id: string;
    userId: string;
    title?: string;
    startedAt: Date;
    lastMessageAt: Date;
    messageCount: number;
    isActive: boolean;
}

export type DbChatMessage = Database['public']['Tables']['chat_messages']['Row'];

export interface UseChatDataReturn {
    // Session state
    currentSession: ChatSession | null;
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;

    // Actions
    createOrGetSession: () => Promise<string | null>;
    startNewSession: () => Promise<void>;
    saveMessage: (message: ChatMessage) => Promise<void>;
    loadConversationHistory: (sessionId: string) => Promise<ChatMessage[]>;
    clearSession: () => Promise<void>; // Marks invalid/clears local; startNewSession is preferred for explicit new chats
    deleteSession: (sessionId: string) => Promise<void>; // Permanently delete a session and its messages

    // Sessions list
    sessions: ChatSession[];
    loadSessions: () => Promise<ChatSession[]>;

    // Pending confirmation
    pendingConfirmation: PendingConfirmation | null;
    setPendingConfirmation: (confirmation: PendingConfirmation | null) => void;
    confirmAction: () => Promise<void>;
    cancelAction: () => void;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

export function useChatData(userId: string | undefined): UseChatDataReturn {
    const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

    // Ref to track if we've loaded the session
    const sessionLoadedRef = useRef(false);

    // =============================================================================
    // SESSION MANAGEMENT
    // =============================================================================

    const loadSessions = useCallback(async (): Promise<ChatSession[]> => {
        if (!userId) return [];

        try {
            const { data, error } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('user_id', userId)
                .order('last_message_at', { ascending: false });

            if (error) {
                logger.error('[ChatData] Error loading sessions', error);
                return [];
            }

            const transformedSessions: ChatSession[] = (data || []).map(s => ({
                id: s.id,
                userId: s.user_id,
                title: s.title || 'New Session',
                startedAt: new Date(s.started_at),
                lastMessageAt: new Date(s.last_message_at),
                messageCount: s.message_count || 0,
                isActive: s.is_active,
            }));

            setSessions(transformedSessions);
            return transformedSessions;
        } catch (err) {
            logger.error('[ChatData] Load sessions error', err);
            return [];
        }
    }, [userId]);

    const createOrGetSession = useCallback(async (): Promise<string | null> => {
        if (!userId) {
            // No userId available
            return null;
        }

        // If we already have a session, return it
        if (currentSession?.id) {
            return currentSession.id;
        }

        try {
            // First, try to get an active session
            // Note: Using 'as any' because chat_sessions table types haven't been generated yet
            const { data: existingSession, error: fetchError } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true)
                .order('last_message_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (fetchError) {
                logger.error('[ChatData] Error fetching session', fetchError);
            }

            if (existingSession) {
                const session: ChatSession = {
                    id: existingSession.id,
                    userId: existingSession.user_id,
                    title: existingSession.title,
                    startedAt: new Date(existingSession.started_at),
                    lastMessageAt: new Date(existingSession.last_message_at),
                    messageCount: existingSession.message_count || 0,
                    isActive: existingSession.is_active,
                };
                setCurrentSession(session);
                // Using existing session
                return session.id;
            }

            // Create new session using the helper function
            const { data: newSessionData, error: createError } = await supabase
                .rpc('get_or_create_chat_session', { p_user_id: userId });

            if (createError) {
                logger.error('[ChatData] Error creating session', createError);
                setError('Failed to create chat session');
                return null;
            }

            const newSession: ChatSession = {
                id: newSessionData,
                userId,
                startedAt: new Date(),
                lastMessageAt: new Date(),
                messageCount: 0,
                isActive: true,
            };

            setCurrentSession(newSession);
            // Created new session
            // Refresh sessions list
            loadSessions();
            return newSession.id;

        } catch (err: any) {
            logger.error('[ChatData] Session error', err);
            setError(err.message);
            return null;
        }
    }, [userId, currentSession, loadSessions]);

    const startNewSession = useCallback(async (): Promise<void> => {
        if (!userId) return;

        // Optimistically clear local state
        setMessages([]);
        setPendingConfirmation(null);
        setCurrentSession(null);

        // Deactivate all previous sessions in DB
        try {
            await supabase
                .from('chat_sessions')
                .update({ is_active: false })
                .eq('user_id', userId);
        } catch (err) {
            logger.error('[ChatData] Error deactivating sessions', err);
        }

        // Create new session immediately
        await createOrGetSession();
        // Refresh sessions list
        await loadSessions();
    }, [userId, createOrGetSession, loadSessions]);

    // =============================================================================
    // MESSAGE PERSISTENCE
    // =============================================================================

    const saveMessage = useCallback(async (message: ChatMessage): Promise<void> => {
        if (!userId) return;

        // 1. Optimistic Update
        setMessages(prev => {
            if (prev.find(m => m.id === message.id)) return prev;
            return [...prev, message];
        });

        let sessionId = currentSession?.id;
        if (!sessionId) {
            sessionId = await createOrGetSession();
            if (!sessionId) {
                // Optimization failed - mark error
                setMessages(prev => prev.map(m =>
                    m.id === message.id ? { ...m, isError: true, errorMessage: 'Failed to start session' } : m
                ));
                return;
            }
        }

        try {
            // Note: Using RPC to bypass RLS issues during development/testing
            const { error: insertError } = await supabase
                .rpc('save_chat_message', {
                    p_message_id: message.id,
                    p_session_id: sessionId,
                    p_user_id: userId,
                    p_role: message.role,
                    p_content: message.content,
                    p_action_results: (message.actions as any) || null,
                    p_pending_confirmation: (message.pendingConfirmation as any) || null,
                });

            if (insertError) {
                logger.error('[ChatData] Error saving message', insertError);
                setMessages(prev => prev.map(m =>
                    m.id === message.id ? { ...m, isError: true, errorMessage: 'Failed to save message' } : m
                ));
            } else {
                // Message saved
                // Refresh current session metadata if needed or sessions list
                loadSessions();
            }

        } catch (err: any) {
            logger.error('[ChatData] Save message error', err);
            setMessages(prev => prev.map(m =>
                m.id === message.id ? { ...m, isError: true, errorMessage: err.message || 'Unknown error' } : m
            ));
        }
    }, [userId, currentSession, createOrGetSession, loadSessions]);

    const loadConversationHistory = useCallback(async (sessionId: string): Promise<ChatMessage[]> => {
        if (!userId || !sessionId) return [];

        setIsLoading(true);
        try {
            // Also update current session to this one if switching from history
            const { data: sessionData } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('id', sessionId)
                .single();

            if (sessionData) {
                setCurrentSession({
                    id: sessionData.id,
                    userId: sessionData.user_id,
                    title: sessionData.title,
                    startedAt: new Date(sessionData.started_at),
                    lastMessageAt: new Date(sessionData.last_message_at),
                    messageCount: sessionData.message_count || 0,
                    isActive: sessionData.is_active,
                });
            }

            // Note: Using 'as any' because chat_messages table types haven't been generated yet
            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true })
                .limit(100);

            if (error) {
                logger.error('[ChatData] Error loading history', error);
                return [];
            }

            const history: ChatMessage[] = (data || []).map((msg: DbChatMessage) => ({
                id: msg.id,
                role: msg.role as ChatMessage['role'],
                content: msg.content,
                timestamp: new Date(msg.created_at || new Date().toISOString()),
                actions: (msg.action_results as any) as ChatAction[],
                pendingConfirmation: (msg.pending_confirmation as any) as PendingConfirmation,
            }));

            setMessages(history);
            // Loaded messages from history
            return history;

        } catch (err: any) {
            logger.error('[ChatData] Load history error', err);
            return [];
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    const clearSession = useCallback(async (): Promise<void> => {
        if (!currentSession?.id) return;

        try {
            // Mark current session as inactive
            await supabase
                .from('chat_sessions')
                .update({ is_active: false })
                .eq('id', currentSession.id);

            setCurrentSession(null);
            setMessages([]);
            setPendingConfirmation(null);
            // Session cleared
            loadSessions();

        } catch (err: any) {
            logger.error('[ChatData] Clear session error', err);
        }
    }, [currentSession, loadSessions]);

    const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
        if (!userId || !sessionId) return;

        try {
            // Delete messages first (cascade should handle this, but let's be explicit)
            const { error: msgError } = await supabase
                .from('chat_messages')
                .delete()
                .eq('session_id', sessionId);

            if (msgError) {
                logger.error('[ChatData] Error deleting messages', msgError);
            }

            // Delete the session
            const { error: sessionError } = await supabase
                .from('chat_sessions')
                .delete()
                .eq('id', sessionId);

            if (sessionError) {
                logger.error('[ChatData] Error deleting session', sessionError);
                throw sessionError;
            }

            // If we deleted the current session, clear it
            if (currentSession?.id === sessionId) {
                setCurrentSession(null);
                setMessages([]);
                setPendingConfirmation(null);
            }

            // Refresh sessions list
            await loadSessions();
            // Session deleted

        } catch (err: any) {
            logger.error('[ChatData] Delete session error', err);
            throw err;
        }
    }, [userId, currentSession, loadSessions]);

    // =============================================================================
    // CONFIRMATION HANDLING
    // =============================================================================

    const confirmAction = useCallback(async (): Promise<void> => {
        if (!pendingConfirmation) return;

        // Mark the action as confirmed
        const confirmedAction = {
            ...pendingConfirmation,
            confirmed: true,
            confirmedAt: new Date(),
        };

        // The caller should handle executing the confirmed action
        // We just update state here
        setPendingConfirmation(null);

        // Action confirmed
    }, [pendingConfirmation]);

    const cancelAction = useCallback((): void => {
        if (!pendingConfirmation) return;

        // Action cancelled
        setPendingConfirmation(null);
    }, [pendingConfirmation]);

    // =============================================================================
    // LOAD SESSION ON MOUNT
    // =============================================================================

    useEffect(() => {
        if (userId && !sessionLoadedRef.current) {
            sessionLoadedRef.current = true;
            loadSessions();
            createOrGetSession().then(sessionId => {
                if (sessionId) {
                    loadConversationHistory(sessionId);
                }
            });
        }
    }, [userId, createOrGetSession, loadConversationHistory, loadSessions]);

    return {
        currentSession,
        messages,
        sessions,
        isLoading,
        error,
        createOrGetSession,
        startNewSession,
        saveMessage,
        loadConversationHistory,
        loadSessions,
        clearSession,
        deleteSession,
        pendingConfirmation,
        setPendingConfirmation,
        confirmAction,
        cancelAction,
    };
}
