/**
 * Utilities for managing persisted Starknet session state.
 *
 * `@starknet-react/core` v5 persists the last-used connector id in
 * localStorage under the key `lastUsedConnector` and rehydrates from it on
 * mount when `autoConnect` is enabled. That's what we want for
 * "keep-me-signed-in", but it leaves two failure modes:
 *
 *   1. User clicks Disconnect → we call `disconnect()` from the hook, but
 *      the stored key isn't cleared. Next refresh re-auto-connects the same
 *      wallet, so the user can't pick a different one.
 *   2. The wallet extension is offline / user revoked access in the
 *      extension. autoConnect throws `NOT_CONNECTED` and the stale id keeps
 *      trying forever until we clear it.
 *
 * `clearStarknetSession()` removes the key so the next mount starts clean.
 */

const LAST_CONNECTOR_KEY = "lastUsedConnector";

export function clearStarknetSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_CONNECTOR_KEY);
  } catch {
    // localStorage can throw in private browsing / SSR; ignore.
  }
}

/**
 * Detect and wipe a corrupted `lastUsedConnector` value.
 *
 * A prior version of ConnectModal wrote `JSON.stringify({id})` into this
 * key. starknet-react expects a plain connector id string, so the stored
 * JSON blob never matches any real connector and autoConnect silently
 * fails (status stays `disconnected`, never passes through `reconnecting`).
 * The generic `StarknetSessionRecovery` observer won't see a transition to
 * heal, so browsers with the old blob stay stuck across refreshes.
 *
 * Call this synchronously on mount — it's cheap and idempotent.
 *
 * Returns true iff it removed a corrupted value.
 */
export function purgeCorruptStarknetSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(LAST_CONNECTOR_KEY);
    if (raw == null) return false;
    // Legitimate values are short plain-ASCII identifiers like "braavos",
    // "argent-x", "controller", "metamask", etc. Anything containing JSON
    // braces or whitespace is the old corrupted format.
    if (raw.startsWith("{") || raw.startsWith("[") || /\s/.test(raw)) {
      window.localStorage.removeItem(LAST_CONNECTOR_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
