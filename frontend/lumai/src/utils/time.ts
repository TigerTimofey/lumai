/**
 * Convert seconds to MM:SS string. Minutes are not zero-padded; seconds are zero-padded.
 * Accepts number or numeric string. Negative or invalid values return "0:00".
 */
export function formatSecondsMMSS(totalSeconds: number | string): string {
  const n = typeof totalSeconds === 'string' ? parseInt(totalSeconds, 10) : totalSeconds;
  if (!Number.isFinite(n)) return '0:00';
  const secs = Math.max(0, Math.floor(n));
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Given expiresIn seconds (number or numeric string), return a human string with local time:
 * - If expiry is today: "DD/MM Today at HH:MM"
 * - Else: "DD/MM/YY - HH:MM"
 */
export function formatExpiryAt(expiresIn: number | string, now: Date = new Date()): string {
  const n = typeof expiresIn === 'string' ? parseInt(expiresIn, 10) : expiresIn;
  if (!Number.isFinite(n)) return '';
  const expiry = new Date(now.getTime() + Math.max(0, Math.floor(n)) * 1000);

  const dd = String(expiry.getDate()).padStart(2, '0');
  const mm = String(expiry.getMonth() + 1).padStart(2, '0');
  const yy = String(expiry.getFullYear()).slice(-2);
  const HH = String(expiry.getHours()).padStart(2, '0');
  const MM = String(expiry.getMinutes()).padStart(2, '0');

  const sameDay =
    expiry.getFullYear() === now.getFullYear() &&
    expiry.getMonth() === now.getMonth() &&
    expiry.getDate() === now.getDate();

  if (sameDay) {
    return `${dd}/${mm} Today at ${HH}:${MM}`;
  }
  return `${dd}/${mm}/${yy} - ${HH}:${MM}`;
}

/**
 * Turn expiresIn seconds into a human phrase:
 *  - "today at HH:MM" if expires today
 *  - "tomorrow at HH:MM" if expires tomorrow
 *  - "DD/MM/YY at HH:MM" otherwise
 */
export function formatExpiryPhrase(expiresIn: number | string, now: Date = new Date()): string {
  const n = typeof expiresIn === 'string' ? parseInt(expiresIn, 10) : expiresIn;
  if (!Number.isFinite(n)) return '';
  const expiry = new Date(now.getTime() + Math.max(0, Math.floor(n)) * 1000);

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowStart = startOfDay(now).getTime();
  const expiryStart = startOfDay(expiry).getTime();

  const dd = String(expiry.getDate()).padStart(2, '0');
  const mm = String(expiry.getMonth() + 1).padStart(2, '0');
  const yy = String(expiry.getFullYear()).slice(-2);
  const HH = String(expiry.getHours()).padStart(2, '0');
  const MM = String(expiry.getMinutes()).padStart(2, '0');

  const dayDiff = Math.round((expiryStart - nowStart) / (24 * 60 * 60 * 1000));
  if (dayDiff === 0) return `today at ${HH}:${MM}`;
  if (dayDiff === 1) return `tomorrow at ${HH}:${MM}`;
  return `${dd}/${mm}/${yy} at ${HH}:${MM}`;
}
