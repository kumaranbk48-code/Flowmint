'use client'

import { useCallback, useRef, useState } from 'react'

export type RecorderStatus = 'idle' | 'recording' | 'transcribing' | 'error'

export function useMediaRecorderVoice({
  onFinal,
}: {
  onFinal: (text: string) => void
}) {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState<number>(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const maxRecordTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const speechDetectedRef = useRef<boolean>(false)
  const lastSpeechTimeRef = useRef<number>(0)
  const isCancelledRef = useRef<boolean>(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const stopCapture = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (maxRecordTimeoutRef.current) {
      clearTimeout(maxRecordTimeoutRef.current)
      maxRecordTimeoutRef.current = null
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setAudioLevel(0)
  }, [])

  const start = useCallback(async () => {
    stopCapture()
    setError(null)
    chunksRef.current = []
    speechDetectedRef.current = false
    lastSpeechTimeRef.current = Date.now()
    isCancelledRef.current = false

    try {
      // 1. High-efficiency mono 16kHz speech audio constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      // 2. High-speed lightweight compression: 24kbps opus (~15-20 KB for 5s of speech)
      let options: MediaRecorderOptions = { audioBitsPerSecond: 24000 }
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          options.mimeType = 'audio/webm;codecs=opus'
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          options.mimeType = 'audio/webm'
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options.mimeType = 'audio/mp4'
        }
      }

      const recorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (!isCancelledRef.current && e.data && e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        stopCapture()
        if (isCancelledRef.current) {
          setStatus('idle')
          return
        }

        const chunks = chunksRef.current
        if (chunks.length === 0) {
          setStatus('idle')
          return
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 600) {
          // Extremely short or empty recording
          setStatus('idle')
          setError('No voice recorded. Please tap and speak clearly.')
          return
        }

        setStatus('transcribing')

        try {
          const ac = new AbortController()
          abortControllerRef.current = ac

          // 30-second client network timeout (prevents premature abort on mobile/cellular latency)
          const fetchTimeout = setTimeout(() => {
            ac.abort()
          }, 30000)

          const fd = new FormData()
          fd.append('audio', blob, 'recording.webm')

          const res = await fetch('/api/voice/transcribe', {
            method: 'POST',
            body: fd,
            signal: ac.signal,
          })

          clearTimeout(fetchTimeout)

          if (isCancelledRef.current) {
            setStatus('idle')
            return
          }

          const data = await res.json()
          if (!res.ok || !data.success) {
            setStatus('error')
            setError(data.error || 'Failed to extract text.')
            return
          }

          setStatus('idle')
          if (data.transcript) {
            onFinal(data.transcript)
          } else {
            setError('Could not understand the audio. Please try again.')
          }
        } catch (err: any) {
          if (isCancelledRef.current) {
            setStatus('idle')
            return
          }
          setStatus('error')
          setError(
            err.name === 'AbortError'
              ? 'Transcription timed out. Please try speaking again.'
              : err.message || 'Network error processing voice.'
          )
        } finally {
          abortControllerRef.current = null
        }
      }

      // 3. Audio level visualizer and precise 3-second silence detector
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        const level = Math.min(100, Math.round((avg / 128) * 100))
        setAudioLevel(level)

        const now = Date.now()

        // Speech detected: level > 8 indicates human voice
        if (level > 8) {
          speechDetectedRef.current = true
          lastSpeechTimeRef.current = now
        } else if (speechDetectedRef.current) {
          // Wait for exactly 3.0 continuous seconds of silence after speaking
          const silenceDurationMs = now - lastSpeechTimeRef.current
          if (silenceDurationMs >= 3000) {
            if (recorder.state === 'recording') {
              recorder.stop()
              return
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(checkVolume)
      }

      // Safety guard: max 30 seconds of recording so user has plenty of time
      maxRecordTimeoutRef.current = setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop()
        }
      }, 30000)

      recorder.start(200) // slice chunks every 200ms
      setStatus('recording')
      checkVolume()
    } catch (err: any) {
      stopCapture()
      setStatus('error')
      setError(err.message || 'Could not access microphone.')
    }
  }, [onFinal, stopCapture])

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    } else {
      stopCapture()
      setStatus('idle')
    }
  }, [stopCapture])

  const cancel = useCallback(() => {
    isCancelledRef.current = true
    chunksRef.current = []
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop()
      } catch {}
    }
    stopCapture()
    setStatus('idle')
    setError(null)
  }, [stopCapture])

  return {
    status,
    error,
    audioLevel,
    start,
    stop,
    cancel,
  }
}
