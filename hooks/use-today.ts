'use client'

import { useEffect, useState } from 'react'
import { todayISO } from '@/lib/format'

/** Today's date in IST that updates by itself when midnight passes while the app stays open. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayISO())
  useEffect(() => {
    const tick = () => setToday((prev) => {
      const now = todayISO()
      return now === prev ? prev : now
    })
    const timer = window.setInterval(tick, 20_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}
