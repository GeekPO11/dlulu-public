import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { logger } from './lib/logger';
import AppErrorBoundary from './components/AppErrorBoundary';

const shouldIgnoreRuntimeNoise = (message?: string) => {
    if (!message) return false;
    return (
        /A custom element with name 'mce-autosize-textarea' has already been defined/i.test(message) ||
        /Download the React DevTools for a better development experience/i.test(message)
    );
};

// Global error handling for Middleware logging
if (typeof window !== 'undefined') {
    const initializeMiddlewareRum = () => {
        const rumEnabled = import.meta.env.VITE_MW_ENABLE_RUM
            ? import.meta.env.VITE_MW_ENABLE_RUM === 'true'
            : !import.meta.env.DEV;
        const accountKey = import.meta.env.VITE_MW_ACCOUNT_KEY;
        const apiKey = import.meta.env.VITE_MW_API_KEY;
        const target = import.meta.env.VITE_MW_TARGET;
        const serviceName = import.meta.env.VITE_MW_SERVICE_NAME || 'dlulu-web';
        const projectName = import.meta.env.VITE_MW_PROJECT_NAME || 'dlulu';
        const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';

        if (!rumEnabled) {
            logger.info('[Middleware] RUM disabled by config', {
                env: import.meta.env.MODE,
                hint: 'Set VITE_MW_ENABLE_RUM=true to enable browser RUM.',
            });
            return;
        }

        if (!accountKey || !apiKey || !target) {
            logger.warn('[Middleware] RUM disabled: missing required env', {
                hasAccountKey: !!accountKey,
                hasApiKey: !!apiKey,
                hasTarget: !!target,
            });
            return;
        }

        let attempts = 0;
        const maxAttempts = 20;
        const retryMs = 250;

        const tryInit = () => {
            attempts += 1;
            if (window.Middleware && typeof window.Middleware.track === 'function') {
                window.Middleware.track({
                    accountKey,
                    apiKey,
                    target,
                    serviceName,
                    projectName,
                    environment: import.meta.env.MODE,
                    customAttributes: {
                        appVersion,
                    },
                });
                logger.info('[Middleware] RUM initialized', {
                    serviceName,
                    projectName,
                    target,
                });
                logger.flush();
                return;
            }

            if (attempts < maxAttempts) {
                window.setTimeout(tryInit, retryMs);
                return;
            }

            logger.warn('[Middleware] RUM SDK not available after retries', {
                attempts,
                scriptExpected: 'https://cdnjs.middleware.io/browser/libs/0.0.2/middleware-rum.min.js',
            });
        };

        tryInit();
    };

    initializeMiddlewareRum();

    logger.setContext({
        env: import.meta.env.MODE,
        appVersion: import.meta.env.VITE_APP_VERSION || 'dev',
    });

    const mwHttpTarget = import.meta.env.VITE_MW_TARGET;
    const mwHttpApiKey = import.meta.env.VITE_MW_API_KEY;
    const mwHttpFlag = import.meta.env.VITE_MW_BROWSER_OTLP;
    const mwHttpEnabled = mwHttpFlag === 'true'
        || (mwHttpFlag !== 'false' && !!mwHttpTarget && !!mwHttpApiKey);
    if (mwHttpEnabled) {
        logger.info('[Middleware] Browser HTTP log shipping enabled', {
            target: mwHttpTarget,
            explicitFlag: mwHttpFlag ?? 'auto',
        });
    } else {
        logger.info('[Middleware] Browser HTTP log shipping disabled', {
            reason: !mwHttpTarget || !mwHttpApiKey ? 'missing_target_or_api_key' : 'flag_disabled',
            explicitFlag: mwHttpFlag ?? 'unset',
        });
    }

    const captureConsole = import.meta.env.VITE_LOG_CAPTURE_CONSOLE
        ? import.meta.env.VITE_LOG_CAPTURE_CONSOLE === 'true'
        : import.meta.env.DEV;
    if (captureConsole) {
        logger.enableConsoleCapture();
    }

    window.addEventListener('error', (event) => {
        if (shouldIgnoreRuntimeNoise(event.message)) {
            event.preventDefault();
            return;
        }
        const error = event.error ?? new Error(String(event.message || 'Unknown error'));
        logger.error('Unhandled error', error, {
            source: event.filename,
            line: event.lineno,
            column: event.colno,
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reasonText = event.reason instanceof Error
            ? event.reason.message
            : String(event.reason || '');
        if (shouldIgnoreRuntimeNoise(reasonText)) {
            return;
        }
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unhandled rejection'));
        logger.error('Unhandled promise rejection', error);
    });

    window.addEventListener('load', () => {
        logger.flush();
    });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <AppErrorBoundary>
            <App />
        </AppErrorBoundary>
    </React.StrictMode>
);
