// One rule, used by the app and the server: a photo or profile-picture link is
// only shown if it points into our own public storage.
//
// Those links are saved by the app that posted them, so a tampered app could
// point one at any server (to log who opens the wall, or to show something
// that never went through our storage). Anything else is treated as "no photo".
export function publicStorageUrl(url: unknown, supabaseUrl: string, bucket: string): string | null {
  const base = supabaseUrl.replace(/\/$/, '');
  if (typeof url !== 'string' || !base.startsWith('http')) return null;
  return url.startsWith(`${base}/storage/v1/object/public/${bucket}/`) ? url : null;
}
