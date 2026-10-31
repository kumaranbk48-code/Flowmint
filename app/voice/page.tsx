import type { Metadata } from 'next'
import { VoiceView } from '@/components/voice/voice-view'

export const metadata: Metadata = { title: 'Voice Entry — FlowMint' }

export default function Page() {
  return <VoiceView />
}
