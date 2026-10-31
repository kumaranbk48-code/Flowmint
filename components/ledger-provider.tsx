'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_OPENING_BALANCE,
  DEFAULT_OPENING_CASH,
  TODAY,
  workers,
  type Project,
  type Transaction,
  type Worker,
} from '@/lib/data'
import { workerDue, getFinancialSummary } from '@/lib/ledger'
import { useAuth } from '@/components/auth-provider'

export type NewProjectInput = {
  name: string
  client: string
  contractValue: number
  startDate: string
  expectedCompletionDate?: string
}

export type PendingSyncItem =
  | { id: string; type: 'add_tx'; payload: any; tempId: string }
  | { id: string; type: 'delete_tx'; txId: string }
  | { id: string; type: 'add_project'; payload: any; tempId: string }
  | { id: string; type: 'delete_project'; projectId: string }
  | { id: string; type: 'settings'; payload: { openingBalance: number } }

type LedgerContextValue = {
  transactions: Transaction[]
  projects: Project[]
  workers: Worker[]
  openingBalance: number
  setOpeningBalance: (val: number) => void
  openingCash: number
  setOpeningCash: (val: number) => void
  dailyOpeningBalances: Record<string, number>
  getOpeningBalanceForDate: (date: string) => number
  setDailyOpeningBalance: (date: string, val: number | null) => void
  isCustomDailyBalance: (date: string) => boolean
  clearAllDailyBalances: () => void
  addTransaction: (tx: Omit<Transaction, 'id'>) => Promise<Transaction>
  deleteTransaction: (id: string) => void
  addProject: (data: NewProjectInput) => Promise<Project>
  deleteProject: (id: string) => void
  payWorker: (worker: Worker) => void
  lastAdded: Transaction | null
  isLoading: boolean
  isOnline: boolean
  isSyncing: boolean
  pendingSyncCount: number
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

const getCacheKeys = (userId?: string) => {
  const uid = userId || 'local'
  return {
    txs: `flowmint_cache_txs_${uid}`,
    projects: `flowmint_cache_projects_${uid}`,
    settings: `flowmint_cache_settings_${uid}`,
    queue: `flowmint_pending_queue_${uid}`,
  }
}

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [projectsList, setProjectsList] = useState<Project[]>([])
  const [openingBalance, setOpeningBalanceState] = useState<number>(DEFAULT_OPENING_BALANCE)
  const [openingCash, setOpeningCash] = useState<number>(DEFAULT_OPENING_CASH)
  const [dailyOpeningBalances, setDailyOpeningBalances] = useState<Record<string, number>>({})
  const [lastAdded, setLastAdded] = useState<Transaction | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  // Enqueue an action to be synced when online
  const enqueueSyncItem = useCallback(
    (item: PendingSyncItem) => {
      if (typeof window === 'undefined') return
      try {
        const keys = getCacheKeys(user?.id)
        const raw = localStorage.getItem(keys.queue)
        const queue: PendingSyncItem[] = raw ? JSON.parse(raw) : []
        queue.push(item)
        localStorage.setItem(keys.queue, JSON.stringify(queue))
        setPendingSyncCount(queue.length)
      } catch (err) {
        console.error('Failed to enqueue sync item:', err)
      }
    },
    [user?.id],
  )

  // Flush background sync queue
  const flushSyncQueue = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.onLine || !user?.id) return
    const keys = getCacheKeys(user.id)
    const rawQueue = localStorage.getItem(keys.queue)
    if (!rawQueue) return

    let queue: PendingSyncItem[] = []
    try {
      queue = JSON.parse(rawQueue)
    } catch {
      return
    }
    if (!queue.length) return

    setIsSyncing(true)
    const remaining: PendingSyncItem[] = []

    for (const item of queue) {
      try {
        if (item.type === 'add_tx') {
          const res = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, transaction: item.payload }),
          })
          if (!res.ok) throw new Error('Sync tx failed')
          const data = await res.json()
          if (data?.transaction?.id) {
            setTransactions((prev) => {
              const updated = prev.map((t) => (t.id === item.tempId ? data.transaction : t))
              try {
                localStorage.setItem(keys.txs, JSON.stringify(updated))
              } catch {}
              return updated
            })
          }
        } else if (item.type === 'add_project') {
          const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, project: item.payload }),
          })
          if (!res.ok) throw new Error('Sync project failed')
          const data = await res.json()
          if (data?.project?.id) {
            setProjectsList((prev) => {
              const updated = prev.map((p) => (p.id === item.tempId ? data.project : p))
              try {
                localStorage.setItem(keys.projects, JSON.stringify(updated))
              } catch {}
              return updated
            })
          }
        } else if (item.type === 'delete_tx') {
          await fetch(
            `/api/transactions?userId=${encodeURIComponent(user.id)}&id=${encodeURIComponent(item.txId)}`,
            { method: 'DELETE' },
          )
        } else if (item.type === 'delete_project') {
          await fetch(
            `/api/projects?userId=${encodeURIComponent(user.id)}&projectId=${encodeURIComponent(item.projectId)}`,
            { method: 'DELETE' },
          )
        } else if (item.type === 'settings') {
          await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, openingBalance: item.payload.openingBalance }),
          })
        }
      } catch (err) {
        console.warn('[FlowMint Sync] Retaining failed item in queue:', item, err)
        remaining.push(item)
      }
    }

    try {
      localStorage.setItem(keys.queue, JSON.stringify(remaining))
    } catch {}
    setPendingSyncCount(remaining.length)
    setIsSyncing(false)
  }, [user?.id])

  // Track online/offline status
  useEffect(() => {
    if (typeof window === 'undefined') return

    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      flushSyncQueue()
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [flushSyncQueue])

  // Instant hydration from localStorage on mount (0ms local-first load)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const keys = getCacheKeys(user?.id)

    try {
      const cachedTxs = localStorage.getItem(keys.txs)
      if (cachedTxs) {
        setTransactions(JSON.parse(cachedTxs))
      }

      const cachedProjects = localStorage.getItem(keys.projects)
      if (cachedProjects) {
        setProjectsList(JSON.parse(cachedProjects))
      }

      const cachedSettings = localStorage.getItem(keys.settings)
      if (cachedSettings) {
        const parsed = JSON.parse(cachedSettings)
        if (parsed?.openingBalance !== undefined) {
          setOpeningBalanceState(Number(parsed.openingBalance))
          setOpeningCash(Number(parsed.openingBalance))
        }
      }

      const rawQueue = localStorage.getItem(keys.queue)
      if (rawQueue) {
        const q = JSON.parse(rawQueue)
        setPendingSyncCount(q.length || 0)
      }
    } catch (e) {
      console.warn('Error reading from offline storage:', e)
    }
  }, [user?.id])

  // Load daily overrides from localStorage
  useEffect(() => {
    try {
      const key = `flowmint_daily_balances_${user?.id || 'guest'}`
      const saved = localStorage.getItem(key)
      if (saved) {
        setDailyOpeningBalances(JSON.parse(saved))
      } else {
        setDailyOpeningBalances({})
      }
    } catch {}
  }, [user?.id])

  // Load live data from Supabase backend when user is logged in
  useEffect(() => {
    if (!user?.id) {
      setTransactions([])
      setProjectsList([])
      setOpeningBalanceState(DEFAULT_OPENING_BALANCE)
      setOpeningCash(DEFAULT_OPENING_CASH)
      setLastAdded(null)
      return
    }

    let isMounted = true
    setIsLoading(true)
    const keys = getCacheKeys(user.id)

    // 1. Fetch Transactions
    fetch(`/api/transactions?userId=${encodeURIComponent(user.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.transactions && Array.isArray(data.transactions)) {
          setTransactions(data.transactions)
          try {
            localStorage.setItem(keys.txs, JSON.stringify(data.transactions))
          } catch {}
        }
      })
      .catch((err) => console.warn('LedgerProvider fetch transactions (offline/cache fallback):', err))

    // 2. Fetch Projects
    fetch(`/api/projects?userId=${encodeURIComponent(user.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.projects && Array.isArray(data.projects)) {
          setProjectsList(data.projects)
          try {
            localStorage.setItem(keys.projects, JSON.stringify(data.projects))
          } catch {}
        }
      })
      .catch((err) => console.warn('LedgerProvider fetch projects (offline/cache fallback):', err))

    // 3. Fetch Settings / Opening Balance
    fetch(`/api/settings?userId=${encodeURIComponent(user.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.settings?.openingBalance !== undefined) {
          const bal = Number(data.settings.openingBalance)
          setOpeningBalanceState(bal)
          setOpeningCash(bal)
          try {
            localStorage.setItem(keys.settings, JSON.stringify({ openingBalance: bal }))
          } catch {}
        }
      })
      .catch((err) => console.warn('LedgerProvider fetch settings (offline/cache fallback):', err))
      .finally(() => {
        if (isMounted) setIsLoading(false)
        // Also trigger background sync flush if online
        if (navigator.onLine) {
          flushSyncQueue()
        }
      })

    return () => {
      isMounted = false
    }
  }, [user?.id, flushSyncQueue])

  const setOpeningBalance = useCallback(
    (val: number) => {
      setOpeningBalanceState(val)
      setOpeningCash(val)

      if (typeof window !== 'undefined') {
        const keys = getCacheKeys(user?.id)
        try {
          localStorage.setItem(keys.settings, JSON.stringify({ openingBalance: val }))
        } catch {}
      }

      if (user?.id) {
        if (!navigator.onLine) {
          enqueueSyncItem({
            id: `settings_${Date.now()}`,
            type: 'settings',
            payload: { openingBalance: val },
          })
          return
        }

        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, openingBalance: val }),
        }).catch(() => {
          enqueueSyncItem({
            id: `settings_${Date.now()}`,
            type: 'settings',
            payload: { openingBalance: val },
          })
        })
      }
    },
    [user?.id, enqueueSyncItem],
  )

  const getOpeningBalanceForDate = useCallback(
    (date: string) => {
      if (
        dailyOpeningBalances[date] !== undefined &&
        dailyOpeningBalances[date] !== null &&
        !isNaN(dailyOpeningBalances[date])
      ) {
        return dailyOpeningBalances[date]
      }
      return openingBalance
    },
    [dailyOpeningBalances, openingBalance],
  )

  const isCustomDailyBalance = useCallback(
    (date: string) => {
      return (
        dailyOpeningBalances[date] !== undefined &&
        dailyOpeningBalances[date] !== null &&
        !isNaN(dailyOpeningBalances[date])
      )
    },
    [dailyOpeningBalances],
  )

  const setDailyOpeningBalance = useCallback(
    (date: string, val: number | null) => {
      setDailyOpeningBalances((prev) => {
        const next = { ...prev }
        if (val === null || isNaN(val)) {
          delete next[date]
        } else {
          next[date] = val
        }
        try {
          const key = `flowmint_daily_balances_${user?.id || 'guest'}`
          localStorage.setItem(key, JSON.stringify(next))
        } catch {}
        return next
      })
    },
    [user?.id],
  )

  const clearAllDailyBalances = useCallback(() => {
    setDailyOpeningBalances({})
    try {
      const key = `flowmint_daily_balances_${user?.id || 'guest'}`
      localStorage.removeItem(key)
    } catch {}
  }, [user?.id])

  const addTransaction = useCallback(
    async (tx: Omit<Transaction, 'id'>) => {
      // Validate that expense does not cause net cash balance to drop below 0
      if (tx.type !== 'income') {
        const txDate = tx.date || TODAY
        const dateOpening = getOpeningBalanceForDate(txDate)
        const summary = getFinancialSummary(
          transactions.filter((t) => t.date === txDate),
          dateOpening,
          openingCash,
        )

        if (tx.method === 'cash' && tx.amount > summary.currentCash) {
          throw new Error(
            `Cannot add expense of ₹${tx.amount.toLocaleString('en-IN')}. Available cash in hand is only ₹${summary.currentCash.toLocaleString('en-IN')}. Net cash balance cannot go below ₹0.`,
          )
        }

        if (tx.amount > summary.netBalance) {
          throw new Error(
            `Cannot add expense of ₹${tx.amount.toLocaleString('en-IN')}. Available net balance is only ₹${summary.netBalance.toLocaleString('en-IN')}. Net balance cannot go below ₹0.`,
          )
        }
      }

      const now = new Date()
      const hours = now.getHours()
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const ampm = hours >= 12 ? 'PM' : 'AM'
      const formattedHours = hours % 12 || 12
      const defaultTime = `${formattedHours}:${minutes} ${ampm}`

      const tempId = `offline_tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const created: Transaction = {
        ...tx,
        id: tempId,
        time: tx.time || defaultTime,
      }

      // 1. Immediate Local State & Storage update
      setTransactions((prev) => {
        const next = [created, ...prev]
        if (typeof window !== 'undefined') {
          const keys = getCacheKeys(user?.id)
          try {
            localStorage.setItem(keys.txs, JSON.stringify(next))
          } catch {}
        }
        return next
      })
      setLastAdded(created)

      // 2. If user is offline or unauthenticated, queue for sync
      if (!navigator.onLine || !user?.id) {
        enqueueSyncItem({
          id: tempId,
          type: 'add_tx',
          payload: { ...tx, time: tx.time || defaultTime },
          tempId,
        })
        return created
      }

      // 3. Online: attempt background sync to API
      try {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            transaction: {
              ...tx,
              time: tx.time || defaultTime,
            },
          }),
        })

        if (!res.ok) {
          throw new Error('API returned failure')
        }

        const data = await res.json()
        if (data?.transaction?.id) {
          setTransactions((prev) => {
            const next = prev.map((item) => (item.id === tempId ? data.transaction : item))
            if (typeof window !== 'undefined') {
              const keys = getCacheKeys(user?.id)
              try {
                localStorage.setItem(keys.txs, JSON.stringify(next))
              } catch {}
            }
            return next
          })
          setLastAdded(data.transaction)
          return data.transaction as Transaction
        }
      } catch (err) {
        console.warn('[FlowMint] Transaction queued for background sync:', err)
        enqueueSyncItem({
          id: tempId,
          type: 'add_tx',
          payload: { ...tx, time: tx.time || defaultTime },
          tempId,
        })
      }

      return created
    },
    [user?.id, enqueueSyncItem],
  )

  const deleteTransaction = useCallback(
    (id: string) => {
      setTransactions((prev) => {
        const next = prev.filter((t) => t.id !== id)
        if (typeof window !== 'undefined') {
          const keys = getCacheKeys(user?.id)
          try {
            localStorage.setItem(keys.txs, JSON.stringify(next))
          } catch {}
        }
        return next
      })

      if (user?.id) {
        if (!navigator.onLine) {
          enqueueSyncItem({
            id: `del_tx_${id}`,
            type: 'delete_tx',
            txId: id,
          })
          return
        }

        fetch(`/api/transactions?userId=${encodeURIComponent(user.id)}&id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }).catch(() => {
          enqueueSyncItem({
            id: `del_tx_${id}`,
            type: 'delete_tx',
            txId: id,
          })
        })
      }
    },
    [user?.id, enqueueSyncItem],
  )

  const addProject = useCallback(
    async (data: NewProjectInput) => {
      const tempId = `offline_proj_${Date.now()}`
      const created: Project = {
        id: tempId,
        name: data.name.trim(),
        client: data.client.trim(),
        contractValue: Number(data.contractValue) || 0,
        startDate: data.startDate,
        expectedCompletionDate: data.expectedCompletionDate,
        status: 'active',
        receivedBefore: 0,
        spentBefore: 0,
      }

      // 1. Immediate Local State & Storage update
      setProjectsList((prev) => {
        const next = [created, ...prev]
        if (typeof window !== 'undefined') {
          const keys = getCacheKeys(user?.id)
          try {
            localStorage.setItem(keys.projects, JSON.stringify(next))
          } catch {}
        }
        return next
      })

      // 2. If offline, queue for background sync
      if (!navigator.onLine || !user?.id) {
        enqueueSyncItem({
          id: tempId,
          type: 'add_project',
          payload: {
            name: data.name.trim(),
            client: data.client.trim(),
            contractValue: Number(data.contractValue) || 0,
            startDate: data.startDate,
            expectedCompletionDate: data.expectedCompletionDate,
          },
          tempId,
        })
        return created
      }

      // 3. Online: sync to API
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            project: {
              name: data.name.trim(),
              client: data.client.trim(),
              contractValue: Number(data.contractValue) || 0,
              startDate: data.startDate,
              expectedCompletionDate: data.expectedCompletionDate,
            },
          }),
        })

        if (!res.ok) {
          throw new Error('API project save returned error')
        }

        const resData = await res.json()
        if (resData?.project?.id) {
          setProjectsList((prev) => {
            const next = prev.map((item) => (item.id === tempId ? resData.project : item))
            if (typeof window !== 'undefined') {
              const keys = getCacheKeys(user?.id)
              try {
                localStorage.setItem(keys.projects, JSON.stringify(next))
              } catch {}
            }
            return next
          })
          return resData.project as Project
        }
      } catch (err) {
        console.warn('[FlowMint] Project queued for background sync:', err)
        enqueueSyncItem({
          id: tempId,
          type: 'add_project',
          payload: {
            name: data.name.trim(),
            client: data.client.trim(),
            contractValue: Number(data.contractValue) || 0,
            startDate: data.startDate,
            expectedCompletionDate: data.expectedCompletionDate,
          },
          tempId,
        })
      }

      return created
    },
    [user?.id, enqueueSyncItem],
  )

  const deleteProject = useCallback(
    (id: string) => {
      setProjectsList((prev) => {
        const next = prev.filter((p) => p.id !== id)
        if (typeof window !== 'undefined') {
          const keys = getCacheKeys(user?.id)
          try {
            localStorage.setItem(keys.projects, JSON.stringify(next))
          } catch {}
        }
        return next
      })

      setTransactions((prev) => {
        const next = prev.map((tx) => (tx.projectId === id ? { ...tx, projectId: null } : tx))
        if (typeof window !== 'undefined') {
          const keys = getCacheKeys(user?.id)
          try {
            localStorage.setItem(keys.txs, JSON.stringify(next))
          } catch {}
        }
        return next
      })

      if (user?.id) {
        if (!navigator.onLine) {
          enqueueSyncItem({
            id: `del_proj_${id}`,
            type: 'delete_project',
            projectId: id,
          })
          return
        }

        fetch(
          `/api/projects?userId=${encodeURIComponent(user.id)}&projectId=${encodeURIComponent(id)}`,
          { method: 'DELETE' },
        ).catch(() => {
          enqueueSyncItem({
            id: `del_proj_${id}`,
            type: 'delete_project',
            projectId: id,
          })
        })
      }
    },
    [user?.id, enqueueSyncItem],
  )

  const payWorker = useCallback(
    (worker: Worker) => {
      addTransaction({
        type: 'expense',
        amount: workerDue(worker),
        date: TODAY,
        projectId: worker.projectId,
        workerId: worker.id,
        category: 'Worker Payment',
        party: worker.name || 'Workers',
        method: 'cash',
        source: 'manual',
        description: `Worker payment for ${worker.name}`,
      })
    },
    [addTransaction],
  )

  const value = useMemo(
    () => ({
      transactions,
      projects: projectsList,
      workers,
      openingBalance,
      setOpeningBalance,
      openingCash,
      setOpeningCash,
      dailyOpeningBalances,
      getOpeningBalanceForDate,
      setDailyOpeningBalance,
      isCustomDailyBalance,
      clearAllDailyBalances,
      addTransaction,
      deleteTransaction,
      addProject,
      deleteProject,
      payWorker,
      lastAdded,
      isLoading,
      isOnline,
      isSyncing,
      pendingSyncCount,
    }),
    [
      transactions,
      projectsList,
      openingBalance,
      openingCash,
      dailyOpeningBalances,
      getOpeningBalanceForDate,
      setDailyOpeningBalance,
      isCustomDailyBalance,
      clearAllDailyBalances,
      setOpeningBalance,
      addTransaction,
      deleteTransaction,
      addProject,
      deleteProject,
      payWorker,
      lastAdded,
      isLoading,
      isOnline,
      isSyncing,
      pendingSyncCount,
    ],
  )

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger() {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used within LedgerProvider')
  return ctx
}
