import Image from 'next/image'
import { cn } from '@/lib/utils'

export function FlowMintLogo({
  size = 32,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt="FlowMint Logo"
        width={size}
        height={size}
        priority
        className="size-full object-contain"
      />
    </div>
  )
}

export const SiteFlowLogo = FlowMintLogo
