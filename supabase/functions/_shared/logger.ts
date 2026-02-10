// =============================================================================
// EDGE FUNCTION LOGGER
// Standardized logging for Supabase Edge Functions
// Sends structured logs that integrate with Middleware.io
// =============================================================================

import { getCorsHeaders } from './cors.ts';

// =============================================================================
// Middleware.io Log Shipping (OTLP/HTTP)
// =============================================================================

const MW_LOG_TARGET = Deno.env.get('MW_LOG_TARGET') || Deno.env.get('MW_TARGET') || '';
const MW_LOG_API_KEY = Deno.env.get('MW_LOG_API_KEY') || Deno.env.get('MW_API_KEY') || '';
const MW_ACCOUNT_KEY = Deno.env.get('MW_ACCOUNT_KEY') || Deno.env.get('MW_LOG_ACCOUNT_KEY') || MW_LOG_API_KEY || '';
const MW_SERVICE_NAME = Deno.env.get('MW_SERVICE_NAME') || 'dlulu-edge';
const MW_PROJECT_NAME = Deno.env.get('MW_PROJECT_NAME') || 'dlulu';
const MW_ENVIRONMENT = Deno.env.get('MW_ENV') || Deno.env.get('ENVIRONMENT') || 'production';
const MW_LOG_LEVEL = (Deno.env.get('MW_LOG_LEVEL') || 'info').toLowerCase();
const MW_RESOURCE_TYPE = Deno.env.get('MW_RESOURCE_TYPE') || 'custom';
let hasWarnedMissingMwConfig = false;
let hasWarnedMwSendFailure = false;

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVELS: Record<string, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const SENSITIVE_KEY_RE = /^(token|access_token|refresh_token|secret|password|api[_-]?key|authorization|email|prompt|response|content|note)$/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9._-]+?\.[A-Za-z0-9._-]+\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._-]+/gi;

const shouldShip = (level: LogLevel) => {
    const threshold = LOG_LEVELS[MW_LOG_LEVEL] ?? LOG_LEVELS.info;
    const current = LOG_LEVELS[level.toLowerCase()] ?? LOG_LEVELS.info;
    return current >= threshold;
};

const redactString = (value: string) => {
    return value
        .replace(EMAIL_RE, '[REDACTED_EMAIL]')
        .replace(JWT_RE, '[REDACTED_TOKEN]')
        .replace(BEARER_RE, 'Bearer [REDACTED_TOKEN]');
};

const redactValue = (value: unknown, key?: string): unknown => {
    if (key && SENSITIVE_KEY_RE.test(key)) return '[REDACTED]';
    if (typeof value === 'string') return redactString(value);
    if (value instanceof Error) {
        return {
            name: value.name,
            message: redactString(value.message),
            stack: value.stack ? redactString(value.stack) : undefined,
        };
    }
    if (Array.isArray(value)) return value.map((item) => redactValue(item));
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

const buildEndpoint = (target: string) => {
    const trimmed = target.replace(/\/$/, '');
    if (trimmed.endsWith('/v1/logs')) return trimmed;
    return `${trimmed}/v1/logs`;
};

const sendToMiddleware = async (level: LogLevel, message: string, context: Record<string, any>) => {
    if (!MW_LOG_TARGET || !MW_LOG_API_KEY) {
        if (!hasWarnedMissingMwConfig) {
            hasWarnedMissingMwConfig = true;
            console.warn('[Edge Logger] Middleware disabled: missing MW_LOG_TARGET or MW_LOG_API_KEY');
        }
        return;
    }
    if (!shouldShip(level)) return;

    const safeContext = redactValue(context) as Record<string, any>;
    const attributes = Object.entries(safeContext).map(([key, value]) => ({
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
                        ...(MW_ACCOUNT_KEY ? [{ key: 'mw.account_key', value: { stringValue: MW_ACCOUNT_KEY } }] : []),
                        { key: 'mw.resource_type', value: { stringValue: MW_RESOURCE_TYPE } },
                        { key: 'environment', value: { stringValue: MW_ENVIRONMENT } },
                    ],
                },
                scopeLogs: [
                    {
                        scope: { name: 'edge-logger', version: '1.0.0' },
                        logRecords: [
                            {
                                timeUnixNano,
                                severityText: level,
                                severityNumber: level === 'ERROR'
                                    ? 17
                                    : level === 'WARN'
                                        ? 13
                                        : level === 'INFO'
                                            ? 9
                                            : 5,
                                body: { stringValue: redactString(message) },
                                attributes,
                            },
                        ],
                    },
                ],
            },
        ],
    };

    try {
        const authHeader = MW_LOG_API_KEY.toLowerCase().startsWith('bearer ')
            ? MW_LOG_API_KEY
            : `Bearer ${MW_LOG_API_KEY}`;
        const response = await fetch(buildEndpoint(MW_LOG_TARGET), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok && !hasWarnedMwSendFailure) {
            hasWarnedMwSendFailure = true;
            const body = await response.text();
            console.warn('[Edge Logger] Middleware rejected logs', {
                status: response.status,
                body: redactString(body),
            });
        }
    } catch (error) {
        if (!hasWarnedMwSendFailure) {
            hasWarnedMwSendFailure = true;
            console.warn('[Edge Logger] Failed to send to Middleware', error);
        }
    }
};

export const getRequestId = (req: Request): string | undefined => {
    return req.headers.get('x-request-id') || undefined;
};

// =============================================================================
// ERROR CODE REGISTRY
// Format: 10{sequence}{HTTP status}
// =============================================================================

