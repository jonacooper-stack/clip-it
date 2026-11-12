// Where the journal is kept on the device: one journal per account.
//
// The journal used to be a single device-wide blob, so a second person
// signing in on the same phone saw (and scored) the first person's sightings.
// Now only the signed-in account's journal is ever loaded:
//
//   accounts off (local-only mode)   "clipit-journal", as before
//   the phone's main account         "clipit-journal" too (see below)
//   any other account                "clipit-journal:<account id>"
//   signed out                       nothing is loaded and nothing is saved
//
// The main account is the one named in "clipit-journal-owner". It keeps using
// the old key in place rather than a copy, so an older version of the app
// (after a rollback, or a browser tab that hasn't reloaded) and this one read
// and write the same journal and nothing is stranded in either direction.
//
// Who becomes the main account: whoever is signed in when this version first
// starts (the person who has been using the phone). Someone who signs in
// afresh on a phone that already holds an unclaimed journal is asked whether
// those sightings are theirs (see `unclaimed` and `claim`).
//
// Nothing here deletes a journal except `purge`, which is only called when
// the player deletes their account or resets the app.
//
// No React Native imports: the storage is passed in, so the switching logic
// can be tested (tests/journalStorage.test.ts).

export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const DEVICE_KEY = 'clipit-journal';
export const OWNER_KEY = 'clipit-journal-owner'; // the account whose journal lives under DEVICE_KEY
const DECLINED_KEY = 'clipit-journal-declined'; // accounts that said the device journal isn't theirs
const STARTED_KEY = 'clipit-journal-started'; // set once this version has started on the device
export const accountKey = (uid: string) => `${DEVICE_KEY}:${uid}`;
export const LOCAL_OWNER = 'local'; // the owner stamp in local-only mode

export interface OpenHooks {
  /** Empty the in-memory journal (the previous account's must not stay on screen). */
  clear(): void;
  /** Put the loaded journal in memory; `state` is null when the account has none yet. */
  fill(state: Record<string, unknown> | null): void;
}

export interface OpenResult {
  /** False when a later switch overtook this one (nothing was loaded by this call). */
  loaded: boolean;
  /** Sightings in a device journal nobody has claimed, which this account could be asked about. */
  unclaimed: number;
}

type Blob = { state: Record<string, unknown>; version?: number };

function parse(raw: string | null): Blob | null {
  if (raw == null) return null;
  const p = JSON.parse(raw);
  return p && typeof p === 'object' && p.state && typeof p.state === 'object' ? (p as Blob) : null;
}
const count = (b: Blob | null) => (Array.isArray(b?.state.sightings) ? (b!.state.sightings as unknown[]).length : 0);
const stamp = (b: Blob | null) => (typeof b?.state.owner === 'string' ? (b!.state.owner as string) : null);

