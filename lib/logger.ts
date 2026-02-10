// =============================================================================
// LOGGER - Middleware.io Integration
// Unified logging utility following LoggingStandards.md
// =============================================================================

/// <reference types="vite/client" />

// Middleware.io Browser SDK Interface (From CDN script)
interface MiddlewareSDK {
    track: (config: any) => void;
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
    debug?: (message: string, data?: any) => void;
}

// Global Window Extension
declare global {
    interface Window {
        Middleware?: MiddlewareSDK;
    }
}

// Environment Check
const IS_DEV = import.meta.env.DEV;

const RAW_CONSOLE = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const LOG_LEVEL = (import.meta.env.VITE_LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const LOG_LEVEL_THRESHOLD = LOG_LEVELS[LOG_LEVEL] ?? LOG_LEVELS.info;
const REDACT_MODE = (import.meta.env.VITE_LOG_REDACT_MODE || 'strict').toLowerCase();
const MW_LOG_TARGET = import.meta.env.VITE_MW_TARGET || '';
const MW_LOG_API_KEY = import.meta.env.VITE_MW_API_KEY || '';
const ENABLE_MW_HTTP_LOG_SHIPPING = import.meta.env.VITE_MW_BROWSER_OTLP === 'true'
    || (import.meta.env.VITE_MW_BROWSER_OTLP !== 'false' && !!MW_LOG_TARGET && !!MW_LOG_API_KEY);
const MW_SERVICE_NAME = import.meta.env.VITE_MW_SERVICE_NAME || 'dlulu-web';
const MW_PROJECT_NAME = import.meta.env.VITE_MW_PROJECT_NAME || 'dlulu';
let hasWarnedMwHttpFailure = false;
let mwHttpShippingDisabledForSession = false;

const SENSITIVE_KEY_RE = /^(token|access_token|refresh_token|secret|password|api[_-]?key|authorization|email|prompt|response|content|note)$/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9._-]+?\.[A-Za-z0-9._-]+\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._-]+/gi;
const IGNORED_CONSOLE_PATTERNS = [
    /Download the React DevTools/i,
    /You may test your Stripe\.js integration over HTTP/i,
    /A custom element with name 'mce-autosize-textarea' has already been defined/i,
    /\[Stripe\.js\]/i,
    /payment method types are not activated/i,
    /registered or verified the domain/i,
    /Apple Pay or Google Pay.*serve this page over HTTPS/i,
];

// =============================================================================
// Log Context Interface
// =============================================================================

interface LogContext {
    [key: string]: any;
}

interface NormalizedError {
    name?: string;
    message?: string;
    stack?: string;
    cause?: string;
    code?: string | number;
    details?: string;
    hint?: string;
}

const redactString = (value: string): string => {
    if (REDACT_MODE !== 'strict') return value;
    return value
        .replace(EMAIL_RE, '[REDACTED_EMAIL]')
        .replace(JWT_RE, '[REDACTED_TOKEN]')
        .replace(BEARER_RE, 'Bearer [REDACTED_TOKEN]');
};

const redactValue = (value: unknown, key?: string): unknown => {
    if (REDACT_MODE !== 'strict') return value;
    if (key && SENSITIVE_KEY_RE.test(key)) {
        return '[REDACTED]';
    }
    if (typeof value === 'string') {
        return redactString(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => redactValue(item));
    }
    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([entryKey, entryValue]) => {
            if (entryKey.startsWith('__')) return;
            result[entryKey] = redactValue(entryValue, entryKey);
        });
        return result;
    }
    return value;
};

const redactContext = (context: LogContext): LogContext => {
    return (redactValue(context) as LogContext) || {};
};

const normalizeError = (error: any): NormalizedError => {
    if (!error) {
        return { message: 'Unknown error' };
    }
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
            cause: error.cause ? String(error.cause) : undefined,
        };
    }
    if (typeof error === 'object') {
        return {
            name: error.name ? String(error.name) : undefined,
            message: error.message ? String(error.message) : String(error),
            stack: error.stack ? String(error.stack) : undefined,
            cause: error.cause ? String(error.cause) : undefined,
            code: error.code,
            details: error.details ? String(error.details) : undefined,
            hint: error.hint ? String(error.hint) : undefined,
        };
    }
    return { message: String(error) };
};

