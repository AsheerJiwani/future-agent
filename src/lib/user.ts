"use client";

// Generate or retrieve a stable per-browser user ID for personalization.
// If you later add real auth, replace this with the auth user ID.
export function getOrCreateUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = 'qb_user_id';
    let id: string | null = localStorage.getItem(key);
    if (!id) {
      // Prefer crypto UUID if available
      const hasUUID = typeof window.crypto !== 'undefined' && 'randomUUID' in window.crypto;
      const u: string = hasUUID
        ? (window.crypto as unknown as { randomUUID: () => string }).randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      id = u;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return null;
  }
}
