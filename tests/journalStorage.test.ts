// One journal per account on the device (src/state/journalStorage.ts). These
// tests walk through sign-ins, sign-outs and failures and check that a journal
// is never lost, never overwritten with an empty one, and never shown to
// another account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountKey, createJournalStorage, DEVICE_KEY, OWNER_KEY, type KeyValue } from '../src/state/journalStorage';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const blob = (ids: string[], extra: Record<string, unknown> = {}) => JSON.stringify({ state: { sightings: ids.map((id) => ({ id, photoUri: `photos/${id}.jpg` })), ...extra }, version: 0 });
const ids = (raw: string | undefined | null) => (raw ? JSON.parse(raw).state.sightings.map((s: any) => s.id) : null);

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const control = { failReads: 0, delayMs: 0, writes: [] as string[] };
  const wait = () => (control.delayMs ? new Promise((r) => setTimeout(r, control.delayMs)) : Promise.resolve());
  const kv: KeyValue = {
    async getItem(k) {
      await wait();
      if (control.failReads > 0) {
        control.failReads--;
        throw new Error('storage unavailable');
      }
      return data.has(k) ? data.get(k)! : null;
    },
    async setItem(k, v) {
      await wait();
      control.writes.push(k);
      data.set(k, v);
    },
    async removeItem(k) {
      await wait();
      data.delete(k);
    },
  };
  return { kv, data, control };
}

// A stand-in for the journal store: what is "on screen", and saving through
// the adapter on every change as the real store does (stamping whose it is).
function screen(storage: ReturnType<typeof createJournalStorage>) {
  let shown: string[] | null = null; // null = nothing loaded yet
  let owner: string | null = null;
  const save = () => storage.adapter.setItem('x', blob(shown ?? [], owner ? { owner } : {}));
  return {
    hooksFor: (uid: string | null) => ({
      clear: () => { shown = []; owner = null; void save(); }, // a save fires here too, as in the real store: it must go nowhere
      fill: (state: Record<string, unknown> | null) => { shown = ((state?.sightings as any[]) ?? []).map((s) => s.id); owner = uid; },
    }),
    get shown() { return shown; },
    async add(id: string) { shown = [id, ...(shown ?? [])]; await save(); },
  };
}

test('each account sees only its own journal, and signing out shows nothing', async () => {
  const { kv, data } = memory({ [DEVICE_KEY]: blob(['a1', 'a2']), [OWNER_KEY]: A, [accountKey(B)]: blob(['b1']) });
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  await storage.open(A, ui.hooksFor(A));
  assert.deepEqual(ui.shown, ['a1', 'a2']);
  await storage.open(null, ui.hooksFor(null));
  assert.deepEqual(ui.shown, []);
  await ui.add('typed-while-signed-out'); // must go nowhere
  await storage.open(B, ui.hooksFor(B));
  assert.deepEqual(ui.shown, ['b1']);
  await ui.add('b2');
  await storage.open(A, ui.hooksFor(A));
  assert.deepEqual(ui.shown, ['a1', 'a2']);
  assert.deepEqual(ids(data.get(DEVICE_KEY)), ['a1', 'a2']); // untouched by B's session
  assert.deepEqual(ids(data.get(accountKey(B))), ['b2', 'b1']);
  assert.equal([...data.values()].some((v) => v.includes('typed-while-signed-out')), false);
});

test('switching accounts never writes an empty journal over a stored one', async () => {
  const { kv, data, control } = memory({ [DEVICE_KEY]: blob(['a1']), [OWNER_KEY]: A, [accountKey(B)]: blob(['b1']) });
  control.delayMs = 5;
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  await storage.open(A, ui.hooksFor(A));
  await storage.open(B, ui.hooksFor(B)); // clear() fires a save while switching
  await storage.open(A, ui.hooksFor(A));
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(ids(data.get(DEVICE_KEY)), ['a1']);
  assert.deepEqual(ids(data.get(accountKey(B))), ['b1']);
  assert.deepEqual(control.writes.filter((k) => k !== 'clipit-journal-started'), []); // no journal was written at all
});