export const ErrorCodes = {
    // Authentication errors (101xxx)
    UNAUTHORIZED: { code: 101401, key: 'unauthorized', status: 401 },
    TOKEN_EXPIRED: { code: 102401, key: 'token_expired', status: 401 },

    // Validation errors (10x400)
    VALIDATION_ERROR: { code: 103400, key: 'validation_error', status: 400 },
    MISSING_FIELD: { code: 104400, key: 'missing_field', status: 400 },
    INVALID_FORMAT: { code: 105400, key: 'invalid_format', status: 400 },

    // Not Found errors (10x404)
    NOT_FOUND: { code: 106404, key: 'not_found', status: 404 },
    GOAL_NOT_FOUND: { code: 107404, key: 'goal_not_found', status: 404 },
    USER_NOT_FOUND: { code: 108404, key: 'user_not_found', status: 404 },

    // Server errors (10x500)
    INTERNAL_ERROR: { code: 109500, key: 'internal_error', status: 500 },
    GEMINI_ERROR: { code: 110500, key: 'gemini_api_error', status: 500 },
    DATABASE_ERROR: { code: 111500, key: 'database_error', status: 500 },

    // Rate limiting (10x429)
    RATE_LIMITED: { code: 112429, key: 'rate_limited', status: 429 },
} as const;

// Type for error codes
export type ErrorCodeKey = keyof typeof ErrorCodes;

// =============================================================================
// STRUCTURED ERROR INTERFACE
// =============================================================================

export interface StructuredError {
    errorcode: number;
    errorkey: string;
    errormessage: string;
}

export interface ErrorResponse {
    success: false;
    error: StructuredError;
}

export interface SuccessResponse<T> {
    success: true;
    data: T;
}

// =============================================================================
// LOGGING FUNCTIONS
// =============================================================================

/**
 * Log info message with structured context
 */
export function logInfo(functionName: string, message: string, context?: Record<string, any>) {
    const logEntry = {
        level: 'INFO',
        function: functionName,
        message,
        timestamp: new Date().toISOString(),
        ...context,
    };
    console.log(JSON.stringify(logEntry));
    void sendToMiddleware('INFO', message, logEntry);
}

/**
 * Log warning message with structured context
 */
export function logWarn(functionName: string, message: string, context?: Record<string, any>) {
    const logEntry = {
        level: 'WARN',
        function: functionName,
        message,
        timestamp: new Date().toISOString(),
        ...context,
    };
    console.warn(JSON.stringify(logEntry));
    void sendToMiddleware('WARN', message, logEntry);
}

/**
 * Log error with full structured format
 */
export function logError(
    functionName: string,
    errorType: ErrorCodeKey,
    errormessage: string,
    context?: Record<string, any>
) {
    const errorDef = ErrorCodes[errorType];
    const logEntry = {
        level: 'ERROR',
        function: functionName,
        errorcode: errorDef.code,
        errorkey: errorDef.key,
        errormessage,
        timestamp: new Date().toISOString(),
        ...context,
    };
    console.error(JSON.stringify(logEntry));
    void sendToMiddleware('ERROR', errormessage, logEntry);
}

// =============================================================================
// RESPONSE HELPERS
// =============================================================================

/**
 * Create a standardized error response
 */
export function createErrorResponse(
    errorType: ErrorCodeKey,
    errormessage: string,
    context?: Record<string, any>
): Response {
    const errorDef = ErrorCodes[errorType];

    const body: ErrorResponse = {
        success: false,
        error: {
            errorcode: errorDef.code,
            errorkey: errorDef.key,
            errormessage,
        },
    };

    // Log the error
    if (context?.functionName) {
        logError(context.functionName, errorType, errormessage, context);
    }

    const origin = typeof context?.origin === 'string' ? context.origin : undefined;
    const headers = {
        ...getCorsHeaders(origin),
        'Content-Type': 'application/json',
        ...(context?.requestId ? { 'x-request-id': context.requestId } : {}),
    };

    return new Response(
        JSON.stringify(body),
        {
            status: errorDef.status,
            headers,
        }
    );
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(data: T, context?: Record<string, any>): Response {
    const body: SuccessResponse<T> = {
        success: true,
        data,
    };

    const origin = typeof context?.origin === 'string' ? context.origin : undefined;
    return new Response(
        JSON.stringify(body),
        {
            status: 200,
            headers: {
                ...getCorsHeaders(origin),
                'Content-Type': 'application/json',
                ...(context?.requestId ? { 'x-request-id': context.requestId } : {}),
            },
        }
    );
}

/**
 * Shortcut for common error responses
 */
export const Errors = {
    unauthorized: (message = 'Invalid or expired authentication token', context?: Record<string, any>) =>
        createErrorResponse('UNAUTHORIZED', message, context),

    validationError: (message: string, context?: Record<string, any>) =>
        createErrorResponse('VALIDATION_ERROR', message, context),

    missingField: (field: string, context?: Record<string, any>) =>
        createErrorResponse('MISSING_FIELD', `Required field missing: ${field}`, context),

    notFound: (resource: string, context?: Record<string, any>) =>
        createErrorResponse('NOT_FOUND', `${resource} not found`, context),

    internalError: (message = 'An unexpected error occurred', context?: Record<string, any>) =>
        createErrorResponse('INTERNAL_ERROR', message, context),

    geminiError: (message: string, context?: Record<string, any>) =>
        createErrorResponse('GEMINI_ERROR', message, context),

    rateLimited: (message = 'Rate limited. Please retry shortly.', context?: Record<string, any>) =>
        createErrorResponse('RATE_LIMITED', message, context),
};
