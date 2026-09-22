// School Connect — shared helpers.
//
// - generateSchoolCode(): produce a unique institution code like "NIS-2048"
// - generateStudentId(schoolCode, year): produce "NIS-25-08421"
// - generateJoinCode(): produce a temporary "7K4P-92XM"
// - parseConnectNumber(input): accept "NIS-25-08421-7K4P" or "NIS-25-08421" or
//   just "7K4P-92XM" and return { schoolCode, studentId, joinCode } in any
//   combination present.

const SCHOOL_PREFIX_LEN = 2 // e.g. "NIS", "AIS", "CES" — kept 2-4 chars
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I,O,0,1 (ambiguous)

function randomCode(length: number): string {
  let s = ''
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  for (let i = 0; i < length; i++) {
    s += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length]
  }
  return s
}

// Generate a 4-digit institution suffix, e.g. "NIS-2048"
export function generateSchoolCode(prefix: string): string {
  const p = (prefix || 'SCH').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'SCH'
  return `${p}-${randomCode(4)}`
}

// Generate a Student ID in format "<prefix>-<YY>-<5-digit-serial>", e.g. "NIS-25-08421"
export function generateStudentId(schoolCode: string, enrollmentYear?: number): string {
  const prefix = schoolCode.split('-')[0] || 'SCH'
  const year = enrollmentYear ?? new Date().getFullYear()
  const yy = String(year % 100).padStart(2, '0')
  const serial = String(Math.floor(Math.random() * 100000)).padStart(5, '0')
  return `${prefix}-${yy}-${serial}`
}

// Generate a temporary Connect/Join Code in format "7K4P-92XM" (4-4 chars)
export function generateJoinCode(): string {
  return `${randomCode(4)}-${randomCode(4)}`
}

// Generate a Parent/Family Connect Number, format "NIS-P-XXXX-YY"
export function generateParentCode(schoolCode: string): string {
  const prefix = schoolCode.split('-')[0] || 'SCH'
  return `${prefix}-P-${randomCode(4)}-${randomCode(2)}`
}

// Parse a user-entered Connect Number into its component parts.
// Accepts:
//   - "NIS-25-08421-7K4P-92XM"  (full School Connect Number)
//   - "NIS-25-08421"            (Student ID alone — used when the student
//                                 themselves is joining, the join code is
//                                 auto-fetched by the school admin)
//   - "7K4P-92XM"               (Join Code alone — used when a parent has
//                                 been given just the 8-char code by the
//                                 student)
//   - "NIS-P-XXXX-YY"           (Parent Code — NOT yet supported, returns
//                                 parentCode field for future expansion)
// Whitespace and case are normalized. Separators can be "-" or " " or "•".
export type ParsedConnectNumber = {
  schoolCode?: string
  studentId?: string
  joinCode?: string
  parentCode?: string
  raw: string
}

export function parseConnectNumber(input: string): ParsedConnectNumber {
  const raw = (input || '').trim().toUpperCase()
  // Normalize separators: "•" and " " and "." → "-"
  const normalized = raw.replace(/[•\s.]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const parts = normalized.split('-')
  const out: ParsedConnectNumber = { raw: normalized }

  // Pattern 1: Join Code alone — 2 segments of 4 chars each from CODE_ALPHABET
  // (e.g. "7K4P-92XM"). The CODE_ALPHABET excludes 0,1,I,O so we can detect
  // "no digits" → it's a pure join code.
  if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 4) {
    // If the first 4 chars are NOT all digits, this is a join code
    if (!/^\d{4}$/.test(parts[0])) {
      out.joinCode = `${parts[0]}-${parts[1]}`
      return out
    }
  }

  // Pattern 2: Parent Code — "<PREFIX>-P-XXXX-YY"
  if (parts.length === 4 && parts[1] === 'P') {
    out.parentCode = normalized
    out.schoolCode = parts[0]
    return out
  }

  // Pattern 3: Student ID alone — "<PREFIX>-YY-NNNNN"
  if (parts.length === 3 && /^[A-Z]{2,6}$/.test(parts[0]) && /^\d{2}$/.test(parts[1]) && /^\d{1,7}$/.test(parts[2])) {
    out.studentId = normalized
    out.schoolCode = parts[0]
    return out
  }

  // Pattern 4: Full School Connect Number — "<PREFIX>-YY-NNNNN-XXXX-XXXX"
  if (parts.length === 5 && /^[A-Z]{2,6}$/.test(parts[0]) && /^\d{2}$/.test(parts[1]) && /^\d{1,7}$/.test(parts[2]) && parts[3].length === 4 && parts[4].length === 4) {
    out.schoolCode = parts[0]
    out.studentId = `${parts[0]}-${parts[1]}-${parts[2]}`
    out.joinCode = `${parts[3]}-${parts[4]}`
    return out
  }

  // Fallback: just return the raw normalized input — caller will decide
  // what to do with it (typically a search across join codes).
  return out
}

// Format a School Connect Number for display, e.g.:
//   "NIS • 25 • 08421 • 7K4P-92XM"
export function formatSchoolConnectNumber(schoolCode: string, studentId: string, joinCode: string): string {
  // studentId is "NIS-25-08421"; we want the bare parts without the prefix
  // for the connect number display.
  const studentParts = studentId.split('-').slice(1).join(' • ')
  const prefix = schoolCode.split('-')[0]
  return `${prefix} • ${studentParts} • ${joinCode}`
}
