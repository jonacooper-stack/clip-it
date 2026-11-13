// The blocked-language check lives in the app/server code and in the database.
// These tests fail when the two word lists have drifted apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { moderationSql, moderationTestSql, SQL_END, SQL_START } from '../scripts/gen-moderation-sql';

const MIGRATIONS = join(__dirname, '..', 'supabase', 'migrations');

test('the newest migration that defines the database filter matches shared/moderation.ts', () => {
  const withFilter = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort().filter((f) => readFileSync(join(MIGRATIONS, f), 'utf8').includes(SQL_START));
  assert.ok(withFilter.length > 0, 'no migration defines the filter');
  const sql = readFileSync(join(MIGRATIONS, withFilter[withFilter.length - 1]), 'utf8');
  const block = sql.slice(sql.indexOf(SQL_START), sql.indexOf(SQL_END) + SQL_END.length);
  assert.equal(
    block,
    moderationSql(),
    'shared/moderation.ts changed: add a new migration containing the output of `npx tsx scripts/gen-moderation-sql.ts`',
  );
});

test('the database test samples are up to date (run: npx tsx scripts/gen-moderation-sql.ts --write)', () => {
  assert.equal(readFileSync(join(__dirname, '..', 'supabase', 'tests', 'moderation.test.sql'), 'utf8'), moderationTestSql());
});
