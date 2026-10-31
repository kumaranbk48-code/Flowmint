import type { PayMethod, Project, TxType } from './data'

export type ParsedEntry = {
  type: TxType
  amount: number | null
  projectName: string | null
  projectId: string | null
  category: string
  party: string
  method: PayMethod | null
  date: string | null
  description: string
  isDailyExpense: boolean
  requiresProject: boolean
  missingProject: boolean
  missingFields: ('type' | 'amount' | 'project' | 'method')[]
}

const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Tamil / Hindi common transliterations (omitted English 'do' collision)
  onnu: 1, rendu: 2, moonu: 3, naalu: 4, anju: 5, aaru: 6, ezhu: 7, ettu: 8, ombadhu: 9, pathu: 10,
  ek: 1, don: 2, teen: 3, char: 4, paanch: 5, che: 6, saat: 7, aath: 8, nau: 9, das: 10,
}

const SCALE_WORDS: Record<string, number> = {
  crore: 10000000, crores: 10000000, cr: 10000000,
  lakh: 100000, lakhs: 100000, lac: 100000, lacs: 100000, latcham: 100000,
  thousand: 1000, thousands: 1000, aayiram: 1000, hazar: 1000,
  hundred: 100, hundreds: 100, nooru: 100, sau: 100,
}

export function parseSpokenAmount(text: string): number | null {
  if (!text) return null
  let norm = text
    .toLowerCase()
    .replace(/₹|\brs\.?\b|\brupees?\b|\broobai\b/gi, ' ')
    .replace(/,/g, '')
    .replace(/[-]/g, ' ')

  // Normalize "one and a half lakh", "two and a half lakh", "half a lakh"
  norm = norm
    .replace(/\b(\w+|\d+)\s+and\s+a\s+half\s+(?:lakhs?|lacs?|lac)\b/gi, (match, prefix) => {
      const num = NUM_WORDS[prefix] !== undefined ? NUM_WORDS[prefix] : parseFloat(prefix)
      return !isNaN(num) ? `${num + 0.5} lakh` : match
    })
    .replace(/\bhalf\s+(?:a\s+)?(?:lakhs?|lacs?|lac)\b/gi, '50000')

  // Remove common count prefixes so "for plot 24" or "one worker" does not steal the amount
  norm = norm.replace(/\b(?:plot|flat|door|site|pillar)\s+\d+\b/gi, ' ')
  norm = norm.replace(/\b(?:one|two|three|\d+)\s+(?:workers?|men|labourers?|coolies?)\b/gi, ' ')

  // 1. Decimal lakhs: e.g. "1.5 lakh", "2.25 lakhs"
  const decLakh = norm.match(/(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?|lac|latcham)\b/i)
  if (decLakh) {
    const base = parseFloat(decLakh[1]) * 100000
    const after = norm.slice(norm.indexOf(decLakh[0]) + decLakh[0].length)
    const extra = parseSpokenAmount(after)
    return Math.round(base + (extra || 0))
  }

  // 2. Abbreviated k: e.g. "50k", "8.5k"
  const kMatch = norm.match(/(\d+(?:\.\d+)?)\s*k\b/i)
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1]) * 1000)
  }

  // 3. Look for explicit action currency anchors (paid 8000, received 50000, spent 800)
  const actionAnchor = norm.match(/\b(?:paid|spent|received|receive|advance|got|amount|cost)\s+(\d+(?:\.\d+)?)\b/i)
  if (actionAnchor) {
    const val = parseFloat(actionAnchor[1])
    if (!isNaN(val) && val > 0) return Math.round(val)
  }

  // 4. Word-based token compound parser (e.g. "eight thousand", "one lakh fifty thousand")
  const tokens = norm.replace(/\band\b/g, ' ').split(/\s+/).filter(Boolean)
  let total = 0
  let current = 0
  let foundAny = false

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!isNaN(Number(t))) {
      current += Number(t)
      foundAny = true
    } else if (NUM_WORDS[t] !== undefined) {
      current += NUM_WORDS[t]
      foundAny = true
    } else if (SCALE_WORDS[t] !== undefined) {
      foundAny = true
      const mult = SCALE_WORDS[t]
      if (current === 0) current = 1
      if (mult >= 1000) {
        total += current * mult
        current = 0
      } else {
        current = current * mult
      }
    } else {
      if (foundAny && (total > 0 || current > 0)) {
        break
      }
    }
  }

  total += current
  if (foundAny && total > 0) return total

  // 5. Standalone digits fallback: pick the largest valid number if multiple exist
  const allDigits = Array.from(norm.matchAll(/\b(\d+(?:\.\d+)?)\b/g))
    .map((m) => parseFloat(m[1]))
    .filter((v) => !isNaN(v) && v > 0)

  if (allDigits.length > 0) {
    return Math.round(allDigits[allDigits.length - 1]) // Prefer the final stated number
  }

  return null
}

