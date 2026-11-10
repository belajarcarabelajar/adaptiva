// User-facing messages for the `auth_error` codes that functions/api/auth/
// (login.ts, callback.ts) put in the redirect URL. authErrors.test.ts fails
// when one of those Functions emits a code that has no entry here.

export const GENERIC_AUTH_ERROR = "Sign-in failed. Please try again.";

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Google Sign-in is not configured on this deployment.",
  // Google's own `error` value, passed through by the callback.
  access_denied: "Sign-in request was cancelled or denied.",
  missing_code_or_state: GENERIC_AUTH_ERROR,
  invalid_or_expired_state: "Sign-in session expired. Please try again.",
  token_exchange_failed: "Could not complete sign-in with Google. Please try again.",
  user_info_failed: "Could not read your Google profile. Please try again.",
  email_not_verified: "Your Google email is not verified.",
  domain_not_allowed: "Email domain is not allowed for sign-in.",
  unexpected_callback_error: GENERIC_AUTH_ERROR,
};

export function friendlyAuthError(code: string): string {
  return Object.hasOwn(AUTH_ERROR_MESSAGES, code) ? AUTH_ERROR_MESSAGES[code] : GENERIC_AUTH_ERROR;
}
