import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, HandCoins, Mic } from 'lucide-react'
import type { Project, Transaction, TxType } from '@/lib/data'
import { formatSigned, methodLabel, typeLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  eyebrow?: string
}) {
  return (
    <div className="flex flex-col gap-4 border-b bg-background px-4 pb-5 pt-6 sm:flex-row sm:items-end sm:justify-between md:px-8 md:pt-8">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-[0_1px_2px_oklch(0.2_0.01_60/0.04)]', className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

const typeStyles: Record<TxType, { icon: typeof ArrowDownLeft; chip: string; text: string }> = {
  income: { icon: ArrowDownLeft, chip: 'bg-income-soft text-income', text: 'text-income' },
  expense: { icon: ArrowUpRight, chip: 'bg-expense-soft text-expense', text: 'text-foreground' },
  wage: { icon: HandCoins, chip: 'bg-wage-soft text-wage', text: 'text-foreground' },
}

export function TypeIcon({ type, category, className }: { type: TxType; category?: string; className?: string }) {
  const isWorker = category === 'Worker Payment' || category === 'Weekly wages' || type === 'wage'
  const style = isWorker ? typeStyles.wage : typeStyles[type]
  const Icon = style.icon
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', style.chip, className)}>
      <Icon className="size-4" aria-hidden="true" />
      <span className="sr-only">{isWorker ? 'Worker Payment' : typeLabel[type]}</span>
    </span>
  )
}

export function TypeBadge({ type, category }: { type: TxType; category?: string }) {
  const isWorker = category === 'Worker Payment' || category === 'Weekly wages' || type === 'wage'
  const style = isWorker ? typeStyles.wage : typeStyles[type]
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', style.chip)}>
      {isWorker ? 'Worker Payment' : typeLabel[type]}
    </span>
  )
}

export function Amount({ tx, className }: { tx: Pick<Transaction, 'amount' | 'type'>; className?: string }) {
  return (
    <span className={cn('num font-semibold', typeStyles[tx.type].text, className)}>
      {formatSigned(tx.amount, tx.type)}
    </span>
  )
}

export function TransactionRow({ tx, project }: { tx: Transaction; project?: Project; key?: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 md:px-5">
      <TypeIcon type={tx.type} category={tx.category} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tx.party || tx.category}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="truncate">{project ? project.name : 'All sites'}</span>
          <span aria-hidden="true">·</span>
          <span>{tx.category}</span>
          {tx.source === 'voice' ? (
            <>
              <span aria-hidden="true">·</span>
              <Mic className="size-3 shrink-0" aria-label="Recorded by voice" />
            </>
          ) : null}
        </p>
      </div>
      <div className="text-right">
        <Amount tx={tx} className="text-sm" />
        <p className="mt-0.5 text-xs text-muted-foreground">{methodLabel[tx.method]}</p>
      </div>
    </li>
  )
}

export function ButtonLink({
  href,
  children,
  variant = 'outline',
  className,
}: {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'outline' | 'ghost'
  className?: string
}) {
  return (
    <Link href={href} className={cn(buttonClass(variant), className)}>
      {children}
    </Link>
  )
}

export function buttonClass(variant: 'primary' | 'outline' | 'ghost' = 'outline', size: 'md' | 'lg' = 'md') {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
    size === 'md' ? 'h-9 px-3.5' : 'h-11 px-5',
    variant === 'primary' && 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
    variant === 'outline' && 'border bg-card text-foreground hover:bg-secondary',
    variant === 'ghost' && 'text-muted-foreground hover:bg-secondary hover:text-foreground',
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border bg-secondary p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors',
            value === o.value && 'bg-card text-foreground shadow-sm',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
