import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/security/session'
import { getClientIp, voiceRateLimiter } from '@/lib/security/rate-limit'
import { validateAudioUpload } from '@/lib/security/validation'

// High-speed multimodal speech transcription models (in priority order for speed & reliability)
const CANDIDATE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.5-transcribe',
  'gemini-3.6-flash',
]

export async function POST(req: Request) {
  try {
    // 1. Enforce Authentication
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to use voice transcription.' },
        { status: 401 },
      )
    }

    // 2. Enforce Rate Limiting (25 requests/min per user or IP)
    const rateIdentifier = auth.userId || getClientIp(req)
    const rateCheck = voiceRateLimiter.check(rateIdentifier)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Voice transcription rate limit exceeded. Please wait ${rateCheck.resetInSeconds} seconds.` },
        { status: 429 },
      )
    }

    // 3. Verify Server-Side API Key Configuration
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Voice transcription service is temporarily unconfigured. Please contact support.' },
        { status: 503 },
      )
    }

    // 4. Validate Uploaded Audio Payload (Max 10MB, strictly audio MIME)
    const formData = await req.formData()
    const file = formData.get('audio') as Blob | null

    const fileValidation = validateAudioUpload(file, 10 * 1024 * 1024)
    if (!fileValidation.valid) {
      return NextResponse.json({ error: fileValidation.error || 'Invalid audio file' }, { status: 400 })
    }

    const rawMime = file!.type || 'audio/webm'
    const mimeType = rawMime.split(';')[0] || 'audio/webm'
    const arrayBuffer = await file!.arrayBuffer()
    const base64Audio = Buffer.from(arrayBuffer).toString('base64')

    const promptText =
      'You are an accurate verbatim speech-to-text transcriber for an Indian contractor finance application. Transcribe the spoken audio in Indian English, Tamil, Tanglish, or Hindi verbatim into plain text. Accurately capture Indian names, amounts (numbers, lakh, thousands, pathayiram, aayiram), and payment modes (cash, UPI, cheque). Output ONLY the exact transcribed words with no quotes, no markdown, and no commentary.'

    let succeeded = false
    let transcriptText = ''
    let modelUsed = ''

    // 5. Try candidate models in sequence with x-goog-api-key header (Key NEVER exposed in query string)
    for (const model of CANDIDATE_MODELS) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 14000)

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inlineData: {
                        mimeType,
                        data: base64Audio,
                      },
                    },
                    {
                      text: promptText,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.0,
                maxOutputTokens: 200,
              },
            }),
          },
        )

        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
          text = text.replace(/^["'“”]+|["'“”]+$/g, '').trim()

          if (text) {
            succeeded = true
            transcriptText = text
            modelUsed = model
            break
          }
        } else {
          console.warn(`[Voice Transcribe] Model ${model} returned HTTP ${response.status}`)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Network error'
        console.warn(`[Voice Transcribe] Model ${model} fetch attempt failed:`, msg)
      }
    }

    if (succeeded) {
      return NextResponse.json({ success: true, transcript: transcriptText, modelUsed })
    }

    return NextResponse.json(
      { error: 'Transcription could not be completed at this time. Please speak clearly and try again.' },
      { status: 502 },
    )
  } catch (err: unknown) {
    console.error('Error in /api/voice/transcribe:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred while transcribing audio.' },
      { status: 500 },
    )
  }
}
