'use client'

import type React from 'react'
import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Coins,
  HelpCircle,
  Mic,
  Pencil,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'
import { Amount, buttonClass, PageHeader, Panel, TypeIcon } from '@/components/ledger-ui'
import { useMediaRecorderVoice } from '@/hooks/use-media-recorder-voice'
import { TODAY, type PayMethod, type Project, type Transaction, type TxType } from '@/lib/data'
import { formatMoney, methodLabel, typeLabel } from '@/lib/format'
import { parseSpokenAmount, type ParsedEntry } from '@/lib/parse-voice'
import { cn } from '@/lib/utils'
import { ReviewForm } from './review-form'

const EXAMPLES = [
  'Received one lakh fifty thousand from Sharma Residence.',
  'Paid eight thousand to workers.',
]

type ParsedState = {
  type: TxType
  amount: number | null
  projectName: string | null
  projectId: string | null
  category: string
  party: string
  method: PayMethod | null
  date: string
  description: string
  isDailyExpense: boolean
  requiresProject: boolean
  missingProject: boolean
  missingFields: ('type' | 'amount' | 'project' | 'method')[]
}

type Stage =
  | { kind: 'capture' }
  | { kind: 'loading'; transcript: string }
  | { kind: 'missing_info'; transcript: string; parsed: ParsedState; missingField: 'project' | 'amount' | 'method' }
  | { kind: 'confirmation'; transcript: string; parsed: ParsedState; isEditing: boolean }
  | { kind: 'saved'; tx: Transaction }

