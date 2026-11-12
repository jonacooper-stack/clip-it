// Settings the server code reads when it is first loaded. Imported before
// anything else in journal.flows.ts, so they are in place by then.
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'sb_secret_test';
process.env.SUPABASE_URL ??= 'https://example.supabase.co';
