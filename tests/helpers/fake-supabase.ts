/**
 * Minimal in-memory stand-in for the Supabase query builder, enforcing the same constraints the real database
 * migration enforces (primary key, composite project-owner foreign key, project delete restriction, check constraints).
 */
type Row = Record<string, any>
type Result = { data: any; error: { code: string; message: string } | null }

export function createFakeDb() {
  const tables: Record<string, Row[]> = { profiles: [], projects: [], transactions: [] }
  const failing = new Set<string>() // table names that should fail (simulates a database outage)

  class Query implements PromiseLike<Result> {
    private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    private filters: ((r: Row) => boolean)[] = []
    private payload: Row = {}
    private orders: [string, boolean][] = []
    private limitN: number | null = null
    private mode: 'single' | 'maybe' | null = null
    constructor(private table: string) {}

    select(_cols?: string) {
      return this
    }
    insert(p: Row) {
      this.op = 'insert'
      this.payload = p
      return this
    }
    update(p: Row) {
      this.op = 'update'
      this.payload = p
      return this
    }
    delete() {
      this.op = 'delete'
      return this
    }
    eq(col: string, v: unknown) {
      this.filters.push((r) => r[col] === v)
      return this
    }
    is(col: string, v: null) {
      this.filters.push((r) => (r[col] ?? null) === v)
      return this
    }
    order(col: string, o?: { ascending?: boolean }) {
      this.orders.push([col, o?.ascending !== false])
      return this
    }
    limit(n: number) {
      this.limitN = n
      return this
    }
    maybeSingle() {
      this.mode = 'maybe'
      return this
    }
    single() {
      this.mode = 'single'
      return this
    }

    then<T1 = Result, T2 = never>(
      ok?: ((v: Result) => T1 | PromiseLike<T1>) | null,
      err?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.run()).then(ok, err)
    }

    private run(): Result {
      const rows = tables[this.table]
      if (failing.has(this.table)) return { data: null, error: { code: 'XX000', message: 'database unavailable' } }
      const fail = (code: string, message: string): Result => ({ data: null, error: { code, message } })

      if (this.op === 'insert') {
        const p = { ...this.payload }
        const row: Row = {
          deleted_at: null,
          ...(this.table === 'profiles' ? { opening_balance: 1000 } : {}),
          ...p,
          id: p.id ?? crypto.randomUUID(),
        }
        if (rows.some((r) => r.id === row.id)) return fail('23505', 'duplicate key value violates unique constraint')
        const now = new Date().toISOString()
        if (this.table === 'transactions') {
          if (!['income', 'expense', 'wage'].includes(row.type)) return fail('23514', 'type check')
          if (!(Number(row.amount) > 0) || Number(row.amount) > 1e9) return fail('23514', 'amount check')
          if (row.project_id && !tables.projects.some((pr) => pr.id === row.project_id && pr.user_id === row.user_id)) {
            return fail('23503', 'foreign key (project_id, user_id)')
          }
          row.created_at = row.created_at ?? now
          row.updated_at = now
        } else {
          row.created_at = row.created_at ?? now
        }
        rows.push(row)
        return this.shape([row])
      }

      let matched = rows.filter((r) => this.filters.every((f) => f(r)))
      if (this.op === 'update') {
        for (const r of matched) {
          Object.assign(r, this.payload)
          if (this.table === 'transactions') r.updated_at = new Date().toISOString()
        }
        return this.shape(matched)
      }
      if (this.op === 'delete') {
        if (this.table === 'projects') {
          for (const r of matched) {
            if (tables.transactions.some((t) => t.project_id === r.id)) return fail('23503', 'project has transactions')
          }
        }
        tables[this.table] = rows.filter((r) => !matched.includes(r))
        return { data: null, error: null }
      }
      for (const [col, asc] of [...this.orders].reverse()) {
        matched = [...matched].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1)))
      }
      if (this.limitN !== null) matched = matched.slice(0, this.limitN)
      return this.shape(matched)
    }

    private shape(matched: Row[]): Result {
      const copies = matched.map((r) => ({ ...r }))
      if (this.mode === 'single') {
        return copies.length === 1 ? { data: copies[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not single' } }
      }
      if (this.mode === 'maybe') return { data: copies[0] ?? null, error: null }
      return { data: copies, error: null }
    }
  }

  return {
    tables,
    failing,
    from: (name: string) => new Query(name),
  }
}