test('the person already using the phone keeps the old journal, in place: an older app version still sees the same one', async () => {
  const { kv, data } = memory({ [DEVICE_KEY]: blob(['old1', 'old2']) });
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  const res = await storage.open(A, ui.hooksFor(A), { mayClaim: true }); // signed in when this version first started
  assert.deepEqual([res.loaded, res.unclaimed], [true, 0]);
  assert.deepEqual(ui.shown, ['old1', 'old2']);
  assert.equal(data.get(OWNER_KEY), A);
  await ui.add('new1');
  assert.deepEqual(ids(data.get(DEVICE_KEY)), ['new1', 'old1', 'old2']); // the key the old version reads and writes
  assert.equal(data.has(accountKey(A)), false);
  // someone else signs in on this phone: they do not get that journal
  const other = await storage.open(B, ui.hooksFor(B));
  assert.deepEqual([ui.shown, other.unclaimed], [[], 0]);
  await ui.add('b1');
  await storage.open(A, ui.hooksFor(A));
  assert.deepEqual(ui.shown, ['new1', 'old1', 'old2']);
});

test('a fresh sign-in on a phone that holds unclaimed sightings is asked, not assumed', async () => {
  const { kv, data } = memory({ [DEVICE_KEY]: blob(['old1', 'old2', 'old3']) });
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  const res = await storage.open(B, ui.hooksFor(B)); // not signed in at startup
  assert.deepEqual([ui.shown, res.unclaimed], [[], 3]);
  assert.equal(data.has(OWNER_KEY), false);
  await ui.add('b1'); // logged before answering
  // "They're not mine": never asked again, and the journal stays for whoever it belongs to
  await storage.decline(B);
  assert.equal((await storage.open(B, ui.hooksFor(B))).unclaimed, 0);
  assert.deepEqual(ui.shown, ['b1']);
  // A signs in and says yes
  const asked = await storage.open(A, ui.hooksFor(A));
  assert.equal(asked.unclaimed, 3);
  await ui.add('a-new');
  assert.equal(await storage.claim(A), true);
  await storage.open(A, ui.hooksFor(A));
  assert.deepEqual(ui.shown, ['a-new', 'old1', 'old2', 'old3']); // what A logged meanwhile is folded in
  assert.equal(data.has(accountKey(A)), false);
  assert.equal(await storage.claim(B), false); // already taken
  await storage.open(B, ui.hooksFor(B));
  assert.deepEqual(ui.shown, ['b1']);
});

test('"already using the phone" only counts the first time this version starts; later, unclaimed sightings are always asked about', async () => {
  const { kv, data } = memory({ [DEVICE_KEY]: blob(['old1']) });
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  await storage.open(null, ui.hooksFor(null), { mayClaim: true }); // first start of this version: nobody signed in
  // B signs in, is asked, and the app is closed before they answer. Next launch B's session is restored:
  const next = await storage.open(B, ui.hooksFor(B), { mayClaim: true });
  assert.deepEqual([ui.shown, next.unclaimed], [[], 1]); // asked again, not assumed
  assert.equal(data.has(OWNER_KEY), false);
});

test('an empty phone: the first account simply becomes its main account', async () => {
  const { kv, data } = memory({});
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  const res = await storage.open(A, ui.hooksFor(A));
  assert.deepEqual([ui.shown, res.unclaimed], [[], 0]);
  assert.equal(data.get(OWNER_KEY), A);
  await ui.add('a1');
  assert.deepEqual(ids(data.get(DEVICE_KEY)), ['a1']);
});

test('if the owner record is lost, the journal\'s own stamp puts it back (nobody else can take it)', async () => {
  const { kv, data } = memory({ [DEVICE_KEY]: blob(['a1'], { owner: A }) });
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  const res = await storage.open(B, ui.hooksFor(B), { mayClaim: true });
  assert.deepEqual([ui.shown, res.unclaimed], [[], 0]);
  assert.equal(data.get(OWNER_KEY), A);
  await storage.open(A, ui.hooksFor(A));
  assert.deepEqual(ui.shown, ['a1']);
});

test('a journal stamped as another account\'s is never loaded into this one', async () => {
  const { kv, data } = memory({ [accountKey(B)]: blob(['a-secret'], { owner: A }), [OWNER_KEY]: 'someone-else' });
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  await storage.open(B, ui.hooksFor(B));
  assert.deepEqual(ui.shown, []);
  assert.ok(data.get(`${accountKey(B)}:set-aside`)!.includes('a-secret')); // kept, not shown
});

test('if the stored journal cannot be read, nothing is saved over it', async () => {
  const { kv, data, control } = memory({ [DEVICE_KEY]: blob(['a1', 'a2', 'a3']), [OWNER_KEY]: A });
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  control.failReads = 5; // storage is down
  assert.equal((await storage.open(A, ui.hooksFor(A))).loaded, true);
  assert.deepEqual(ui.shown, []); // the app carries on, empty
  assert.equal(storage.isWritable(), false);
  await ui.add('x1');
  assert.deepEqual(ids(data.get(DEVICE_KEY)), ['a1', 'a2', 'a3']); // intact
  control.failReads = 0; // next launch, storage works again
  await storage.open(A, ui.hooksFor(A));
  assert.deepEqual(ui.shown, ['a1', 'a2', 'a3']);
  assert.equal(storage.isWritable(), true);
});