export function VoiceView() {
  const { projects, transactions, addTransaction, isOnline } = useLedger()
  const [stage, setStage] = useState<Stage>({ kind: 'capture' })
  const [isSaving, setIsSaving] = useState(false)
  const [selectedLang, setSelectedLang] = useState<'en-IN' | 'ta-IN'>('en-IN')
  const activeProjects: Project[] = (projects || []).filter((p: Project) => p.status === 'active')

  // Check and advance to next missing field or confirmation
  const advanceMissing = useCallback(
    (parsedState: ParsedState, transcript: string) => {
      // 1. Amount is compulsory
      if (!parsedState.amount || parsedState.amount <= 0) {
        setStage({
          kind: 'missing_info',
          transcript,
          parsed: parsedState,
          missingField: 'amount',
        })
        return
      }

      // 2. Project is compulsory if required by category (materials, labor, client payment) and active projects exist
      if (parsedState.missingProject && activeProjects.length > 0) {
        setStage({
          kind: 'missing_info',
          transcript,
          parsed: parsedState,
          missingField: 'project',
        })
        return
      }

      // 3. Payment Method is compulsory (do not assume!)
      if (!parsedState.method) {
        setStage({
          kind: 'missing_info',
          transcript,
          parsed: parsedState,
          missingField: 'method',
        })
        return
      }

      // All compulsory info present -> Proceed directly to Confirmation
      setStage({
        kind: 'confirmation',
        transcript,
        parsed: parsedState,
        isEditing: false,
      })
    },
    [activeProjects],
  )

  // Core processing function: Takes spoken or typed text and calls AI parse endpoint
  const processTranscript = useCallback(
    async (text: string) => {
      const cleanText = text.trim()
      if (!cleanText) return

      setStage({ kind: 'loading', transcript: cleanText })

      try {
        const res = await fetch('/api/voice/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: cleanText, projects }),
        })

        const data = await res.json()
        if (!res.ok || !data?.parsed) {
          throw new Error('AI parse failed')
        }

        const raw = data.parsed

        const parsedState: ParsedState = {
          type: raw.type === 'income' ? 'income' : 'expense',
          amount: raw.amount || null,
          projectName: raw.projectName || null,
          projectId: raw.projectId || null,
          category: raw.category || (raw.type === 'income' ? 'Client Payment' : 'Other'),
          party:
            raw.party ||
            (raw.category === 'Worker Payment'
              ? 'Site Workers'
              : raw.type === 'income'
                ? 'Client'
                : 'Daily expense'),
          method: raw.method || null,
          date: TODAY,
          description: raw.description || cleanText,
          isDailyExpense: !!raw.isDailyExpense,
          requiresProject: !!raw.requiresProject,
          missingProject: !!raw.missingProject,
          missingFields: raw.missingFields || [],
        }

        advanceMissing(parsedState, cleanText)
      } catch (err) {
        console.error('Error processing voice entry:', err)
        // Fallback: Show manual review form
        setStage({
          kind: 'confirmation',
          transcript: cleanText,
          parsed: {
            type: 'expense',
            amount: null,
            projectName: null,
            projectId: null,
            category: 'Other',
            party: '',
            method: 'cash',
            date: TODAY,
            description: cleanText,
            isDailyExpense: false,
            requiresProject: false,
            missingProject: false,
            missingFields: ['amount'],
          },
          isEditing: true,
        })
      }
    },
    [projects, advanceMissing],
  )

  // Primary Voice Recognition Hook via MediaRecorder & Gemini AI
  const mediaVoice = useMediaRecorderVoice({
    onFinal: (text) => {
      processTranscript(text)
    },
  })

  const isRecording = mediaVoice.status === 'recording'
  const isTranscribing = mediaVoice.status === 'transcribing'
  const listening = isRecording

  // MediaRecorder voice answering for missing info (e.g. saying amount, project name, payment method)
  const missingMediaVoice = useMediaRecorderVoice({
    onFinal: (spokenAnswer) => {
      if (stage.kind !== 'missing_info') return
      const spoken = spokenAnswer.toLowerCase().trim()

      // 1. Voice answering Amount
      if (stage.missingField === 'amount') {
        const parsedAmt = parseSpokenAmount(spokenAnswer)
        if (parsedAmt && parsedAmt > 0) {
          const updated: ParsedState = {
            ...stage.parsed,
            amount: parsedAmt,
          }
          advanceMissing(updated, stage.transcript)
          return
        }
      }

      // 2. Voice answering Project
      if (stage.missingField === 'project') {
        if (
          spoken.includes('no project') ||
          spoken.includes('general') ||
          spoken.includes('daily') ||
          spoken.includes('regular') ||
          spoken.includes('none')
        ) {
          const updated: ParsedState = {
            ...stage.parsed,
            projectId: null,
            projectName: null,
            missingProject: false,
            isDailyExpense: true,
          }
          advanceMissing(updated, stage.transcript)
          return
        }

        const matched = activeProjects.find((p) => {
          const pName = p.name.toLowerCase()
          const pClient = p.client.toLowerCase()
          return (
            spoken.includes(pName) ||
            pName.includes(spoken) ||
            spoken.includes(pClient) ||
            p.name.split(/\s+/).some((w) => w.length > 3 && spoken.includes(w.toLowerCase()))
          )
        })

        if (matched) {
          const updated: ParsedState = {
            ...stage.parsed,
            projectId: matched.id,
            projectName: matched.name,
            missingProject: false,
            description:
              stage.parsed.category === 'Worker Payment'
                ? `Worker payment for ${matched.name}`
                : `${stage.parsed.category} — ${matched.name}`,
          }
          advanceMissing(updated, stage.transcript)
          return
        }
      }

      // 3. Voice answering Payment Method
      if (stage.missingField === 'method') {
        let detected: PayMethod | null = null
        if (/\b(upi|gpay|google pay|phonepe|paytm|qr|online)\b/i.test(spoken)) {
          detected = 'upi'
        } else if (/\b(bank|transfer|neft|rtgs|imps|netbanking|account)\b/i.test(spoken)) {
          detected = 'bank'
        } else if (/\b(cash|in cash|by cash|hand|rokad)\b/i.test(spoken)) {
          detected = 'cash'
        } else if (/\b(cheque|check)\b/i.test(spoken)) {
          detected = 'cheque'
        }

        if (detected) {
          const updated: ParsedState = {
            ...stage.parsed,
            method: detected,
          }
          advanceMissing(updated, stage.transcript)
          return
        }
      }

      // Fallback: re-process combined sentence with new info
      processTranscript(`${stage.transcript} ${spokenAnswer}`)
    },
  })

  const missingListening = missingMediaVoice.status === 'recording'
  const missingTranscribing = missingMediaVoice.status === 'transcribing'
  const todaysVoice: Transaction[] = transactions.filter(
    (t: Transaction) => t.date === TODAY && t.source === 'voice',
  )

  // Confirm and Save action
  const handleConfirmSave = async (txData: {
    type: TxType
    amount: number
    projectId: string | null
    category: string
    party: string
    method: PayMethod
    date: string
    description?: string
  }) => {
    if (isSaving) return
    setIsSaving(true)

    try {
      const saved = await addTransaction({
        type: txData.type,
        amount: txData.amount,
        date: txData.date || TODAY,
        projectId: txData.projectId,
        category: txData.category,
        party: txData.party,
        method: txData.method,
        description: txData.description,
        source: 'voice',
        transcript: stage.kind === 'confirmation' ? stage.transcript : undefined,
      })

      setStage({ kind: 'saved', tx: saved })
    } catch (err: unknown) {
      console.error('Failed to confirm and save transaction:', err)
      const msg = err instanceof Error ? err.message : 'Failed to save transaction.'
      alert(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Voice Entry"
        description="Speak your client payments, worker wages, and site expenses. We’ll extract the details for you to confirm."
      />

      <div className="grid gap-5 px-4 py-5 md:gap-6 md:px-8 md:py-7 xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* STAGE 1: VOICE CAPTURE */}
          {stage.kind === 'capture' && (
            <Panel bodyClassName="flex flex-col items-center px-4 py-8 text-center md:py-12">
              {/* Language Selector */}
              {!listening && (
                <div className="mb-6 inline-flex items-center rounded-xl border border-input bg-card p-1 text-xs shadow-2xs">
                  <span className="px-2.5 py-1 text-muted-foreground font-medium">Spoken Accent:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedLang('en-IN')}
                    className={cn(
                      'rounded-lg px-3 py-1 font-semibold transition-all',
                      selectedLang === 'en-IN'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    English (India)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLang('ta-IN')}
                    className={cn(
                      'rounded-lg px-3 py-1 font-semibold transition-all',
                      selectedLang === 'ta-IN'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Tamil
                  </button>
                </div>
              )}

              {/* Offline Warning Notice */}
              {!isOnline && (
                <div className="mb-6 flex max-w-sm items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs text-amber-900 dark:text-amber-200 animate-in fade-in">
                  <WifiOff className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-semibold">Voice requires internet connection</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      You can add transactions manually from the Dashboard with local device saving.
                    </p>
                  </div>
                </div>
              )}

              {/* STAGE 1: VOICE CAPTURE & TEST 3 UI */}
              <div className="relative flex items-center justify-center">
                {listening ? (
                  <>
                    <span className="voice-ring pointer-events-none absolute size-32 rounded-full bg-primary" aria-hidden="true" />
                    <span
                      className="voice-ring pointer-events-none absolute size-32 rounded-full bg-primary [animation-delay:0.8s]"
                      aria-hidden="true"
                    />
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (isRecording) {
                      mediaVoice.stop()
                    } else if (isTranscribing) {
                      // wait for transcription
                    } else {
                      mediaVoice.start()
                    }
                  }}
                  disabled={isTranscribing}
                  aria-pressed={isRecording}
                  aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                  className={cn(
                    'relative flex size-32 items-center justify-center rounded-full text-primary-foreground shadow-xl transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 active:scale-95',
                    isRecording
                      ? 'bg-foreground shadow-foreground/20'
                      : isTranscribing
                        ? 'bg-primary/70 animate-pulse'
                        : 'bg-primary shadow-primary/30 hover:bg-primary/90',
                  )}
                >
                  {isRecording ? (
                    <Square className="size-9 fill-current" aria-hidden="true" />
                  ) : isTranscribing ? (
                    <div className="flex flex-col items-center">
                      <span className="size-8 rounded-full border-3 border-white border-t-transparent animate-spin" />
                    </div>
                  ) : (
                    <Mic className="size-12" aria-hidden="true" />
                  )}
                </button>
              </div>

              <p className="mt-8 text-lg font-semibold tracking-tight text-foreground" aria-live="polite">
                {isRecording
                  ? `Recording… speak now (${mediaVoice.audioLevel}%)`
                  : isTranscribing
                    ? 'Extracting text…'
                    : 'Tap the microphone and speak'}
              </p>

              {/* Active Recording Controls: Cancel & Finish */}
              {isRecording && (
                <div className="mt-5 flex items-center justify-center gap-3 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={() => mediaVoice.cancel()}
                    className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-2.5 text-sm font-semibold text-destructive shadow-2xs transition-all hover:bg-destructive hover:text-destructive-foreground active:scale-95"
                    aria-label="Cancel recording"
                  >
                    <X className="size-4" aria-hidden="true" />
                    <span>Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => mediaVoice.stop()}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-2xs transition-all hover:bg-primary/90 active:scale-95"
                    aria-label="Finish and process transaction"
                  >
                    <Square className="size-3.5 fill-current" aria-hidden="true" />
                    <span>Finish & Extract</span>
                  </button>
                </div>
              )}

              {/* Transcribing Cancel Option */}
              {isTranscribing && (
                <div className="mt-4 animate-in fade-in duration-150">
                  <button
                    type="button"
                    onClick={() => mediaVoice.cancel()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                    <span>Cancel</span>
                  </button>
                </div>
              )}

              {/* Voice Error Display */}
              {mediaVoice.error && !isRecording && !isTranscribing && (
                <div className="mt-4 flex max-w-md items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs font-semibold text-destructive animate-in fade-in">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{mediaVoice.error}</span>
                </div>
              )}
            </Panel>
          )}

          {/* STAGE 1.5: LOADING AI PARSE */}
          {stage.kind === 'loading' && (
            <Panel bodyClassName="flex flex-col items-center px-4 py-12 text-center md:py-16">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-7 animate-pulse" />
              </div>
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                You said
              </p>
              <blockquote className="mt-1 max-w-md text-base font-semibold text-foreground">
                “{stage.transcript}”
              </blockquote>
              <p className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="size-2 animate-ping rounded-full bg-primary" />
                Extracting transaction details…
              </p>
            </Panel>
          )}

          {/* STAGE 2: MISSING INFORMATION FLOW (Section 9) */}
          {stage.kind === 'missing_info' && (
            <Panel>
              {/* You said transcript */}
              <div className="border-b bg-surface/40 px-4 py-4 md:px-6">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  You said
                </p>
                <blockquote className="mt-1 text-base font-semibold text-foreground">
                  “{stage.transcript}”
                </blockquote>
              </div>

              {/* One thing I need block */}
              <div className="flex flex-col items-center px-4 py-8 text-center md:px-8 md:py-10">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <HelpCircle className="size-6" />
                </span>

                <h3 className="mt-3 text-xs font-bold uppercase tracking-wider text-primary">
                  One thing I need
                </h3>

                {stage.missingField === 'project' && (
                  <>
                    <p className="mt-1 text-lg font-bold tracking-tight text-foreground md:text-xl">
                      Which project was this payment for?
                    </p>
                    <p className="mt-1 max-w-md text-xs text-muted-foreground">
                      Tap a project below or tap the microphone to speak the project name.
                    </p>

                    {/* Project Choices (Buttons) */}
                    <div className="mt-6 flex flex-wrap justify-center gap-2.5 max-w-lg">
                      {activeProjects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            const updated: ParsedState = {
                              ...stage.parsed,
                              projectId: p.id,
                              projectName: p.name,
                              missingProject: false,
                              description:
                                stage.parsed.category === 'Worker Payment'
                                  ? `Worker payment for ${p.name}`
                                  : `${stage.parsed.category} — ${p.name}`,
                            }
                            advanceMissing(updated, stage.transcript)
                          }}
                          className="flex items-center gap-2 rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-2xs transition-all hover:border-primary hover:bg-primary-soft/40 hover:text-primary active:scale-95"
                        >
                          <Building2 className="size-4 text-primary" />
                          <span>{p.name}</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            ({p.client})
                          </span>
                        </button>
                      ))}

                      {/* General / No Project Option */}
                      <button
                        type="button"
                        onClick={() => {
                          const updated: ParsedState = {
                            ...stage.parsed,
                            projectId: null,
                            projectName: null,
                            missingProject: false,
                            isDailyExpense: true,
                          }
                          advanceMissing(updated, stage.transcript)
                        }}
                        className="rounded-xl border border-dashed border-input bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        No Project (General Expense)
                      </button>
                    </div>

                    {/* Voice Mic for answering project */}
                    <div className="mt-8 flex flex-col items-center gap-2">
                      <div className="relative flex items-center justify-center">
                        {missingListening && (
                          <span className="voice-ring pointer-events-none absolute size-14 rounded-full bg-primary" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            missingListening
                              ? missingMediaVoice.stop()
                              : missingMediaVoice.start()
                          }
                          disabled={missingTranscribing}
                          className={cn(
                            'relative flex size-14 items-center justify-center rounded-full text-primary-foreground shadow-md transition-all active:scale-95',
                            missingListening ? 'bg-foreground' : 'bg-primary hover:bg-primary/90',
                          )}
                          aria-label="Speak project name"
                        >
                          {missingListening ? (
                            <Square className="size-5 fill-current" />
                          ) : missingTranscribing ? (
                            <span className="size-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          ) : (
                            <Mic className="size-6" />
                          )}
                        </button>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {missingListening
                          ? `Recording… speak now (${missingMediaVoice.audioLevel}%)`
                          : missingTranscribing
                            ? 'Extracting text…'
                            : 'Or tap mic to say project name'}
                      </span>

                      {/* Cancel while speaking in missing info */}
                      {missingListening && (
                        <div className="mt-2 flex items-center gap-2 animate-in fade-in duration-150">
                          <button
                            type="button"
                            onClick={() => missingMediaVoice.cancel()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground active:scale-95"
                          >
                            <X className="size-3.5" aria-hidden="true" />
                            <span>Cancel</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => missingMediaVoice.stop()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95"
                          >
                            <Square className="size-3 fill-current" aria-hidden="true" />
                            <span>Finish</span>
                          </button>
                        </div>
                      )}

                      {missingTranscribing && (
                        <div className="mt-1 animate-in fade-in duration-150">
                          <button
                            type="button"
                            onClick={() => missingMediaVoice.cancel()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95"
                          >
                            <X className="size-3" aria-hidden="true" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      )}

                      {missingMediaVoice.error && !missingListening && !missingTranscribing && (
                        <div className="mt-2 flex max-w-sm items-center gap-1.5 text-xs text-destructive animate-in fade-in">
                          <AlertCircle className="size-3.5 shrink-0" />
                          <span>{missingMediaVoice.error}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* 2. Missing Field: Amount (Supports BOTH Voice & Text options) */}
                {stage.missingField === 'amount' && (
                  <div className="flex w-full max-w-sm flex-col items-center gap-3">
                    <p className="mt-1 text-lg font-bold tracking-tight text-foreground md:text-xl">
                      What was the amount?
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tap mic to speak the amount (e.g. &ldquo;8000&rdquo; or &ldquo;Ten thousand&rdquo;) or type below.
                    </p>

                    {/* Voice Mic for Amount */}
                    <div className="my-2 flex flex-col items-center gap-2">
                      <div className="relative flex items-center justify-center">
                        {missingListening && (
                          <span className="voice-ring pointer-events-none absolute size-14 rounded-full bg-primary" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            missingListening
                              ? missingMediaVoice.stop()
                              : missingMediaVoice.start()
                          }
                          disabled={missingTranscribing}
                          className={cn(
                            'relative flex size-14 items-center justify-center rounded-full text-primary-foreground shadow-md transition-all active:scale-95',
                            missingListening ? 'bg-foreground' : 'bg-primary hover:bg-primary/90',
                          )}
                          aria-label="Speak amount"
                        >
                          {missingListening ? (
                            <Square className="size-5 fill-current" />
                          ) : missingTranscribing ? (
                            <span className="size-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          ) : (
                            <Mic className="size-6" />
                          )}
                        </button>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {missingListening
                          ? `Recording… speak amount now (${missingMediaVoice.audioLevel}%)`
                          : missingTranscribing
                            ? 'Extracting text…'
                            : 'Tap mic and say amount'}
                      </span>

                      {/* Cancel & Finish buttons */}
                      {missingListening && (
                        <div className="mt-1 flex items-center gap-2 animate-in fade-in duration-150">
                          <button
                            type="button"
                            onClick={() => missingMediaVoice.cancel()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground active:scale-95"
                          >
                            <X className="size-3.5" />
                            <span>Cancel</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => missingMediaVoice.stop()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95"
                          >
                            <Square className="size-3 fill-current" />
                            <span>Done</span>
                          </button>
                        </div>
                      )}

                      {missingTranscribing && (
                        <div className="mt-1 animate-in fade-in duration-150">
                          <button
                            type="button"
                            onClick={() => missingMediaVoice.cancel()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95"
                          >
                            <X className="size-3" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      )}

                      {missingMediaVoice.error && !missingListening && !missingTranscribing && (
                        <div className="mt-1 flex max-w-xs items-center gap-1.5 text-xs text-destructive animate-in fade-in">
                          <AlertCircle className="size-3.5 shrink-0" />
                          <span>{missingMediaVoice.error}</span>
                        </div>
                      )}
                    </div>

                    {/* Numeric Input & Quick Chips */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        const input = (e.currentTarget.elements.namedItem('amountInput') as HTMLInputElement)
                        const val = parseFloat(input?.value)
                        if (val > 0) {
                          const updated: ParsedState = {
                            ...stage.parsed,
                            amount: val,
                          }
                          advanceMissing(updated, stage.transcript)
                        }
                      }}
                      className="flex w-full flex-col gap-2.5"
                    >
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
                          ₹
                        </span>
                        <input
                          name="amountInput"
                          type="number"
                          placeholder="e.g. 8000"
                          autoFocus
                          className="h-12 w-full rounded-xl border border-input bg-card pl-8 pr-3 text-lg font-bold outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                        />
                      </div>

                      {/* Quick Amount Chips */}
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {[500, 1000, 2000, 5000, 10000, 50000].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => {
                              const updated: ParsedState = {
                                ...stage.parsed,
                                amount: amt,
                              }
                              advanceMissing(updated, stage.transcript)
                            }}
                            className="rounded-lg border border-input bg-secondary/60 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary active:scale-95"
                          >
                            +₹{amt >= 1000 ? `${amt / 1000}k` : amt}
                          </button>
                        ))}
                      </div>

                      <button
                        type="submit"
                        className={cn(buttonClass('primary', 'lg'), 'w-full')}
                      >
                        Confirm Amount
                      </button>
                    </form>
                  </div>
                )}

                {/* 3. Missing Field: Payment Method (Supports BOTH Voice & 1-Tap Buttons) */}
                {stage.missingField === 'method' && (
                  <div className="flex w-full max-w-sm flex-col items-center gap-3">
                    <p className="mt-1 text-lg font-bold tracking-tight text-foreground md:text-xl">
                      How was this payment made?
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tap payment mode below or speak into the microphone (&ldquo;Cash&rdquo;, &ldquo;UPI&rdquo;, &ldquo;Bank&rdquo;, &ldquo;Cheque&rdquo;).
                    </p>

                    {/* Voice Mic for Method */}
                    <div className="my-2 flex flex-col items-center gap-2">
                      <div className="relative flex items-center justify-center">
                        {missingListening && (
                          <span className="voice-ring pointer-events-none absolute size-14 rounded-full bg-primary" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            missingListening
                              ? missingMediaVoice.stop()
                              : missingMediaVoice.start()
                          }
                          disabled={missingTranscribing}
                          className={cn(
                            'relative flex size-14 items-center justify-center rounded-full text-primary-foreground shadow-md transition-all active:scale-95',
                            missingListening ? 'bg-foreground' : 'bg-primary hover:bg-primary/90',
                          )}
                          aria-label="Speak payment method"
                        >
                          {missingListening ? (
                            <Square className="size-5 fill-current" />
                          ) : missingTranscribing ? (
                            <span className="size-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          ) : (
                            <Mic className="size-6" />
                          )}
                        </button>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {missingListening
                          ? `Recording… speak payment mode (${missingMediaVoice.audioLevel}%)`
                          : missingTranscribing
                            ? 'Extracting text…'
                            : 'Tap mic and say: Cash / UPI / Bank / Cheque'}
                      </span>

                      {/* Cancel & Finish buttons */}
                      {missingListening && (
                        <div className="mt-1 flex items-center gap-2 animate-in fade-in duration-150">
                          <button
                            type="button"
                            onClick={() => missingMediaVoice.cancel()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground active:scale-95"
                          >
                            <X className="size-3.5" />
                            <span>Cancel</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => missingMediaVoice.stop()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95"
                          >
                            <Square className="size-3 fill-current" />
                            <span>Done</span>
                          </button>
                        </div>
                      )}

                      {missingTranscribing && (
                        <div className="mt-1 animate-in fade-in duration-150">
                          <button
                            type="button"
                            onClick={() => missingMediaVoice.cancel()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95"
                          >
                            <X className="size-3" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      )}

                      {missingMediaVoice.error && !missingListening && !missingTranscribing && (
                        <div className="mt-1 flex max-w-xs items-center gap-1.5 text-xs text-destructive animate-in fade-in">
                          <AlertCircle className="size-3.5 shrink-0" />
                          <span>{missingMediaVoice.error}</span>
                        </div>
                      )}
                    </div>

                    {/* 4 1-Tap Payment Buttons */}
                    <div className="grid w-full grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          const updated: ParsedState = { ...stage.parsed, method: 'cash' }
                          advanceMissing(updated, stage.transcript)
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl border border-input bg-card p-3.5 text-sm font-bold text-foreground shadow-2xs hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
                      >
                        <Coins className="size-4 text-emerald-600" />
                        <span>Cash</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const updated: ParsedState = { ...stage.parsed, method: 'upi' }
                          advanceMissing(updated, stage.transcript)
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl border border-input bg-card p-3.5 text-sm font-bold text-foreground shadow-2xs hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 active:scale-95 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                      >
                        <Wallet className="size-4 text-blue-600" />
                        <span>UPI / GPay</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const updated: ParsedState = { ...stage.parsed, method: 'bank' }
                          advanceMissing(updated, stage.transcript)
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl border border-input bg-card p-3.5 text-sm font-bold text-foreground shadow-2xs hover:border-purple-500 hover:bg-purple-50 hover:text-purple-700 active:scale-95 dark:hover:bg-purple-950/30 dark:hover:text-purple-400"
                      >
                        <Building2 className="size-4 text-purple-600" />
                        <span>Bank Transfer</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const updated: ParsedState = { ...stage.parsed, method: 'cheque' }
                          advanceMissing(updated, stage.transcript)
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl border border-input bg-card p-3.5 text-sm font-bold text-foreground shadow-2xs hover:border-amber-500 hover:bg-amber-50 hover:text-amber-700 active:scale-95 dark:hover:bg-amber-950/30 dark:hover:text-amber-400"
                      >
                        <Check className="size-4 text-amber-600" />
                        <span>Cheque</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t bg-surface/30 px-4 py-3 flex justify-start">
                <button
                  type="button"
                  onClick={() => setStage({ kind: 'capture' })}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Start over</span>
                </button>
              </div>
            </Panel>
          )}

          {/* STAGE 3: EXTRACTION CONFIRMATION UI (Section 10) */}
          {stage.kind === 'confirmation' && (
            <Panel>
              {/* You said transcript header */}
              <div className="border-b bg-surface/40 px-4 py-4 md:px-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    You said
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setStage((prev) =>
                        prev.kind === 'confirmation'
                          ? { ...prev, isEditing: !prev.isEditing }
                          : prev,
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <Pencil className="size-3" />
                    <span>{stage.isEditing ? 'View summary' : 'Edit details'}</span>
                  </button>
                </div>
                <blockquote className="mt-1 text-base font-semibold text-foreground">
                  “{stage.transcript}”
                </blockquote>
              </div>

              {stage.isEditing ? (
                /* Editable Form Mode */
                <ReviewForm
                  parsed={{
                    type: stage.parsed.type,
                    amount: stage.parsed.amount,
                    projectName: stage.parsed.projectName,
                    projectId: stage.parsed.projectId,
                    category: stage.parsed.category,
                    party: stage.parsed.party,
                    method: stage.parsed.method,
                    date: stage.parsed.date,
                    description: stage.parsed.description,
                    isDailyExpense: stage.parsed.isDailyExpense,
                    requiresProject: stage.parsed.requiresProject,
                    missingProject: stage.parsed.missingProject,
                    missingFields: stage.parsed.missingFields,
                  }}
                  transcript={stage.transcript}
                  projects={activeProjects}
                  onCancel={() =>
                    setStage((prev) =>
                      prev.kind === 'confirmation' ? { ...prev, isEditing: false } : prev,
                    )
                  }
                  onSave={(tx) => handleConfirmSave(tx)}
                />
              ) : (
                /* Detected Summary Card (Section 10 requirement) */
                <div className="p-4 md:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      <Sparkles className="size-3.5" />
                      Detected Details
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Confirm below to add to cashbook
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {/* Type */}
                    <div className="rounded-xl border bg-surface/40 p-3.5">
                      <span className="text-[11px] font-medium text-muted-foreground">Type</span>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-foreground">
                        {stage.parsed.type === 'income' ? (
                          <>
                            <span className="flex size-4 items-center justify-center rounded-full bg-income text-primary-foreground">
                              <ArrowDownLeft className="size-3" />
                            </span>
                            <span className="text-income">Income (Credit)</span>
                          </>
                        ) : (
                          <>
                            <span className="flex size-4 items-center justify-center rounded-full bg-foreground text-background">
                              <ArrowUpRight className="size-3" />
                            </span>
                            <span>Expense (Debit)</span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* Amount */}
                    <div className="rounded-xl border bg-surface/40 p-3.5">
                      <span className="text-[11px] font-medium text-muted-foreground">Amount</span>
                      <p className="num mt-1 text-lg font-black text-foreground">
                        {formatMoney(stage.parsed.amount || 0)}
                      </p>
                    </div>

                    {/* Project */}
                    <div className="rounded-xl border bg-surface/40 p-3.5">
                      <span className="text-[11px] font-medium text-muted-foreground">Project</span>
                      <p className="mt-1 text-sm font-bold text-foreground truncate">
                        {stage.parsed.projectId ? (
                          <span className="text-primary font-bold">
                            {stage.parsed.projectName ||
                              projects.find((p) => p.id === stage.parsed.projectId)?.name}
                          </span>
                        ) : (
                          <span className="italic font-normal text-muted-foreground">
                            None (Daily Expense)
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Category */}
                    <div className="rounded-xl border bg-surface/40 p-3.5">
                      <span className="text-[11px] font-medium text-muted-foreground">Category</span>
                      <p className="mt-1 text-sm font-semibold text-foreground truncate">
                        {stage.parsed.category}
                      </p>
                    </div>

                    {/* Paid to / Received from */}
                    <div className="rounded-xl border bg-surface/40 p-3.5">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {stage.parsed.type === 'income' ? 'Received from' : 'Paid to'}
                      </span>
                      <p className="mt-1 text-sm font-semibold text-foreground truncate">
                        {stage.parsed.party || (stage.parsed.type === 'income' ? 'Client' : 'Workers')}
                      </p>
                    </div>

                    {/* Payment Method */}
                    <div className="rounded-xl border bg-surface/40 p-3.5">
                      <span className="text-[11px] font-medium text-muted-foreground">Payment Method</span>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-foreground capitalize">
                        <Wallet className="size-3.5 text-muted-foreground" />
                        <span>{stage.parsed.method ? (methodLabel[stage.parsed.method] || stage.parsed.method) : 'Cash'}</span>
                      </p>
                    </div>
                  </div>

                  {/* Actions: Confirm & Save, Edit, Discard */}
                  <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => setStage({ kind: 'capture' })}
                      className={cn(buttonClass('ghost'), 'w-full sm:w-auto')}
                    >
                      Discard
                    </button>

                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={() =>
                          setStage((prev) =>
                            prev.kind === 'confirmation' ? { ...prev, isEditing: true } : prev,
                          )
                        }
                        className={cn(buttonClass('outline'), 'flex-1 sm:flex-initial')}
                      >
                        <Pencil className="size-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSaving || !stage.parsed.amount}
                        onClick={() =>
                          handleConfirmSave({
                            type: stage.parsed.type,
                            amount: stage.parsed.amount || 0,
                            projectId: stage.parsed.projectId,
                            category: stage.parsed.category,
                            party: stage.parsed.party,
                            method: stage.parsed.method || 'cash',
                            date: stage.parsed.date || TODAY,
                            description: stage.parsed.description,
                          })
                        }
                        className={cn(buttonClass('primary', 'lg'), 'flex-1 sm:flex-initial px-6 shadow-md')}
                      >
                        <Check className="size-4" />
                        <span>{isSaving ? 'Saving…' : 'Confirm & Save'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          )}

          {/* STAGE 4: ENTRY SAVED */}
          {stage.kind === 'saved' && (
            <Panel bodyClassName="flex flex-col items-center px-4 py-10 text-center md:py-12">
              <span className="flex size-14 items-center justify-center rounded-full bg-income-soft text-income shadow-sm">
                <CheckCircle2 className="size-8" aria-hidden="true" />
              </span>
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-income">
                Successfully recorded
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground md:text-2xl">
                Transaction Saved to Ledger
              </h2>
              <p className="num mt-2 text-3xl font-black tracking-tight text-foreground md:text-4xl">
                <Amount tx={stage.tx} />
              </p>
              <p className="mt-2 text-xs text-muted-foreground md:text-sm">
                {typeLabel[stage.tx.type as keyof typeof typeLabel]} · {stage.tx.party || stage.tx.category} ·{' '}
                {projects.find((p: Project) => p.id === stage.tx.projectId)?.name ?? 'General (No Project)'} ·{' '}
                {methodLabel[stage.tx.method]}
              </p>

              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setStage({ kind: 'capture' })
                    mediaVoice.start()
                  }}
                  className={cn(buttonClass('primary', 'lg'), 'shadow-sm')}
                >
                  <Mic className="size-4" aria-hidden="true" />
                  <span>Record another entry</span>
                </button>
                <Link href="/" className={buttonClass('outline', 'lg')}>
                  View Dashboard
                </Link>
                <Link href="/reports" className={buttonClass('outline', 'lg')}>
                  Reports
                </Link>
              </div>
            </Panel>
          )}

          {/* EXAMPLES LIST ON CAPTURE SCREEN */}
          {stage.kind === 'capture' && (
            <Panel title="Try saying">
              <ul className="divide-y">
                {EXAMPLES.map((ex: string) => (
                  <li key={ex}>
                    <button
                      type="button"
                      onClick={() => processTranscript(ex)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs transition-colors hover:bg-surface/60 md:px-5 md:text-sm"
                    >
                      <span className="text-pretty text-foreground">“{ex}”</span>
                      <span className="shrink-0 text-xs font-semibold text-primary">Try this</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {/* SIDEBAR: GUIDANCE & TODAY'S VOICE RECORDED */}
        <aside className="flex flex-col gap-5">
          <Panel title="What to mention in voice" bodyClassName="px-4 py-4 md:px-5">
            <ol className="flex flex-col gap-3 text-xs md:text-sm">
              {(
                [
                  ['Money In or Out', 'received, advance, paid, spent, wages'],
                  ['Amount in Rupees', '1.5 lakh · 8,000 · 800 · 250'],
                  ['Building Project', 'Sharma Residence, Iyer villa, or none for fuel/tea'],
                  ['Payment Method', 'cash, UPI / GPay, bank transfer, cheque'],
                ] as const
              ).map(([title, hint]: readonly [string, string], i: number) => (
                <li key={title} className="flex gap-3">
                  <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">{title}</p>
                    <p className="text-muted-foreground">{hint}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel
            title="Recorded by voice today"
            action={<span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">{todaysVoice.length}</span>}
          >
            {todaysVoice.length ? (
              <ul className="divide-y max-h-96 overflow-y-auto">
                {todaysVoice.map((tx: Transaction) => (
                  <li key={tx.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                    <TypeIcon type={tx.type} className="size-8 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {tx.description || tx.party || tx.category}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {tx.time || 'Today'} · {methodLabel[tx.method]}
                      </p>
                    </div>
                    <Amount tx={tx} className="text-xs font-bold" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground md:px-5">
                No voice entries recorded today yet.
              </p>
            )}
            <div className="border-t bg-surface/30 px-4 py-3 text-xs text-muted-foreground md:px-5 flex justify-between">
              <span>Today’s voice entries</span>
              <span className="num font-semibold text-foreground">
                {todaysVoice.length} logged
              </span>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  )
}