// `onSave`: told after every attempt to save the journal whether it worked
// (the device's storage can be full), so the app can say so instead of
// carrying on as if the journal were safe.
export function createJournalStorage(kv: KeyValue, accountsEnabled: boolean, onSave: (ok: boolean) => void = () => {}) {
  let activeKey: string | null = null; // where changes are saved right now
  let paused = true; // true while a journal is being switched: nothing is written
  let turn = 0;
  let writes: Promise<void> = Promise.resolve(); // saves, one after another

  // What the store's persistence layer calls. It never loads through here
  // (open() does that): reading at the wrong moment could show one account
  // another's journal.
  const adapter = {
    getItem: async (_name: string): Promise<string | null> => null,
    setItem: (_name: string, value: string): Promise<void> => {
      const key = activeKey; // decided now, not after an await
      if (paused || !key) return Promise.resolve();
      writes = writes
        .then(() => kv.setItem(key, value))
        .then(
          () => onSave(true),
          () => onSave(false),
        );
      return writes;
    },
    removeItem: async (_name: string): Promise<void> => {},
  };

  async function read(key: string): Promise<{ raw: string | null; ok: boolean }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { raw: await kv.getItem(key), ok: true };
      } catch {
        // try once more, then give up without touching what's stored
      }
    }
    return { raw: null, ok: false };
  }

  async function declined(): Promise<string[]> {
    try {
      const v = JSON.parse((await kv.getItem(DECLINED_KEY)) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  // Which key holds `uid`'s journal, settling who owns the device-wide one
  // when that hasn't been decided yet. Throws if storage can't be read.
  async function resolve(uid: string, mayClaim: boolean): Promise<{ key: string; unclaimed: number }> {
    const owner = await kv.getItem(OWNER_KEY);
    if (owner === uid) return { key: DEVICE_KEY, unclaimed: 0 };
    if (owner) return { key: accountKey(uid), unclaimed: 0 };

    // Nobody owns the device journal yet.
    let device: Blob | null = null;
    try {
      device = parse(await kv.getItem(DEVICE_KEY));
    } catch {
      device = null; // unreadable contents: leave them alone, give this account its own key
      return { key: accountKey(uid), unclaimed: 0 };
    }
    const stamped = stamp(device);
    if (stamped && stamped !== LOCAL_OWNER) {
      // The journal says whose it is (the owner record was lost): put the record back.
      await kv.setItem(OWNER_KEY, stamped);
      return { key: stamped === uid ? DEVICE_KEY : accountKey(uid), unclaimed: 0 };
    }
    const waiting = count(device);
    // "Already using the phone" can only be said once: the very first time
    // this version runs. After that, sightings nobody has claimed are only
    // ever handed over by asking.
    const firstStart = !(await kv.getItem(STARTED_KEY));
    if (waiting === 0 || (mayClaim && firstStart)) {
      // An empty device journal is free for the first account that comes
      // along; one with sightings goes to the person who was already using
      // the phone when this version first started.
      await kv.setItem(OWNER_KEY, uid);
      return { key: DEVICE_KEY, unclaimed: 0 };
    }
    // A fresh sign-in on a phone holding someone's sightings: don't assume.
    const asked = (await declined()).includes(uid);
    return { key: accountKey(uid), unclaimed: asked ? 0 : waiting };
  }

  // Switch to `uid`'s journal (null: signed out). `mayClaim`: this account
  // was already signed in when the app started, so an unclaimed device
  // journal is taken to be theirs.
  async function open(uid: string | null, hooks: OpenHooks, opts: { mayClaim?: boolean } = {}): Promise<OpenResult> {
    const mine = ++turn;
    paused = true;
    activeKey = null;
    hooks.clear();
    const overtaken: OpenResult = { loaded: false, unclaimed: 0 };

    let key: string | null = null;
    let unclaimed = 0;
    let state: Record<string, unknown> | null = null;
    let writable = true;
    if (!accountsEnabled) key = DEVICE_KEY;
    else if (uid) {
      try {
        ({ key, unclaimed } = await resolve(uid, opts.mayClaim === true));
      } catch {
        writable = false; // storage can't be read: carry on in memory, save nothing
      }
      if (mine !== turn) return overtaken;
    }
    if (accountsEnabled && writable) {
      try {
        if (!(await kv.getItem(STARTED_KEY))) await kv.setItem(STARTED_KEY, '1');
      } catch {
        // not fatal: it only decides whether a later sign-in is asked or assumed
      }
      if (mine !== turn) return overtaken;
    }

    if (key && writable) {
      const { raw, ok } = await read(key);
      if (mine !== turn) return overtaken;
      if (!ok) {
        // The stored journal couldn't be read. Carry on with an empty one in
        // memory, but don't save over what is there.
        writable = false;
      } else if (raw != null) {
        let blob: Blob | null = null;
        let readable = true;
        try {
          blob = parse(raw);
        } catch {
          readable = false;
        }
        // In account mode a journal stamped with another account's id is not
        // this account's. (One stamped "local" under the device key is: it
        // was started before accounts were switched on, and has been claimed.)
        const owner = stamp(blob);
        const someoneElses = accountsEnabled && owner != null && owner !== uid && !(owner === LOCAL_OWNER && key === DEVICE_KEY);
        if (!readable || someoneElses) {
          // Unreadable, or stamped as somebody else's: set it aside rather
          // than load it or lose it, and start afresh.
          try {
            await kv.setItem(`${key}:set-aside`, raw);
          } catch {
            writable = false;
          }
          if (mine !== turn) return overtaken;
        } else {
          state = blob?.state ?? null;
        }
      }
    }

    hooks.fill(state);
    activeKey = key && writable ? key : null;
    paused = false;
    return { loaded: true, unclaimed };
  }

  // The player said the unclaimed sightings on this phone are theirs: make
  // this account the device journal's owner. Anything the account has already
  // logged under its own key is folded in. Re-open the journal afterwards.
  async function claim(uid: string): Promise<boolean> {
    if (!accountsEnabled || (await kv.getItem(OWNER_KEY))) return false;
    await writes;
    const device = parse(await kv.getItem(DEVICE_KEY));
    if (!device) return false;
    const own = parse(await kv.getItem(accountKey(uid)));
    if (own) {
      const seen = new Set<unknown>();
      const all = [...((own.state.sightings as any[]) ?? []), ...((device.state.sightings as any[]) ?? [])].filter((s) => s && !seen.has(s.id) && seen.add(s.id));
      const merged: Blob = { ...device, state: { ...own.state, ...device.state, sightings: all, owner: uid } };
      await kv.setItem(DEVICE_KEY, JSON.stringify(merged));
    }
    await kv.setItem(OWNER_KEY, uid);
    if (own) await kv.removeItem(accountKey(uid));
    return true;
  }

  // The player said they aren't: don't ask this account again.
  async function decline(uid: string): Promise<void> {
    const list = await declined();
    if (!list.includes(uid)) await kv.setItem(DECLINED_KEY, JSON.stringify([...list, uid].slice(-50)));
  }

  // Erase an account's journal from the device (account deletion, "reset app
  // data"). Works from what is stored, not from what is in memory, so it can
  // be called at any point. Returns the photo refs the journal listed, for
  // the caller to delete the files.
  async function purge(uid: string | null): Promise<string[]> {
    const photos: string[] = [];
    try {
      const owner = accountsEnabled ? await kv.getItem(OWNER_KEY) : null;
      const key = !accountsEnabled ? DEVICE_KEY : uid ? (owner === uid ? DEVICE_KEY : accountKey(uid)) : null;
      if (!key) return photos;
      if (activeKey === key) {
        paused = true; // a save already on its way must not bring the journal back
        activeKey = null;
      }
      await writes;
      try {
        for (const s of (parse(await kv.getItem(key))?.state.sightings as any[]) ?? []) {
          if (s && typeof s.photoUri === 'string') photos.push(s.photoUri);
        }
      } catch {
        // unreadable: nothing to list
      }
      await kv.removeItem(key);
      await kv.removeItem(`${key}:set-aside`);
      if (key === DEVICE_KEY && owner === uid) await kv.removeItem(OWNER_KEY); // the device key is free again
    } catch {
      // best effort
    }
    return photos;
  }

  return { adapter, open, claim, decline, purge, isWritable: () => !paused && activeKey != null, idle: () => writes };
}
