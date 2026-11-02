'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_OPENING_BALANCE,
  DEFAULT_OPENING_CASH,
  workers,
  type Project,
  type Transaction,
  type Worker,
} from '@/lib/data'
import {
  checkSpendAllowed,
  openingBalanceAt,
  openingCashAt,
  workerDue,
  type ProjectFilter,
} from '@/lib/ledger'
import { formatMoney, timeLabelIST, todayISO } from '@/lib/format'
import {
  validateAmount,
  validateOpeningBalance,
  validatePayMethod,
  validateTxDate,
  validateTxType,
} from '@/lib/security/validation'
import {
  applyPendingToProjects,
  applyPendingToTransactions,
  enqueueOp,
  flushQueue,
  newId,
  readQueue,
  removeItem,
  retryItem,
  type SyncItem,
  type SyncOp,
} from '@/lib/sync-queue'
import { useAuth } from '@/components/auth-provider'

export type NewProjectInput = {
  name: string
  client: string
  contractValue: number
  startDate: string
  expectedCompletionDate?: string
}

export type TransactionEdit = Partial<
  Pick<Transaction, 'type' | 'amount' | 'date' | 'time' | 'description' | 'projectId' | 'category' | 'party' | 'method'>
>

type LedgerContextValue = {
  transactions: Transaction[]
  projects: Project[]
  workers: Worker[]
  /** Set once. Every day's opening balance is derived from it (previous day's closing). */
  openingBalance: number
  setOpeningBalance: (val: number) => void
  openingCash: number
  setOpeningCash: (val: number) => void
  /** Opening balance for the START of `date`: opening balance + everything dated before it. */
  getOpeningBalanceForDate: (date: string, projectFilter?: ProjectFilter) => number
  getOpeningCashForDate: (date: string, projectFilter?: ProjectFilter) => number
  addTransaction: (tx: Omit<Transaction, 'id'>) => Promise<Transaction>
  updateTransaction: (id: string, edit: TransactionEdit) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  addProject: (data: NewProjectInput) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  payWorker: (worker: Worker) => Promise<void>
  lastAdded: Transaction | null
  isLoading: boolean
  isOnline: boolean
  isSyncing: boolean
  pendingSyncCount: number
  /** Operations the server rejected. They are not counted in any balance and need the user's attention. */
  failedSyncItems: SyncItem[]
  retryFailedItem: (qid: string) => Promise<void>
  discardFailedItem: (qid: string) => Promise<void>
  /** Set when the latest refresh from the server failed; the numbers shown are then the last saved copy. */
  loadError: string | null
  refresh: () => Promise<void>
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

const getKeys = (userId: string) => ({
  txs: `flowmint_cache_txs_${userId}`,
  projects: `flowmint_cache_projects_${userId}`,
  settings: `flowmint_cache_settings_${userId}`,
  queue: `flowmint_pending_queue_${userId}`,
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or unavailable: the server copy stays authoritative */
  }
}

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [projectsList, setProjectsList] = useState<Project[]>([])
  const [openingBalance, setOpeningBalanceState] = useState<number>(DEFAULT_OPENING_BALANCE)
  const [openingCash, setOpeningCashState] = useState<number>(DEFAULT_OPENING_CASH)
  const [lastAdded, setLastAdded] = useState<Transaction | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [failedSyncItems, setFailedSyncItems] = useState<SyncItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  // Refs give callbacks the latest values synchronously (no stale closures between two quick actions).
  const txRef = useRef<Transaction[]>([])
  const projectsRef = useRef<Project[]>([])
  const balanceRef = useRef(DEFAULT_OPENING_BALANCE)
  const cashRef = useRef(DEFAULT_OPENING_CASH)
  const refreshSeq = useRef(0)

  const keys = useMemo(() => (userId ? getKeys(userId) : null), [userId])

  const commitTxs = useCallback(
    (list: Transaction[]) => {
      txRef.current = list
      setTransactions(list)
      if (keys) writeJson(keys.txs, list)
    },
    [keys],
  )

  const commitProjects = useCallback(
    (list: Project[]) => {
      projectsRef.current = list
      setProjectsList(list)
      if (keys) writeJson(keys.projects, list)
    },
    [keys],
  )

  const commitSettings = useCallback(
    (balance: number, cash: number) => {
      balanceRef.current = balance
      cashRef.current = cash
      setOpeningBalanceState(balance)
      setOpeningCashState(cash)
      if (keys) writeJson(keys.settings, { openingBalance: balance, openingCash: cash })
    },
    [keys],
  )

  const refreshCounts = useCallback(() => {
    if (!keys) return
    const queue = readQueue(window.localStorage, keys.queue)
    setPendingSyncCount(queue.filter((i) => i.status === 'pending').length)
    setFailedSyncItems(queue.filter((i) => i.status === 'failed'))
  }, [keys])

  // ---------------------------------------------------------------- server reconciliation
  const refresh = useCallback(async () => {
    if (!keys || typeof navigator === 'undefined' || !navigator.onLine) return
    const seq = ++refreshSeq.current
    try {
      const [t, p, s] = await Promise.all([fetch('/api/transactions'), fetch('/api/projects'), fetch('/api/settings')])
      if ([t, p, s].some((r) => r.status === 401)) throw new Error('Your session has expired. Please log in again.')
      if (!t.ok || !p.ok || !s.ok) throw new Error('Could not refresh your data from the server.')
      const [tj, pj, sj] = await Promise.all([t.json(), p.json(), s.json()])
      if (
        !Array.isArray(tj?.transactions) ||
        !Array.isArray(pj?.projects) ||
        typeof sj?.settings?.openingBalance !== 'number'
      ) {
        throw new Error('The server returned unexpected data.')
      }
      if (seq !== refreshSeq.current) return // a newer refresh superseded this one

      const queue = readQueue(window.localStorage, keys.queue)
      commitTxs(applyPendingToTransactions(tj.transactions, queue))
      commitProjects(applyPendingToProjects(pj.projects, queue))
      if (!queue.some((i) => i.type === 'settings' && i.status === 'pending')) {
        const balance = Number(sj.settings.openingBalance)
        const cash = typeof sj.settings.openingCash === 'number' ? sj.settings.openingCash : balance
        commitSettings(balance, cash)
      }
      setLoadError(null)
    } catch (err) {
      // Never replace good data with nothing: keep what is on screen and say that it may be out of date.
      setLoadError(err instanceof Error ? err.message : 'Could not refresh your data from the server.')
    } finally {
      refreshCounts()
    }
  }, [keys, commitTxs, commitProjects, commitSettings, refreshCounts])

  const flush = useCallback(async () => {
    if (!keys || typeof navigator === 'undefined' || !navigator.onLine) return null
    setIsSyncing(true)
    try {
      const nav = navigator as Navigator & { locks?: LockManager }
      const result = await flushQueue({
        storage: window.localStorage,
        key: keys.queue,
        fetchFn: (url, init) => fetch(url, init),
        lock: nav.locks ? (fn) => nav.locks!.request(`flowmint-sync-${userId}`, fn) : undefined,
        onSynced: (item, json) => {
          // Same id on both sides: swap in the server's copy (never append a second one).
          if (item.type === 'add_tx' && json?.transaction) {
            commitTxs(txRef.current.map((t) => (t.id === json.transaction.id ? json.transaction : t)))
          } else if (item.type === 'add_project' && json?.project) {
            commitProjects(projectsRef.current.map((p) => (p.id === json.project.id ? json.project : p)))
          }
        },
      })
      if (result.stoppedBy === 'auth') setLoadError('Your session has expired. Log in again to sync your saved entries.')
      return result
    } finally {
      setIsSyncing(false)
      refreshCounts()
    }
  }, [keys, userId, commitTxs, commitProjects, refreshCounts])

  /** Queue an operation and, if online, send it now. Throws the server's message if it is rejected. */
  const submit = useCallback(
    async (op: SyncOp) => {
      if (!keys) throw new Error('Please log in first.')
      const item = enqueueOp(window.localStorage, keys.queue, op)
      refreshCounts()
      if (!navigator.onLine) {
        // Ask the browser to wake the app and sync as soon as a connection returns (where supported).
        navigator.serviceWorker?.ready
          .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register('flowmint-sync-queue'))
          .catch(() => {})
        return
      }
      const result = await flush()
      const outcome = result?.outcomes.get(item.qid)
      if (outcome?.status === 'failed') {
        removeItem(window.localStorage, keys.queue, item.qid) // the user is told now; nothing stays hidden in the queue
        refreshCounts()
        throw new Error(outcome.error)
      }
    },
    [keys, flush, refreshCounts],
  )

  // ---------------------------------------------------------------- lifecycle
  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsOnline(navigator.onLine)
    const goOnline = () => {
      setIsOnline(true)
      void flush().then(() => refresh())
    }
    const goOffline = () => setIsOnline(false)
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FLUSH_SYNC_QUEUE') void flush().then(() => refresh())
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      navigator.serviceWorker?.removeEventListener('message', onSwMessage)
    }
  }, [flush, refresh])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!keys) {
      // Logged out: nothing from the previous user stays in memory.
      txRef.current = []
      projectsRef.current = []
      setTransactions([])
      setProjectsList([])
      setPendingSyncCount(0)
      setFailedSyncItems([])
      setLoadError(null)
      return
    }

    // One-time clean-up of the removed per-day opening balance overrides (the opening balance is set once now).
    try {
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('flowmint_daily_balances')) window.localStorage.removeItem(k)
      }
    } catch {
      /* ignore */
    }

    // 1. Show the last saved copy immediately (cache rows with legacy temporary ids are dropped; their pending
    //    entries are re-created from the migrated queue below).
    const queue = readQueue(window.localStorage, keys.queue)
    writeJson(keys.queue, queue) // persists the legacy-format migration
    const cachedTxs = readJson<Transaction[]>(keys.txs, []).filter((t) => UUID_RE.test(t.id))
    const cachedProjects = readJson<Project[]>(keys.projects, []).filter((p) => UUID_RE.test(p.id))
    const cachedSettings = readJson<{ openingBalance: number; openingCash: number } | null>(keys.settings, null)
    commitTxs(applyPendingToTransactions(cachedTxs, queue))
    commitProjects(applyPendingToProjects(cachedProjects, queue))
    if (cachedSettings) commitSettings(cachedSettings.openingBalance, cachedSettings.openingCash)
    refreshCounts()

    // 2. Push anything pending, then reconcile with the server.
    let cancelled = false
    setIsLoading(true)
    void (async () => {
      await flush()
      await refresh()
      if (!cancelled) setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys])

  // Retry pending entries periodically while online (covers a server blip without waiting for a reconnect event).
  useEffect(() => {
    if (!keys || pendingSyncCount === 0 || !isOnline) return
    const timer = window.setInterval(() => {
      void flush().then(() => refresh())
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [keys, pendingSyncCount, isOnline, flush, refresh])

  // ---------------------------------------------------------------- opening balance (derived, carried forward)
  const getOpeningBalanceForDate = useCallback(
    (date: string, projectFilter: ProjectFilter = 'all') => openingBalanceAt(date, transactions, openingBalance, projectFilter),
    [transactions, openingBalance],
  )
  const getOpeningCashForDate = useCallback(
    (date: string, projectFilter: ProjectFilter = 'all') => openingCashAt(date, transactions, openingCash, projectFilter),
    [transactions, openingCash],
  )

  const persistSettings = useCallback(() => {
    if (!keys) return
    enqueueOp(window.localStorage, keys.queue, {
      type: 'settings',
      openingBalance: balanceRef.current,
      openingCash: cashRef.current,
    })
    refreshCounts()
    void flush().then(() => refresh())
  }, [keys, flush, refresh, refreshCounts])

  const setOpeningBalance = useCallback(
    (val: number) => {
      const check = validateOpeningBalance(val)
      if (!check.valid) return
      commitSettings(check.balance, cashRef.current)
      persistSettings()
    },
    [commitSettings, persistSettings],
  )

  const setOpeningCash = useCallback(
    (val: number) => {
      const check = validateOpeningBalance(val)
      if (!check.valid) return
      commitSettings(balanceRef.current, check.balance)
      persistSettings()
    },
    [commitSettings, persistSettings],
  )

  // ---------------------------------------------------------------- transactions
  const addTransaction = useCallback(
    async (input: Omit<Transaction, 'id'>): Promise<Transaction> => {
      if (!keys) throw new Error('Please log in to record transactions.')

      const amount = validateAmount(input.amount)
      if (!amount.valid) throw new Error(amount.error || 'Invalid amount')
      const date = validateTxDate(input.date, todayISO())
      if (!date) throw new Error('Invalid date')
      const method = validatePayMethod(input.method)
      if (!method) throw new Error('Choose a payment method')

      // Worker payments are stored with the dedicated 'wage' type.
      const type = input.type === 'expense' && input.category === 'Worker Payment' ? 'wage' : input.type
      if (!validateTxType(type)) throw new Error('Invalid transaction type')

      const tx: Transaction = {
        ...input,
        id: newId(), // client-generated: this id makes every retry of this entry idempotent
        type,
        amount: amount.amount,
        date,
        method,
        time: input.time || timeLabelIST(),
        projectId: input.projectId || null,
        party: input.party || '',
        source: input.source || 'manual',
        createdAt: new Date().toISOString(),
      }

      // Early feedback only: the server applies the same rule and is authoritative.
      const check = checkSpendAllowed(txRef.current, balanceRef.current, cashRef.current, tx)
      if (!check.ok) {
        throw new Error(`Not enough ${check.reason === 'cash' ? 'cash in hand' : 'available balance'}: ${formatMoney(check.available)} available.`)
      }

      const before = txRef.current
      commitTxs([...before, tx])
      try {
        await submit({ type: 'add_tx', tx })
      } catch (err) {
        commitTxs(txRef.current.filter((t) => t.id !== tx.id))
        throw err
      }
      setLastAdded(tx)
      return tx
    },
    [keys, commitTxs, submit],
  )

  const updateTransaction = useCallback(
    async (id: string, edit: TransactionEdit) => {
      if (!keys) throw new Error('Please log in first.')
      const current = txRef.current.find((t) => t.id === id)
      if (!current) throw new Error('Transaction not found')

      const patch: Record<string, unknown> = {}
      if (edit.amount !== undefined) {
        const a = validateAmount(edit.amount)
        if (!a.valid) throw new Error(a.error || 'Invalid amount')
        patch.amount = a.amount
      }
      if (edit.date !== undefined) {
        const d = validateTxDate(edit.date, todayISO())
        if (!d) throw new Error('Invalid date')
        patch.date = d
      }
      if (edit.method !== undefined) {
        const m = validatePayMethod(edit.method)
        if (!m) throw new Error('Invalid payment method')
        patch.method = m
      }
      if (edit.type !== undefined) {
        const ty = validateTxType(edit.type)
        if (!ty) throw new Error('Invalid transaction type')
        patch.type = ty
      }
      for (const k of ['time', 'description', 'projectId', 'category', 'party'] as const) {
        if (edit[k] !== undefined) patch[k] = edit[k]
      }
      if (Object.keys(patch).length === 0) return

      const merged = { ...current, ...patch } as Transaction
      const others = txRef.current.filter((t) => t.id !== id)
      const check = checkSpendAllowed(others, balanceRef.current, cashRef.current, merged)
      if (!check.ok) {
        throw new Error(`Not enough ${check.reason === 'cash' ? 'cash in hand' : 'available balance'}: ${formatMoney(check.available)} available.`)
      }

      const before = txRef.current
      commitTxs(before.map((t) => (t.id === id ? merged : t)))
      try {
        await submit({ type: 'update_tx', id, patch })
      } catch (err) {
        commitTxs(before)
        throw err
      }
    },
    [keys, commitTxs, submit],
  )

  const deleteTransaction = useCallback(
    async (id: string) => {
      if (!keys) return
      commitTxs(txRef.current.filter((t) => t.id !== id))
      try {
        await submit({ type: 'delete_tx', id })
      } catch (err) {
        console.error('Delete rejected by the server:', err)
        await refresh() // restore server truth: a rejected delete must not look like a success
      }
    },
    [keys, commitTxs, submit, refresh],
  )

  // ---------------------------------------------------------------- projects
  const addProject = useCallback(
    async (data: NewProjectInput): Promise<Project> => {
      if (!keys) throw new Error('Please log in first.')
      const contract = validateAmount(data.contractValue, { allowZero: true })
      if (!contract.valid) throw new Error(contract.error || 'Invalid contract value')

      const project: Project = {
        id: newId(), // client-generated: projects never change id on sync, so transactions keep their project
        name: data.name.trim(),
        client: data.client.trim(),
        contractValue: contract.amount,
        startDate: data.startDate,
        expectedCompletionDate: data.expectedCompletionDate,
        status: 'active',
        receivedBefore: 0,
        spentBefore: 0,
      }
      commitProjects([project, ...projectsRef.current])
      try {
        await submit({ type: 'add_project', project })
      } catch (err) {
        commitProjects(projectsRef.current.filter((p) => p.id !== project.id))
        throw err
      }
      return project
    },
    [keys, commitProjects, submit],
  )

  const deleteProject = useCallback(
    async (id: string) => {
      if (!keys) return
      if (txRef.current.some((t) => t.projectId === id)) {
        throw new Error('This project has transactions and cannot be deleted. Its money would disappear from the project reports.')
      }
      const before = projectsRef.current
      commitProjects(before.filter((p) => p.id !== id))
      try {
        await submit({ type: 'delete_project', id })
      } catch (err) {
        commitProjects(before)
        throw err
      }
    },
    [keys, commitProjects, submit],
  )

  const payWorker = useCallback(
    async (worker: Worker) => {
      const due = workerDue(worker)
      if (due <= 0) return
      try {
        await addTransaction({
          type: 'wage',
          amount: due,
          date: todayISO(),
          projectId: worker.projectId,
          workerId: worker.id,
          category: 'Worker Payment',
          party: worker.name || 'Workers',
          method: 'cash',
          source: 'manual',
          description: `Worker payment for ${worker.name}`,
        })
      } catch (err) {
        console.error('Worker payment was not recorded:', err)
      }
    },
    [addTransaction],
  )

  // ---------------------------------------------------------------- failed sync items
  const retryFailedItem = useCallback(
    async (qid: string) => {
      if (!keys) return
      retryItem(window.localStorage, keys.queue, qid)
      refreshCounts()
      await refresh() // shows the pending entry again
      await flush()
      await refresh()
    },
    [keys, refresh, flush, refreshCounts],
  )

  const discardFailedItem = useCallback(
    async (qid: string) => {
      if (!keys) return
      removeItem(window.localStorage, keys.queue, qid)
      refreshCounts()
      await refresh()
    },
    [keys, refresh, refreshCounts],
  )

  const value = useMemo<LedgerContextValue>(
    () => ({
      transactions,
      projects: projectsList,
      workers,
      openingBalance,
      setOpeningBalance,
      openingCash,
      setOpeningCash,
      getOpeningBalanceForDate,
      getOpeningCashForDate,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addProject,
      deleteProject,
      payWorker,
      lastAdded,
      isLoading,
      isOnline,
      isSyncing,
      pendingSyncCount,
      failedSyncItems,
      retryFailedItem,
      discardFailedItem,
      loadError,
      refresh,
    }),
    [
      transactions,
      projectsList,
      openingBalance,
      openingCash,
      setOpeningBalance,
      setOpeningCash,
      getOpeningBalanceForDate,
      getOpeningCashForDate,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addProject,
      deleteProject,
      payWorker,
      lastAdded,
      isLoading,
      isOnline,
      isSyncing,
      pendingSyncCount,
      failedSyncItems,
      retryFailedItem,
      discardFailedItem,
      loadError,
      refresh,
    ],
  )

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger() {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used within LedgerProvider')
  return ctx
}