const shouldIgnoreConsoleArgs = (args: unknown[]): boolean => {
    const joined = args
        .map((arg) => {
            if (typeof arg === 'string') return arg;
            if (arg instanceof Error) return arg.message || String(arg);
            if (arg && typeof arg === 'object' && 'message' in (arg as Record<string, unknown>)) {
                return String((arg as Record<string, unknown>).message);
            }
            return '';
        })
        .join(' ')
        .trim();

    if (!joined) return false;
    return IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(joined));
};

const toOtelValue = (value: unknown) => {
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') return { doubleValue: value };
    if (typeof value === 'boolean') return { boolValue: value };
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map((item) => toOtelValue(item)) } };
    }
    if (value && typeof value === 'object') {
        return { stringValue: JSON.stringify(value) };
    }
    return { stringValue: String(value) };
};

const buildMwEndpoint = (target: string): string => {
    const trimmed = target.replace(/\/$/, '');
    if (trimmed.endsWith('/v1/logs')) return trimmed;
    return `${trimmed}/v1/logs`;
};

// =============================================================================
// Logger Class
// =============================================================================

class Logger {
    private static instance: Logger;
    private context: LogContext = {};
    private queue: Array<{ level: LogLevel; message: string; context: LogContext }> = [];
    private flushScheduled = false;
    private consoleCaptured = false;

