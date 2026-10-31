'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives?: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: any) => void) | null
  onerror: ((e: { error: string; message?: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  onaudiostart?: (() => void) | null
  onsoundstart?: (() => void) | null
  onspeechstart?: (() => void) | null
  onspeechend?: (() => void) | null
  onaudioend?: (() => void) | null
}

type RecognitionCtor = new () => Recognition

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const subscribe = () => () => {}

export type SpeechStatus = 'idle' | 'listening' | 'error'

export function useSpeechRecognition({
  onFinal,
  lang = 'en-IN',
}: {
  onFinal: (text: string) => void
  lang?: string
}) {
  const supported = useSyncExternalStore(
    subscribe,
    () => getCtor() !== null,
    () => false,
  )
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<Recognition | null>(null)
  const transcriptRef = useRef('')
  const isListeningRef = useRef(false)
  const isStoppingRef = useRef(false)
  const onFinalRef = useRef(onFinal)
  const langRef = useRef(lang)

  useEffect(() => {
    onFinalRef.current = onFinal
  }, [onFinal])

  useEffect(() => {
    langRef.current = lang
  }, [lang])

  // Stop listening cleanly and submit captured speech
  const stop = useCallback(() => {
    if (!recRef.current) return
    isStoppingRef.current = true
    isListeningRef.current = false
    setStatus('idle')

    try {
      recRef.current.stop()
    } catch {
      try {
        recRef.current.abort()
      } catch {}
    }
  }, [])

  // Cancel and discard
  const cancel = useCallback(() => {
    isStoppingRef.current = true
    isListeningRef.current = false
    transcriptRef.current = ''
    setTranscript('')
    setStatus('idle')
    setError(null)

    if (recRef.current) {
      const rec = recRef.current
      rec.onstart = null
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
      try {
        rec.abort()
      } catch {}
      recRef.current = null
    }
  }, [])

  // Start speech recognition
  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) {
      console.error('SPEECH_RECOGNITION_ERROR: not supported')
      setError('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.')
      setStatus('error')
      return
    }

    console.log('SPEECH_RECOGNITION_SUPPORTED')

    // Clean up any lingering recognition first
    if (recRef.current) {
      const prev = recRef.current
      prev.onstart = null
      prev.onresult = null
      prev.onerror = null
      prev.onend = null
      try {
        prev.abort()
      } catch {}
      recRef.current = null
    }

    transcriptRef.current = ''
    setTranscript('')
    setError(null)
    isStoppingRef.current = false
    isListeningRef.current = true

    try {
      const rec = new Ctor()
      rec.lang = langRef.current || 'en-IN'
      // Single utterance mode is the standard, most reliable mode in Web Speech API
      rec.continuous = false
      rec.interimResults = true
      rec.maxAlternatives = 3

      // Keep strong window reference so Chrome V8 never garbage-collects the instance while awaiting network response
      if (typeof window !== 'undefined') {
        ;(window as any).__speechRecognitionInstance = rec
      }

      rec.onstart = () => {
        console.log('SPEECH_RECOGNITION_STARTED')
        isListeningRef.current = true
        setStatus('listening')
        setError(null)
      }

      rec.onaudiostart = () => {
        console.log('SPEECH_AUDIO_START: Audio capture started.')
      }

      rec.onspeechstart = () => {
        console.log('SPEECH_HUMAN_VOICE_DETECTED: Speech detected by browser VAD.')
      }

      rec.onspeechend = () => {
        console.log('SPEECH_ENDED: User stopped speaking. Awaiting cloud transcription…')
      }

      let hangTimeout: NodeJS.Timeout | null = null

      rec.onaudioend = () => {
        console.log('SPEECH_AUDIO_END: Audio stream closed. Waiting for Google response…')
        hangTimeout = setTimeout(() => {
          if (!transcriptRef.current.trim() && isListeningRef.current) {
            console.warn('SPEECH_RECOGNITION_TIMEOUT: Google speech service did not respond within 7s.')
            setStatus('error')
            setError('Google Speech recognition service did not respond. Your network, ISP, or VPN is blocking Google Speech endpoints.')
            try {
              rec.abort()
            } catch {}
          }
        }, 7000)
      }

      rec.onresult = (e: any) => {
        if (hangTimeout) clearTimeout(hangTimeout)
        console.log(`SPEECH_RESULT_EVENT: results=${e.results.length}, index=${e.resultIndex}`)
        let text = ''
        for (let i = 0; i < e.results.length; i++) {
          const item = e.results[i]
          if (item && item[0]) {
            console.log(`Result[${i}]: "${item[0].transcript}" (final: ${item.isFinal}, confidence: ${item[0].confidence})`)
            text += item[0].transcript
          }
        }
        const clean = text.trim()
        if (clean) {
          console.log('SPEECH_RESULT_RECEIVED: ' + clean)
          transcriptRef.current = clean
          setTranscript(clean)
        }
      }

      rec.onerror = (e: any) => {
        if (hangTimeout) clearTimeout(hangTimeout)
        console.warn('SPEECH_RECOGNITION_ERROR: ' + e.error)
        isListeningRef.current = false

        if (e.error === 'aborted') {
          // Aborted is normal when user cancels or stops
          setStatus('idle')
          return
        }

        if (e.error === 'no-speech') {
          // If we already captured some words, don't show an error! Let onend process them
          if (transcriptRef.current.trim()) {
            setStatus('idle')
            return
          }
          setStatus('idle')
          setError('No voice detected (no-speech). Your microphone hardware is muted (muted: true). Please press your laptop mic unmute button (dedicated Mic key / Fn+F9) or unmute in Windows Sound Settings.')
          return
        }

        setStatus('error')

        if (e.error === 'network') {
          setError('Google Speech recognition service unreachable. Your network, VPN, or ad-blocker may be blocking Google endpoints.')
          return
        }

        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setError('Microphone permission blocked. Please allow microphone access in your browser address bar.')
          return
        }

        if (e.error === 'audio-capture') {
          setError('No microphone found or mic is busy. Please check your Windows Sound Settings.')
          return
        }

        setError(`Microphone error (${e.error}). Tap to retry or type below.`)
      }

      rec.onend = () => {
        if (hangTimeout) clearTimeout(hangTimeout)
        console.log('SPEECH_RECOGNITION_ENDED')
        isListeningRef.current = false
        setStatus('idle')
        recRef.current = null

        const textToSubmit = transcriptRef.current.trim()
        if (textToSubmit) {
          onFinalRef.current(textToSubmit)
        }
      }

      recRef.current = rec
      rec.start()
    } catch (err: any) {
      console.error('SPEECH_RECOGNITION_ERROR: start failed', err)
      isListeningRef.current = false
      setStatus('error')
      setError('Could not start microphone. Please check browser permissions.')
    }
  }, [])

  useEffect(() => {
    return () => {
      if (recRef.current) {
        const rec = recRef.current
        rec.onstart = null
        rec.onresult = null
        rec.onerror = null
        rec.onend = null
        try {
          rec.abort()
        } catch {}
        recRef.current = null
      }
    }
  }, [])

  return {
    supported,
    status,
    interim: transcript,
    finalTranscript: transcript,
    totalTranscript: transcript,
    error,
    start,
    stop,
    cancel,
  }
}