test('unreadable contents are set aside, not lost', async () => {
  const { kv, data } = memory({ [DEVICE_KEY]: '{"state": {"sightings": [', [OWNER_KEY]: A });
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  await storage.open(A, ui.hooksFor(A));
  assert.deepEqual(ui.shown, []);
  assert.equal(data.get(`${DEVICE_KEY}:set-aside`), '{"state": {"sightings": [');
  await ui.add('fresh');
  assert.deepEqual(ids(data.get(DEVICE_KEY)), ['fresh']);
});

test('a quick sign-out and sign-in ends on the last account asked for', async () => {
  const { kv, control } = memory({ [DEVICE_KEY]: blob(['a1']), [OWNER_KEY]: A, [accountKey(B)]: blob(['b1']) });
  control.delayMs = 10;
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  const results = await Promise.all([storage.open(A, ui.hooksFor(A)), storage.open(null, ui.hooksFor(null)), storage.open(B, ui.hooksFor(B))]);
  // The earlier ones are overtaken while they read; the last one wins.
  assert.deepEqual(results.map((r) => r.loaded), [false, false, true]);
  assert.deepEqual(ui.shown, ['b1']);
});

test('local-only mode keeps using the device-wide journal exactly as before', async () => {
  const { kv, data } = memory({ [DEVICE_KEY]: blob(['l1']) });
  const storage = createJournalStorage(kv, false);
  const ui = screen(storage);
  await storage.open(null, ui.hooksFor(null));
  assert.deepEqual(ui.shown, ['l1']);
  await ui.add('l2');
  assert.deepEqual(ids(data.get(DEVICE_KEY)), ['l2', 'l1']);
  assert.equal(data.size, 1);
});

test('deleting an account erases its journal from the device and lists its photos; other accounts are untouched', async () => {
  const { kv, data } = memory({ [DEVICE_KEY]: blob(['a1', 'a2']), [OWNER_KEY]: A, [accountKey(B)]: blob(['b1']) });
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  await storage.open(A, ui.hooksFor(A));
  await storage.open(null, ui.hooksFor(null)); // works even after the journal has been unloaded
  assert.deepEqual(await storage.purge(A), ['photos/a1.jpg', 'photos/a2.jpg']);
  assert.equal(data.has(DEVICE_KEY), false);
  assert.equal(data.has(OWNER_KEY), false);
  assert.deepEqual(ids(data.get(accountKey(B))), ['b1']);
  assert.deepEqual(await storage.purge(B), ['photos/b1.jpg']);
  assert.equal(data.has(accountKey(B)), false);
});

test('a save already on its way when the journal is erased does not bring it back', async () => {
  const { kv, data, control } = memory({ [DEVICE_KEY]: blob(['a1']), [OWNER_KEY]: A });
  const storage = createJournalStorage(kv, true);
  const ui = screen(storage);
  await storage.open(A, ui.hooksFor(A));
  control.delayMs = 10;
  const saving = ui.add('a2'); // in flight
  const purged = storage.purge(A);
  await Promise.all([saving, purged]);
  await ui.add('late'); // and nothing after
  assert.equal(data.has(DEVICE_KEY), false);
});

test('a save that fails (storage full) is reported, not swallowed; the next one that works clears it', async () => {
  const { kv, data } = memory();
  let full = false;
  const realSet = kv.setItem.bind(kv);
  kv.setItem = async (k, v) => {
    if (full && k === DEVICE_KEY) throw new Error('database or disk is full');
    return realSet(k, v);
  };
  const reports: boolean[] = [];
  const storage = createJournalStorage(kv, true, (ok) => reports.push(ok));
  await storage.open(A, { clear() {}, fill() {} }, { mayClaim: true });
  await storage.adapter.setItem('x', blob(['one'], { owner: A }));
  assert.deepEqual(reports, [true]);
  full = true;
  await storage.adapter.setItem('x', blob(['one', 'two'], { owner: A }));
  assert.deepEqual(reports, [true, false]);
  assert.deepEqual(ids(data.get(DEVICE_KEY)), ['one']); // what was saved before is still there
  full = false;
  await storage.adapter.setItem('x', blob(['one', 'two', 'three'], { owner: A }));
  assert.deepEqual(reports, [true, false, true]);
  assert.deepEqual(ids(data.get(DEVICE_KEY)), ['one', 'two', 'three']); // a later save carries everything
});