    private constructor() {
        // Private constructor for singleton
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Set global context for all subsequent logs (e.g., userId)
     */
    public setContext(context: LogContext) {
        this.context = { ...this.context, ...context };
    }

    /**
     * Clear specific context key
     */
    public clearContext(key: string) {
        delete this.context[key];
    }

    /**
     * Flush queued logs once Middleware SDK is ready.
     */
    public flush() {
        if (typeof window === 'undefined' || !window.Middleware || this.queue.length === 0) {
            return;
        }
        const queued = [...this.queue];
        this.queue = [];
        queued.forEach((entry) => {
            this.dispatchToMiddleware(entry.level, entry.message, entry.context);
        });
    }

    /**
     * Enable console capture to forward console logs into Middleware.
     */
    public enableConsoleCapture() {
        if (this.consoleCaptured) return;
        this.consoleCaptured = true;

        const forward = (level: LogLevel, args: unknown[]) => {
            if (shouldIgnoreConsoleArgs(args)) {
                return;
            }
            const message = `[console.${level}]`;
            this.log(level, message, { consoleArgs: args });
        };

        console.log = (...args: unknown[]) => {
            if (shouldIgnoreConsoleArgs(args)) {
                return;
            }
            RAW_CONSOLE.log(...args);
            forward('info', args);
        };
        console.info = (...args: unknown[]) => {
            if (shouldIgnoreConsoleArgs(args)) {
                return;
            }
            RAW_CONSOLE.info(...args);
            forward('info', args);
        };
        console.warn = (...args: unknown[]) => {
            if (shouldIgnoreConsoleArgs(args)) {
                return;
            }
            RAW_CONSOLE.warn(...args);
            forward('warn', args);
        };
        console.error = (...args: unknown[]) => {
            if (shouldIgnoreConsoleArgs(args)) {
                return;
            }
            RAW_CONSOLE.error(...args);
            forward('error', args);
        };
        console.debug = (...args: unknown[]) => {
            if (shouldIgnoreConsoleArgs(args)) {
                return;
            }
            RAW_CONSOLE.debug(...args);
            forward('debug', args);
        };
    }

    // =============================================================================
    // Core Logging Methods
    // =============================================================================

    public debug(message: string, context?: LogContext) {
        this.log('debug', message, context);
    }

    public info(message: string, context?: LogContext) {
        this.log('info', message, context);
    }

    public warn(message: string, context?: LogContext) {
        this.log('warn', message, context);
    }

    public error(message: string, error?: any, context?: LogContext) {
        this.log('error', message, context, error);
    }

    private log(level: LogLevel, message: string, context?: LogContext, error?: any) {
        const normalizedError = error ? normalizeError(error) : undefined;
        const mergedContext: LogContext = {
            ...this.context,
            ...context,
            timestamp: new Date().toISOString(),
            ...(normalizedError ? { error: normalizedError } : {}),
        };

        const redactedContext = redactContext(mergedContext);
        const redactedMessage = redactString(message);

        if (IS_DEV) {
            const consoleMethod = level === 'debug'
                ? RAW_CONSOLE.debug
                : level === 'info'
                    ? RAW_CONSOLE.info
                    : level === 'warn'
                        ? RAW_CONSOLE.warn
                        : RAW_CONSOLE.error;
            consoleMethod(`[${level.toUpperCase()}] ${redactedMessage}`, redactedContext);
        }

        this.sendToMiddleware(level, redactedMessage, redactedContext);
    }

    private shouldShip(level: LogLevel) {
        return LOG_LEVELS[level] >= LOG_LEVEL_THRESHOLD;
    }

    /**
     * Send log to Middleware.io
     */
    private sendToMiddleware(level: LogLevel, message: string, context: LogContext) {
        if (!this.shouldShip(level)) return;

        if (typeof window !== 'undefined' && window.Middleware) {
            this.dispatchToMiddleware(level, message, context);
            this.flush();
            return;
        }

        this.enqueue(level, message, context);
        if (!this.flushScheduled && typeof window !== 'undefined') {
            this.flushScheduled = true;
            window.setTimeout(() => {
                this.flushScheduled = false;
                this.flush();
            }, 500);
        }
    }

    private dispatchToMiddleware(level: LogLevel, message: string, context: LogContext) {
        try {
            if (typeof window !== 'undefined' && window.Middleware) {
                const mw = window.Middleware as any;
                if (typeof mw[level] === 'function') {
                    mw[level](message, context);
                } else if (typeof mw.info === 'function') {
                    mw.info(`[${level.toUpperCase()}] ${message}`, context);
                }
            }
        } catch (e) {
            if (IS_DEV) {
                RAW_CONSOLE.debug('[Logger] Failed to send to Middleware:', e);
            }
        }

        this.dispatchToMiddlewareHttp(level, message, context);
    }

    private dispatchToMiddlewareHttp(level: LogLevel, message: string, context: LogContext) {
        if (!ENABLE_MW_HTTP_LOG_SHIPPING) return;
        if (mwHttpShippingDisabledForSession) return;
        if (!MW_LOG_TARGET || !MW_LOG_API_KEY || typeof fetch === 'undefined') return;

        const attributes = Object.entries(context).map(([key, value]) => ({
            key,
            value: toOtelValue(value),
        }));
        const timeUnixNano = `${Date.now()}000000`;

        const payload = {
            resourceLogs: [
                {
                    resource: {
                        attributes: [
                            { key: 'service.name', value: { stringValue: MW_SERVICE_NAME } },
                            { key: 'project.name', value: { stringValue: MW_PROJECT_NAME } },
                            { key: 'environment', value: { stringValue: import.meta.env.MODE } },
                        ],
                    },
                    scopeLogs: [
                        {
                            scope: { name: 'browser-logger', version: '1.0.0' },
                            logRecords: [
                                {
                                    timeUnixNano,
                                    severityText: level.toUpperCase(),
                                    severityNumber: level === 'error'
                                        ? 17
                                        : level === 'warn'
                                            ? 13
                                            : level === 'info'
                                                ? 9
                                                : 5,
                                    body: { stringValue: message },
                                    attributes,
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const authHeader = MW_LOG_API_KEY.toLowerCase().startsWith('bearer ')
            ? MW_LOG_API_KEY
            : `Bearer ${MW_LOG_API_KEY}`;

        fetch(buildMwEndpoint(MW_LOG_TARGET), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
            },
            body: JSON.stringify(payload),
            keepalive: true,
        }).then(async (response) => {
            if (response.ok || hasWarnedMwHttpFailure) return;
            hasWarnedMwHttpFailure = true;
            const body = await response.text().catch(() => '');
            RAW_CONSOLE.warn('[Logger] Middleware HTTP rejected log payload', {
                status: response.status,
                body,
            });
            if (response.status >= 400 && response.status < 500) {
                mwHttpShippingDisabledForSession = true;
                RAW_CONSOLE.warn('[Logger] Disabling Middleware HTTP log shipping for this session after client-side rejection', {
                    status: response.status,
                });
            }
        }).catch((err) => {
            if (IS_DEV) {
                RAW_CONSOLE.debug('[Logger] Middleware HTTP dispatch failed', err);
            }
        });
    }

    private enqueue(level: LogLevel, message: string, context: LogContext) {
        const MAX_QUEUE = 200;
        if (this.queue.length >= MAX_QUEUE) {
            this.queue.shift();
        }
        this.queue.push({ level, message, context });
    }
}

export const logger = Logger.getInstance();
