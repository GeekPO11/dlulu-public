const DEFAULT_ALLOWED_ORIGINS = [
  'https://dlulu.life',
  'https://www.dlulu.life',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const parseOrigins = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const configuredOrigins = [
  ...parseOrigins(Deno.env.get('ALLOWED_ORIGIN')),
  ...parseOrigins(Deno.env.get('PUBLIC_SITE_URL')),
  ...parseOrigins(Deno.env.get('SITE_URL')),
];

const allowedOrigins = Array.from(new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...configuredOrigins,
]));

const resolvesToWildcard = allowedOrigins.includes('*');

const canonicalizeLocalhost = (origin: string): string =>
  origin.replace('127.0.0.1', 'localhost');

const resolveAllowOrigin = (requestOrigin?: string | null): string => {
  if (resolvesToWildcard) return '*';

  const normalizedRequestOrigin = requestOrigin?.trim();
  if (normalizedRequestOrigin) {
    if (allowedOrigins.includes(normalizedRequestOrigin)) {
      return normalizedRequestOrigin;
    }

    const canonicalRequestOrigin = canonicalizeLocalhost(normalizedRequestOrigin);
    const hasCanonicalMatch = allowedOrigins.some(
      (allowedOrigin) => canonicalizeLocalhost(allowedOrigin) === canonicalRequestOrigin
    );
    if (hasCanonicalMatch) {
      // Echo the exact incoming origin when localhost/127.0.0.1 aliases match.
      return normalizedRequestOrigin;
    }
  }

  // When request origin is unavailable (for example module-scope OPTIONS headers),
  // prefer wildcard to avoid localhost/127.0.0.1 mismatch on preflight.
  return normalizedRequestOrigin ? (allowedOrigins[0] || '*') : '*';
};

export const getCorsHeaders = (requestOrigin?: string | null) => ({
  'Access-Control-Allow-Origin': resolveAllowOrigin(requestOrigin),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-client-env, x-client-version, x-b3-spanid, x-b3-traceid, x-b3-parentspanid, x-b3-sampled, b3, traceparent, tracestate',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id',
  'Vary': 'Origin',
});

export const corsHeaders = getCorsHeaders();
