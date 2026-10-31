import { NextResponse } from 'next/server'
import { parseVoiceEntry } from '@/lib/parse-voice'
import { getDbProjects } from '@/lib/supabase/ledger-db'
import { getAuthenticatedUser } from '@/lib/security/session'
import { getClientIp, voiceRateLimiter } from '@/lib/security/rate-limit'
import { sanitizeString, validateAmount } from '@/lib/security/validation'
import type { Project } from '@/lib/data'

export async function POST(req: Request) {
  try {
    // 1. Enforce Authentication
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to parse voice entries.' },
        { status: 401 },
      )
    }

    // 2. Enforce Rate Limiting
    const rateIdentifier = auth.userId || getClientIp(req)
    const rateCheck = voiceRateLimiter.check(rateIdentifier)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Voice parsing rate limit exceeded. Please wait ${rateCheck.resetInSeconds} seconds.` },
        { status: 429 },
      )
    }

    const body = await req.json()
    const { transcript, projects } = body

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'Missing transcript string' }, { status: 400 })
    }

    // Sanitize and limit transcript length (Max 1000 characters)
    const safeTranscript = sanitizeString(transcript, 1000)
    if (!safeTranscript) {
      return NextResponse.json({ error: 'Transcript cannot be empty' }, { status: 400 })
    }

    // 3. Obtain genuine user projects from database to prevent prompt injection / tampering
    let projectList: Project[] = []
    try {
      projectList = await getDbProjects(auth.userId)
    } catch {
      // Fall back safely to client-provided projects if DB query is interrupted
      projectList = Array.isArray(projects) ? projects : []
    }

    // 4. Try local instant parse first
    let parsed = parseVoiceEntry(safeTranscript, projectList)

    // 5. If amount is missing or sentence was spoken in Tamil / Tanglish / Hindi, use Gemini AI
    const apiKey = process.env.GEMINI_API_KEY
    if ((!parsed.amount || parsed.missingProject) && apiKey) {
      try {
        const prompt = `You are a ledger extraction assistant for an Indian building contractor.
Extract the transaction details from this speech transcript (which may be in English, Tamil, Tanglish, or Hindi):
"${safeTranscript}"

Available Projects: ${JSON.stringify(
          projectList.map((p) => ({ id: p.id, name: p.name, client: p.client })),
        )}

Rules:
- Understand Indian numbers (e.g. Tamil: "pathayiram"=10000, "anjaayiram"=5000, "rendaayiram"=2000, "latcham"=100000; Hindi: "pachas hazar"=50000).
- Understand Indian action words (e.g. Tamil: "vangune/vaanginen"=income, "kuduthen/selavu"=expense; Hindi: "mila"=income, "diya"=expense).
- Do NOT invent or hallucinate third-party personal contact names.
- Output JSON ONLY in this format:
{
  "type": "income" or "expense",
  "amount": number or null,
  "category": "Client Payment" | "Worker Payment" | "Cement" | "Steel" | "Sand & aggregate" | "Food & tea" | "Fuel" | "Other",
  "party": string or null,
  "projectName": string or null,
  "projectId": string or null,
  "method": "cash" | "upi" | "bank" | "cheque" | null
}`

        const aiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0 },
            }),
          },
        )

        if (aiRes.ok) {
          const aiData = await aiRes.json()
          const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
          if (text) {
            const parsedJson = JSON.parse(text)
            const amtCheck = validateAmount(parsedJson.amount)
            if (amtCheck.valid) {
              const matchedProj = projectList.find(
                (p) =>
                  p.id === parsedJson.projectId ||
                  (parsedJson.projectName &&
                    (p.name.toLowerCase().includes(parsedJson.projectName.toLowerCase()) ||
                      parsedJson.projectName.toLowerCase().includes(p.name.toLowerCase()))),
              )

              const isDaily =
                parsedJson.category === 'Food & tea' ||
                parsedJson.category === 'Fuel' ||
                parsedJson.category === 'Travel & Transport' ||
                parsedJson.category === 'Office & Misc'

              const reqProj =
                !isDaily &&
                (parsedJson.type === 'income' ||
                  parsedJson.category === 'Worker Payment' ||
                  parsedJson.category === 'Cement' ||
                  parsedJson.category === 'Steel')

              const missingProj = reqProj && !matchedProj
              const missingFields: ('type' | 'amount' | 'project' | 'method')[] = []
              if (!amtCheck.valid) missingFields.push('amount')
              if (missingProj) missingFields.push('project')
              if (!parsedJson.method) missingFields.push('method')

              parsed = {
                type: parsedJson.type === 'income' ? 'income' : 'expense',
                amount: amtCheck.amount,
                category: sanitizeString(
                  parsedJson.category || (parsedJson.type === 'income' ? 'Client Payment' : 'Other'),
                  60,
                ),
                party: sanitizeString(
                  parsedJson.party ||
                    (matchedProj ? matchedProj.name : parsedJson.type === 'income' ? 'Client' : 'Daily expense'),
                  100,
                ),
                projectName: matchedProj ? matchedProj.name : null,
                projectId: matchedProj ? matchedProj.id : null,
                method: parsedJson.method || null,
                date: null,
                description: sanitizeString(
                  `${parsedJson.category || 'Transaction'}${matchedProj ? ' — ' + matchedProj.name : ''}`,
                  255,
                ),
                isDailyExpense: isDaily,
                requiresProject: reqProj,
                missingProject: missingProj,
                missingFields,
              }
            }
          }
        }
      } catch (aiErr: unknown) {
        console.warn('[Voice Parse] AI fallback error occurred')
      }
    }

    return NextResponse.json({
      success: true,
      transcript: safeTranscript,
      parsed,
    })
  } catch (err: unknown) {
    console.error('Error parsing voice transcript:', err)
    return NextResponse.json({ error: 'Failed to process voice transcript' }, { status: 500 })
  }
}
