/**
 * Safe redirect path sanitizer preventing open redirect vulnerabilities
 * (including backslash bypasses such as '/\evil.com', '//evil.com', etc.).
 */
export function sanitizeNextPath(
  rawNext?: string | null,
  fallback: string = '/'
): string {
  if (!rawNext || typeof rawNext !== 'string') {
    return fallback;
  }

  const trimmed = rawNext.trim();

  // Must begin with a single '/' and not with '//' or '/\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // Reject backslashes anywhere in the path (browsers convert '\' to '/' in URL resolution)
  if (trimmed.includes('\\')) {
    return fallback;
  }

  // Reject any embedded protocol schemes (e.g., javascript:, data:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  // Validate with WHATWG URL parser against dummy localhost origin
  try {
    const dummyOrigin = 'https://localhost';
    const parsed = new URL(trimmed, dummyOrigin);

    if (parsed.origin !== dummyOrigin) {
      return fallback;
    }

    // Ensure the resolved pathname still strictly starts with '/'
    if (!parsed.pathname.startsWith('/')) {
      return fallback;
    }

    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}
