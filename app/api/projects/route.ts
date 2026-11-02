import { NextResponse } from 'next/server'
import { ConflictError, deleteDbProject, getDbProjects, saveDbProject } from '@/lib/supabase/ledger-db'
import { guard, isResponse, readJson } from '@/lib/security/api-guard'
import { sanitizeString, validateAmount, validateIsoDate, validateUuid } from '@/lib/security/validation'

const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status })

export async function GET(req: Request) {
  const g = guard(req)
  if (isResponse(g)) return g
  try {
    const projects = await getDbProjects(g.userId)
    return NextResponse.json({ projects })
  } catch (err) {
    console.error('Error fetching projects:', err)
    return bad('Failed to fetch projects', 500)
  }
}

export async function POST(req: Request) {
  const g = guard(req)
  if (isResponse(g)) return g
  try {
    const body = await readJson(req)
    const p = body?.project as Record<string, unknown> | undefined
    if (!p || typeof p !== 'object') return bad('Invalid project payload')

    const name = sanitizeString(p.name, 120)
    const client = sanitizeString(p.client, 100)
    if (!name) return bad('Project name is required')
    if (!client) return bad('Client name is required')

    // A contract value must be a real number (0 is allowed: "not yet agreed"); never silently coerced to 0.
    const contract = validateAmount(p.contractValue, { allowZero: true })
    if (!contract.valid) return bad(contract.error || 'Invalid contract value')

    const startDate = validateIsoDate(p.startDate)
    if (!startDate) return bad('Invalid start date')

    let expectedCompletionDate: string | undefined
    if (p.expectedCompletionDate !== undefined && p.expectedCompletionDate !== null && p.expectedCompletionDate !== '') {
      const end = validateIsoDate(p.expectedCompletionDate)
      if (!end) return bad('Invalid expected completion date')
      if (end < startDate) return bad('Expected completion date cannot be before the start date')
      expectedCompletionDate = end
    }

    let id: string | undefined
    if (p.id !== undefined && p.id !== null) {
      const valid = validateUuid(p.id)
      if (!valid) return bad('Invalid project id')
      id = valid
    }

    const { project, created } = await saveDbProject(g.userId, {
      id,
      name,
      client,
      contractValue: contract.amount,
      startDate,
      expectedCompletionDate,
    })
    return NextResponse.json({ project, duplicate: !created }, { status: created ? 201 : 200 })
  } catch (err) {
    if (err instanceof ConflictError) return bad(err.message, 409)
    console.error('Error creating project:', err)
    return bad('Failed to create project', 500)
  }
}

export async function DELETE(req: Request) {
  const g = guard(req)
  if (isResponse(g)) return g
  try {
    const id = validateUuid(new URL(req.url).searchParams.get('id'))
    if (!id) return bad('Invalid project id')

    const result = await deleteDbProject(g.userId, id)
    if (result === 'not_found') return bad('Project not found', 404)
    if (result === 'has_transactions') {
      return bad('This project has transactions and cannot be deleted. Its money would disappear from the project reports.', 409, {
        code: 'PROJECT_HAS_TRANSACTIONS',
      })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting project:', err)
    return bad('Failed to delete project', 500)
  }
}
