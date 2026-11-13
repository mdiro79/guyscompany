// Which relay (TURN) source is configured: Cloudflare Realtime TURN, a fixed server, or none.
export function turnConfigured(): 'cloudflare' | 'static' | null {
  if (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) return 'cloudflare';
  if (process.env.TURN_URLS ?? process.env.NEXT_PUBLIC_TURN_URLS) return 'static';
  return null;
}
