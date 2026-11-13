// A stand-in for the supabase-js client that talks SQL to a real Postgres, the
// way PostgREST would on behalf of a given caller:
//   - one transaction per request, run as the caller's role (service_role, or
//     authenticated with a `sub` claim), so RLS, grants and triggers apply;
//   - request bodies are turned into rows by Postgres itself
//     (json_populate_recordset), and answers come back as JSON built by
//     Postgres (json_agg), which is what PostgREST does. Type coercion and
//     the shape of what comes back are therefore the database's own.
// Only the parts of the client that the journal code uses are here.
//
// This is not PostgREST: how a client call becomes SQL is written here, by
// hand, for the handful of shapes the journal code uses. What it does make
// real is everything on the database's side: names, types, constraints,
// grants, row-level security, triggers and SQL functions.
import pg from 'pg';

export type Caller = { role: 'service_role' } | { role: 'authenticated'; sub: string };

interface Filter {
  sql: (param: (v: unknown) => string) => string;
}

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`unsupported identifier: ${name}`);
  return `"${name}"`;
};
const columns = (list: string) =>
  list.trim() === '*'
    ? '*'
    : list
        .split(',')
        .map((c) => ident(c.trim()))
        .join(', ');

export function createClient(pool: pg.Pool, caller: Caller, authUsers?: { exists(uid: string): Promise<boolean | 'error'> }) {
  const claims = caller.role === 'service_role' ? { role: 'service_role' } : { role: 'authenticated', sub: caller.sub };
  const log: string[] = [];

  async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<{ data: T | null; error: { message: string; code: string } | null }> {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await c.query(`set local role ${caller.role}`);
      const data = await fn(c);
      await c.query('commit');
      return { data, error: null };
    } catch (err: any) {
      await c.query('rollback').catch(() => {});
      return { data: null, error: { message: String(err?.message ?? err), code: String(err?.code ?? 'XX000') } };
    } finally {
      c.release();
    }
  }

  class Query implements PromiseLike<any> {
    private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    private cols = '*';
    private returning: string | null = null;
    private opts: any = {};
    private filters: Filter[] = [];
    private orders: string[] = [];
    private offset: number | null = null;
    private lim: number | null = null;
    private one = false;
    private body: any;
    constructor(private table: string) {}

    select(cols = '*', opts: any = {}) {
      if (this.op === 'select') {
        this.cols = cols;
        this.opts = opts;
      } else this.returning = cols;
      return this;
    }
    insert(body: any) {
      this.op = 'insert';
      this.body = body;
      return this;
    }
    update(body: any) {
      this.op = 'update';
      this.body = body;
      return this;
    }
    upsert(body: any, opts: any = {}) {
      this.op = 'upsert';
      this.body = body;
      this.opts = opts;
      return this;
    }
    delete() {
      this.op = 'delete';
      return this;
    }
    private cmp(col: string, op: string, v: unknown) {
      this.filters.push({ sql: (p) => `${ident(col)} ${op} ${p(v)}` });
      return this;
    }
    eq(col: string, v: unknown) { return this.cmp(col, '=', v); }
    neq(col: string, v: unknown) { return this.cmp(col, '<>', v); }
    gt(col: string, v: unknown) { return this.cmp(col, '>', v); }
    gte(col: string, v: unknown) { return this.cmp(col, '>=', v); }
    lt(col: string, v: unknown) { return this.cmp(col, '<', v); }
    lte(col: string, v: unknown) { return this.cmp(col, '<=', v); }
    is(col: string, v: null | boolean) {
      this.filters.push({ sql: () => `${ident(col)} is ${v === null ? 'null' : v ? 'true' : 'false'}` });
      return this;
    }
    not(col: string, op: string, v: unknown) {
      if (op === 'is' && v === null) this.filters.push({ sql: () => `${ident(col)} is not null` });
      else if (op === 'eq') this.filters.push({ sql: (p) => `${ident(col)} <> ${p(v)}` });
      else throw new Error(`unsupported not(${op})`);
      return this;
    }
    // "a.eq.1,b.gt.0": any of these (the simple comparisons only).
    or(expr: string) {
      const ops: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      const parts = expr.split(',').map((part) => {
        const [col, op, ...rest] = part.split('.');
        if (!ops[op]) throw new Error(`unsupported or(${part})`);
        return { col, op: ops[op], value: rest.join('.') };
      });
      this.filters.push({ sql: (p) => `(${parts.map((x) => `${ident(x.col)} ${x.op} ${p(x.value)}`).join(' or ')})` });
      return this;
    }
    in(col: string, values: unknown[]) {
      this.filters.push({ sql: (p) => (values.length ? `${ident(col)} in (${values.map((v) => p(v)).join(', ')})` : 'false') });
      return this;
    }
    order(col: string, o: { ascending?: boolean } = {}) {
      this.orders.push(`${ident(col)} ${o.ascending === false ? 'desc' : 'asc'}`);
      return this;
    }
    range(from: number, to: number) {
      this.offset = from;
      this.lim = to - from + 1;
      return this;
    }
    limit(n: number) {
      this.lim = n;
      return this;
    }
    maybeSingle() {
      this.one = true;
      return this;
    }

    then<A, B>(ok?: (v: any) => A | PromiseLike<A>, bad?: (e: any) => B | PromiseLike<B>): PromiseLike<A | B> {
      return this.run().then(ok, bad);
    }

    private async run(): Promise<any> {
      const t = `public.${ident(this.table)}`;
      const params: unknown[] = [];
      const p = (v: unknown) => {
        params.push(v);
        return `$${params.length}`;
      };
      const where = () => (this.filters.length ? ` where ${this.filters.map((f) => f.sql(p)).join(' and ')}` : '');
      const tail = () => `${this.orders.length ? ` order by ${this.orders.join(', ')}` : ''}${this.lim != null ? ` limit ${this.lim}` : ''}${this.offset != null ? ` offset ${this.offset}` : ''}`;
      const asJson = (inner: string) => `select coalesce(json_agg(r), '[]'::json) as rows from (${inner}) r`;
      let sql: string;
      let count: number | null = null;

      const result = await tx(async (c) => {
        if (this.op === 'select') {
          if (this.opts.head) {
            const r = await c.query(`select count(*)::int as n from ${t}${where()}`, params);
            count = r.rows[0].n;
            return null;
          }
          sql = asJson(`select ${columns(this.cols)} from ${t}${where()}${tail()}`);
          const r = await c.query(sql, params);
          return r.rows[0].rows as any[];
        }
        if (this.op === 'insert' || this.op === 'upsert') {
          const rows = Array.isArray(this.body) ? this.body : [this.body];
          const keys = [...new Set(rows.flatMap((r: any) => Object.keys(r)))];
          const colList = keys.map(ident).join(', ');
          let stmt = `insert into ${t} (${colList}) select ${colList} from json_populate_recordset(null::${t}, ${p(JSON.stringify(rows))}::json)`;
          if (this.op === 'upsert') {
            const conflict = String(this.opts.onConflict ?? '').split(',').map((s: string) => ident(s.trim())).join(', ');
            const conflictCols = new Set(String(this.opts.onConflict ?? '').split(',').map((s: string) => s.trim()));
            const sets = keys.filter((k) => !conflictCols.has(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`);
            stmt += this.opts.ignoreDuplicates || !sets.length ? ` on conflict (${conflict}) do nothing` : ` on conflict (${conflict}) do update set ${sets.join(', ')}`;
          }
          if (this.returning) {
            const r = await c.query(`with done as (${stmt} returning *) ${asJson(`select ${columns(this.returning)} from done`)}`, params);
            return r.rows[0].rows as any[];
          }
          await c.query(stmt, params);
          return null;
        }
        if (this.op === 'update') {
          const keys = Object.keys(this.body);
          const sets = keys.map((k) => `${ident(k)} = b.${ident(k)}`).join(', ');
          const from = ` from json_populate_record(null::${t}, ${p(JSON.stringify(this.body))}::json) b`;
          // qualify filter columns with the table (b has the same column names)
          const w = this.filters.length ? ` where ${this.filters.map((f) => `${t}.${f.sql(p)}`).join(' and ')}` : '';
          const stmt = `update ${t} set ${sets}${from}${w}`;
          if (this.returning) {
            const r = await c.query(`with done as (${stmt} returning ${t}.*) ${asJson(`select ${columns(this.returning)} from done`)}`, params);
            return r.rows[0].rows as any[];
          }
          await c.query(stmt, params);
          return null;
        }
        // delete
        const stmt = `delete from ${t}${where()}`;
        await c.query(stmt, params);
        return null;
      });

      if (result.error) {
        log.push(`${this.op} ${this.table}: ${result.error.code} ${result.error.message}`);
        return { data: null, error: result.error, count: null };
      }
      let data: any = result.data;
      if (this.one) {
        if (Array.isArray(data) && data.length > 1) return { data: null, error: { message: 'more than one row', code: 'PGRST116' }, count };
        data = Array.isArray(data) ? data[0] ?? null : null;
      }
      return { data, error: null, count };
    }
  }

  async function rpc(name: string, args: Record<string, unknown> = {}) {
    const keys = Object.keys(args);
    const res = await tx(async (c) => {
      const meta = await c.query(`select p.proretset from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [name]);
      if (!meta.rows.length) throw Object.assign(new Error(`function public.${name} does not exist`), { code: 'PGRST202' });
      const call = `public.${ident(name)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`;
      const values = keys.map((k) => args[k]);
      if (meta.rows[0].proretset) {
        const r = await c.query(`select coalesce(json_agg(r), '[]'::json) as rows from (select * from ${call}) r`, values);
        return r.rows[0].rows;
      }
      const r = await c.query(`select to_json(${call}) as v`, values);
      return r.rows[0].v;
    });
    if (res.error) log.push(`rpc ${name}: ${res.error.code} ${res.error.message}`);
    return res;
  }

  const storage = {
    from(bucket: string) {
      return {
        async upload(path: string, _bytes: Buffer, opts: { upsert?: boolean } = {}) {
          const r = await tx(async (c) => {
            const had = await c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, path]);
            if (had.rows.length && !opts.upsert) throw Object.assign(new Error('The resource already exists'), { code: '409' });
            if (!had.rows.length) await c.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, path]);
            return { path };
          });
          return r;
        },
        async remove(paths: string[]) {
          return tx(async (c) => {
            const r = await c.query('delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name', [bucket, paths]);
            return r.rows;
          });
        },
        async list(prefix = '', opts: { limit?: number; offset?: number } = {}) {
          return tx(async (c) => {
            const like = prefix ? `${prefix}/` : '';
            const r = await c.query(`select name from storage.objects where bucket_id = $1 and name like $2 order by name`, [bucket, `${like.replace(/[%_]/g, '\\$&')}%`]);
            const seen = new Set<string>();
            const out: { name: string; created_at?: string }[] = [];
            for (const row of r.rows) {
              const rest = String(row.name).slice(like.length);
              const first = rest.split('/')[0];
              if (!seen.has(first)) {
                seen.add(first);
                out.push({ name: first, created_at: '2020-01-01T00:00:00Z' });
              }
            }
            return out.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 100));
          });
        },
      };
    },
  };

  const auth = {
    admin: {
      async getUserById(uid: string) {
        const answer = authUsers ? await authUsers.exists(uid) : 'error';
        if (answer === true) return { data: { user: { id: uid } }, error: null };
        if (answer === false) return { data: { user: null }, error: { status: 404, code: 'user_not_found', message: 'User not found' } };
        return { data: { user: null }, error: { status: 500, message: 'lookup failed' } };
      },
    },
  };

  return { from: (table: string) => new Query(table), rpc, storage, auth, log } as any;
}
