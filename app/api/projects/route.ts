import { NextResponse } from 'next/server'
import { deleteDbProject, getDbProjects, saveDbProject } from '@/lib/supabase/ledger-db'
import { getAuthenticatedUser } from '@/lib/security/session'
import { apiRateLimiter } from '@/lib/security/rate-limit'
import { sanitizeString, validateAmount, validateIsoDate } from '@/lib/security/validation'
import { TODAY } from '@/lib/data'

export async function GET(req: Request) {
  try {
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized: Session missing or expired.' }, { status: 401 })
    }

    const rateCheck = apiRateLimiter.check(auth.userId)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429 },
      )
    }

    // Always fetch strictly for the authenticated user, ignoring any query parameter
    const projects = await getDbProjects(auth.userId)
    return NextResponse.json({ projects })
  } catch (err) {
    console.error('Error fetching projects:', err)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized: Session missing or expired.' }, { status: 401 })
    }

    const rateCheck = apiRateLimiter.check(auth.userId)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429 },
      )
    }

    const body = await req.json()
    const { project } = body

    if (!project || typeof project !== 'object') {
      return NextResponse.json({ error: 'Missing required project data' }, { status: 400 })
    }

    const name = sanitizeString(project.name, 120)
    const client = sanitizeString(project.client, 100)

    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }
    if (!client) {
      return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
    }

    const contractCheck = validateAmount(project.contractValue || 0)
    const contractValue = contractCheck.valid ? contractCheck.amount : 0
    const startDate = validateIsoDate(project.startDate) || TODAY
    const expectedCompletionDate = project.expectedCompletionDate
      ? validateIsoDate(project.expectedCompletionDate) || undefined
      : undefined

    const sanitizedProject = {
      name,
      client,
      contractValue,
      startDate,
      expectedCompletionDate,
    }

    const saved = await saveDbProject(auth.userId, sanitizedProject)
    return NextResponse.json({ success: true, project: saved })
  } catch (err) {
    console.error('Error saving project:', err)
    return NextResponse.json({ error: 'Failed to save project' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized: Session missing or expired.' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    // Delete strictly where user_id matches authenticated session
    const success = await deleteDbProject(auth.userId, projectId.trim())
    return NextResponse.json({ success })
  } catch (err) {
    console.error('Error deleting project:', err)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
