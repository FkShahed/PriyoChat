// Tiny in-memory flag: set when the user pressed "Answer" on the native incoming-call notification.
// IncomingCallScreen reads it (instead of a navigation param) so it still works even if the screen
// is opened by another code path first (e.g. the socket's incoming_call event).
// The flag expires after 20s so it can never auto-accept an unrelated, later call.
const FLAG_TTL_MS = 20000;
let pendingAutoAcceptAt = null;

export function setPendingAutoAccept() {
  pendingAutoAcceptAt = Date.now();
}

export function hasPendingAutoAccept() {
  if (pendingAutoAcceptAt === null) return false;
  if (Date.now() - pendingAutoAcceptAt > FLAG_TTL_MS) {
    pendingAutoAcceptAt = null;
    return false;
  }
  return true;
}

export function consumePendingAutoAccept() {
  const had = hasPendingAutoAccept();
  pendingAutoAcceptAt = null;
  return had;
}