function extractSpokenParty(
  original: string,
  matchedProject: Project | null,
  category: string,
  type: TxType
): string {
  // 1. Explicit "from <party>" (e.g. "from Sharma Residence", "from Suresh", "from client")
  const fromMatch = original.match(/\bfrom\s+([A-Za-z0-9\s&'-]+?)(?:\s+(?:for|at|on|towards|via|by|through|in\b|\d|\$|₹|rs\.?|$))/i)
  if (fromMatch && fromMatch[1].trim()) {
    const candidate = fromMatch[1].trim().replace(/^(the|our|my|a|an)\s+/i, '')
    if (candidate && candidate.length > 1) {
      return candidate
    }
  }

  // 2. Explicit "in/at <vendor>" (e.g. "in tea shop", "at petrol bunk", "at bakery")
  const inAtMatch = original.match(/\b(?:in|at)\s+(?:the\s+)?([A-Za-z0-9\s&'-]+?)(?:\s+(?:for|towards|on|by|via|\d|\$|₹|rs\.?|$))/i)
  if (inAtMatch && inAtMatch[1].trim()) {
    const candidate = inAtMatch[1].trim().replace(/^(the|our|my|a|an)\s+/i, '')
    const ignoreList = ['cash', 'upi', 'bank', 'site', 'the site', 'morning', 'evening', 'today', 'yesterday', 'hand']
    if (candidate && !ignoreList.includes(candidate.toLowerCase())) {
      return candidate
    }
  }

  // 3. Explicit "to <party>" (e.g. "to workers", "to Suresh", "to cement shop")
  const toMatch = original.match(/\bto\s+([A-Za-z0-9\s&'-]+?)(?:\s+(?:for|at|on|towards|via|by|through|in\b|\d|\$|₹|rs\.?|$))/i)
  if (toMatch && toMatch[1].trim()) {
    const candidate = toMatch[1].trim().replace(/^(the|our|my|a|an)\s+/i, '')
    const ignoreList = ['site', 'the site', 'work', 'office']
    if (candidate && !ignoreList.includes(candidate.toLowerCase())) {
      return candidate
    }
  }

  // 4. If matched project was spoken, use the project name verbatim (NEVER invent personal client names)
  if (matchedProject) {
    return matchedProject.name
  }

  // 5. Default natural party labels based on category without hallucinating third parties
  if (category === 'Worker Payment') return 'Site Workers'
  if (category === 'Food & tea') return 'Tea Shop'
  if (category === 'Fuel') return 'Fuel'
  if (category === 'Travel & Transport') return 'Transport'

  return type === 'income' ? 'Client' : 'Daily Expense'
}

export function parseVoiceEntry(transcript: string, projects: Project[] = []): ParsedEntry {
  const text = transcript.toLowerCase()

  // 1. Detect Type (Income vs Expense)
  let type: TxType = 'expense'
  const isIncome =
    /\b(received|receive|credited|advance from|payment from|client paid|credit)\b/i.test(text) ||
    /\bgot\s+(?:advance|payment|money|cash|cheque|transfer|amount)\b/i.test(text)

  if (isIncome) {
    type = 'income'
  }

  // 2. Parse Amount
  const amount = parseSpokenAmount(transcript)

  // 3. Intelligent Category & Scope Classification (Regular Daily vs Project Expenses)
  let category = 'Other'
  let isDailyExpense = false
  let requiresProject = false

  // A. Regular Daily Expenses (Do NOT require a project)
  if (/\b(tea|chai|coffee|food|lunch|snack|snacks|meal|tiffin|breakfast|canteen|bakery|tea shop|biscuit)\b/i.test(text)) {
    category = 'Food & tea'
    isDailyExpense = true
    requiresProject = false
  } else if (/\b(petrol|diesel|fuel|gas|cng)\b/i.test(text)) {
    category = 'Fuel'
    isDailyExpense = true
    requiresProject = false
  } else if (/\b(auto|bus|taxi|cab|toll|parking|fare|transport|rickshaw)\b/i.test(text)) {
    category = 'Travel & Transport'
    isDailyExpense = true
    requiresProject = false
  } else if (/\b(xerox|print|photocopy|recharge|mobile|courier|stationery|pen|paper|office)\b/i.test(text)) {
    category = 'Office & Misc'
    isDailyExpense = true
    requiresProject = false
  } else if (/\b(broom|bucket|rope|drinking water|can water|tape|poly sheet|gloves)\b/i.test(text)) {
    category = 'Daily consumables'
    isDailyExpense = true
    requiresProject = false
  }
  // B. Project Expenses (Require a project)
  else if (type === 'income') {
    category = 'Client Payment'
    requiresProject = true
  } else if (/\b(worker|workers|wage|wages|salary|coolie|kooli|weekly pay|labor|labour|mason|carpenter|painter|helper|bar bender|mistri|shuttering)\b/i.test(text)) {
    category = 'Worker Payment'
    requiresProject = true
  } else if (/\b(cement|ultratech|acc|dalmia|ramco|coromandel|bags?)\b/i.test(text)) {
    category = 'Cement'
    requiresProject = true
  } else if (/\b(steel|rod|tmt|iron|bar|binding wire)\b/i.test(text)) {
    category = 'Steel'
    requiresProject = true
  } else if (/\b(sand|aggregate|gravel|m-?sand|p-?sand|jelly|blue metal|dust)\b/i.test(text)) {
    category = 'Sand & aggregate'
    requiresProject = true
  } else if (/\b(brick|bricks|block|blocks|solid block|hollow block|aac|interlock)\b/i.test(text)) {
    category = 'Bricks & blocks'
    requiresProject = true
  } else if (/\b(tile|tiles|paint|granite|marble|finish|putty|primer)\b/i.test(text)) {
    category = 'Tiles & finishes'
    requiresProject = true
  } else if (/\b(wire|electric|switch|cable|conduit|mcb|light)\b/i.test(text)) {
    category = 'Electrical'
    requiresProject = true
  } else if (/\b(pipe|plumb|tap|tank|cpvc|upvc|pvc|fittings)\b/i.test(text)) {
    category = 'Plumbing'
    requiresProject = true
  } else if (/\b(rent|hire|jcb|mixer|scaffold|centering|vibrator|crane|tractor)\b/i.test(text)) {
    category = 'Equipment rent'
    requiresProject = true
  } else if (/\b(subcontractor|fabrication|welding|glass work|aluminum|waterproofing)\b/i.test(text)) {
    category = 'Subcontractor'
    requiresProject = true
  } else if (/\b(tool|tools|hardware|shovel|hammer)\b/i.test(text)) {
    category = 'Tools'
  }

  // 4. Match Project (Target project phrase "for [project]" takes priority)
  let matchedProject: Project | null = null

  // A. Check explicit project target phrase: "for Sharma Residence", "at ...", "from Sharma Residence"
  for (const p of projects) {
    const pName = p.name.toLowerCase()
    if (
      text.includes(`for ${pName}`) ||
      text.includes(`at ${pName}`) ||
      text.includes(`site ${pName}`) ||
      text.includes(`from ${pName}`)
    ) {
      matchedProject = p
      break
    }
  }

  // B. Full project name match anywhere in transcript
  if (!matchedProject) {
    for (const p of projects) {
      if (text.includes(p.name.toLowerCase())) {
        matchedProject = p
        break
      }
    }
  }

  // C. Client name match only if explicitly mentioned
  if (!matchedProject) {
    for (const p of projects) {
      if (text.includes(p.client.toLowerCase())) {
        matchedProject = p
        break
      }
    }
  }

  // 5. Detect Payment Method (DO NOT ASSUME - return null if not explicitly spoken!)
  let method: PayMethod | null = null
  if (/\b(upi|gpay|google pay|phonepe|paytm|qr|online)\b/i.test(text)) {
    method = 'upi'
  } else if (/\b(bank|transfer|neft|rtgs|imps|netbanking|account|direct transfer)\b/i.test(text)) {
    method = 'bank'
  } else if (/\b(cash|in cash|by cash|hand|rokad)\b/i.test(text)) {
    method = 'cash'
  } else if (/\b(cheque|check)\b/i.test(text)) {
    method = 'cheque'
  }

  // 6. Detect Date
  let date: string | null = null
  const now = new Date()
  if (/\byesterday\b/i.test(text)) {
    const yest = new Date(now)
    yest.setDate(yest.getDate() - 1)
    date = yest.toISOString().slice(0, 10)
  } else if (/\bday before yesterday\b/i.test(text)) {
    const dby = new Date(now)
    dby.setDate(dby.getDate() - 2)
    date = dby.toISOString().slice(0, 10)
  }

  // 7. Extract Spoken Party (Without hallucinating third parties from DB)
  const party = extractSpokenParty(transcript, matchedProject, category, type)

  // 8. Build Natural Description
  let description = ''
  if (type === 'income') {
    description = `Payment received${matchedProject ? ' — ' + matchedProject.name : party ? ' from ' + party : ''}`
  } else if (category === 'Worker Payment') {
    description = `Worker payment${matchedProject ? ' for ' + matchedProject.name : ''}`
  } else if (isDailyExpense) {
    description = `${category}${party && party !== category ? ' — ' + party : ''}`
  } else {
    description = `${category}${matchedProject ? ' (' + matchedProject.name + ')' : party ? ' — ' + party : ''}`
  }

  // 9. Missing Fields Determination
  // A project is only missing if the transaction requires a project and none was provided.
  // Daily expenses (tea, fuel, travel) do NOT require a project!
  const missingProject = requiresProject && !matchedProject
  const missingFields: ('type' | 'amount' | 'project' | 'method')[] = []
  if (!amount || amount <= 0) missingFields.push('amount')
  if (missingProject) missingFields.push('project')
  if (!method) missingFields.push('method')

  return {
    type,
    amount,
    projectName: matchedProject ? matchedProject.name : null,
    projectId: matchedProject ? matchedProject.id : null,
    category,
    party,
    method,
    date,
    description,
    isDailyExpense,
    requiresProject,
    missingProject,
    missingFields,
  }
}
