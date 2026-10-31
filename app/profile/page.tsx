'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LogOut, Pencil } from 'lucide-react'
import { PageHeader, Panel, buttonClass } from '@/components/ledger-ui'
import { useAuth } from '@/components/auth-provider'

export default function Page() {
  const { user, business, logout } = useAuth()
  const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false)

  useEffect(() => {
    if (!isConfirmingSignOut) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsConfirmingSignOut(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isConfirmingSignOut])

  const displayName = business.ownerName || user?.name || 'User'
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U'

  const details = [
    ['Business Name', business.businessName || 'Not set'],
    ['Owner Name', business.ownerName || user?.name || 'Not set'],
    ['Business Type', business.businessType || 'Not set'],
    ['Location', business.location || 'Not set'],
  ]

  return (
    <>
      <PageHeader
        title="Profile"
        description="Your contractor profile and business details."
        actions={
          <button
            type="button"
            onClick={() => setIsConfirmingSignOut(true)}
            className={buttonClass('outline')}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        }
      />
      <div className="flex max-w-3xl flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        {/* Contractor Badge */}
        <Panel bodyClassName="flex items-center gap-4 p-4 md:p-5">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground"
          >
            {initials}
          </span>
          <div>
            <p className="text-base font-semibold text-foreground">
              {business.ownerName || user?.name || 'My Account'}
            </p>
            <p className="text-sm text-muted-foreground">
              {business.businessType || 'Contractor Profile'}
              {business.location ? ` · ${business.location}` : ''}
            </p>
          </div>
        </Panel>

        {/* Business details */}
        <Panel
          title="Business details"
          action={
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit Details
            </Link>
          }
        >
          <dl className="divide-y text-sm">
            {details.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-4 py-3.5 md:px-5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd
                  className={`text-right font-medium ${
                    v === 'Not set' ? 'italic text-muted-foreground' : 'text-foreground'
                  }`}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      {/* Sign Out Confirmation Modal */}
      {isConfirmingSignOut ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsConfirmingSignOut(false)
          }}
        >
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl md:p-6">
            <div className="flex items-start gap-3.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <LogOut className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="signout-modal-title" className="text-base font-semibold text-foreground">
                  Sign Out
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Are you sure you want to sign out of FlowMint? You will need to log in again to access your dashboard.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t pt-3.5">
              <button
                type="button"
                onClick={() => setIsConfirmingSignOut(false)}
                className={buttonClass('outline')}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmingSignOut(false)
                  logout()
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
