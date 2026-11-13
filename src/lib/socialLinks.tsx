import { FIELD_LIMITS } from '../types/attendance';

export function normalizeWhatsAppInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, FIELD_LIMITS.whatsappMax);
  return digits;
}

export function buildWhatsAppHref(raw: string): string | null {
  const digits = normalizeWhatsAppInput(raw);
  if (digits.length < 6) return null;
  const intl = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

export function formatWhatsAppDisplay(raw: string): string {
  const digits = normalizeWhatsAppInput(raw);
  if (!digits) return '';
  return digits.startsWith('62') ? `+${digits}` : digits;
}

export function normalizeInstagramInput(raw: string): string {
  let cleaned = raw.trim();
  if (!cleaned) return '';

  // Support pasting full profile URL like https://www.instagram.com/username/?igsh=...
  const urlMatch = cleaned.match(/instagram\.com\/([^/?#\s]+)/i);
  if (urlMatch?.[1]) {
    cleaned = urlMatch[1];
  }

  cleaned = cleaned.replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '');
  return cleaned.slice(0, FIELD_LIMITS.instagramMax);
}

export function buildInstagramHref(raw: string): string | null {
  const handle = normalizeInstagramInput(raw);
  if (!handle) return null;
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}

export function formatInstagramDisplay(raw: string): string {
  const handle = normalizeInstagramInput(raw);
  return handle ? `@${handle}` : '';
}

export function WhatsAppLogoIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.51 2 2.02 6.48 2.02 12c0 1.77.46 3.49 1.34 5.01L2 22l5.12-1.34A9.96 9.96 0 0 0 12.04 22c5.52 0 10.01-4.48 10.01-10S17.56 2 12.04 2zm5.84 14.12c-.24.68-1.42 1.3-1.97 1.38-.51.08-1.15.11-1.86-.12-.43-.14-.99-.32-1.7-.63-2.99-1.29-4.94-4.32-5.09-4.52-.15-.2-1.21-1.61-1.21-3.07 0-1.46.77-2.18 1.04-2.48.27-.3.6-.37.8-.37.2 0 .4 0 .58.01.19.01.44-.07.69.53.24.6.84 2.05.91 2.2.08.15.13.33.03.53-.1.2-.15.33-.3.5-.15.18-.32.4-.45.53-.15.15-.31.31-.13.61.18.3.78 1.29 1.68 2.09 1.16 1.03 2.13 1.35 2.43 1.5.3.15.48.13.66-.08.18-.2.76-.88.96-1.18.2-.3.4-.25.68-.15.28.1 1.75.83 2.05.98.3.15.5.23.58.35.07.12.07.72-.17 1.4z" />
    </svg>
  );
}

export function InstagramLogoIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5zm9.25 1.95a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.8A3.2 3.2 0 1 0 12 15.2 3.2 3.2 0 0 0 12 8.8z" />
    </svg>
  );
}
