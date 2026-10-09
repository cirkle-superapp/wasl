import { db } from '../src/lib/db.ts'
import { scorePair, normalizeName, normalizePhone, jaroWinklerSimilarity } from '../src/lib/dedup.ts'

// Get the demo user's contacts
const session = await db.user.findFirst({ where: { username: 'demo' } })
console.log('Demo user:', session?.id)

const contacts = await db.contact.findMany({
  where: { ownerId: session?.id || "" },
  include: { user: { select: { id: true, username: true, name: true } } },
})
console.log(`Found ${contacts.length} contacts:`)
for (const c of contacts) {
  console.log(`  - id=${c.id.slice(-10)} name="${c.nickname}" phone="${c.phone}" userId=${c.userId?.slice(-10) ?? 'null'}`)
}

// Build dedup input
const dedupInput = contacts.map((c) => ({
  id: c.id,
  name: c.nickname || c.user?.name || '',
  phone: c.phone,
  username: c.user?.username ?? null,
  userId: c.userId ?? null,
}))

console.log('\n--- Manual scoring for each pair ---')
for (let i = 0; i < dedupInput.length; i++) {
  for (let j = i + 1; j < dedupInput.length; j++) {
    const a = dedupInput[i]
    const b = dedupInput[j]
    const nameA = normalizeName(a.name)
    const nameB = normalizeName(b.name)
    const nameSim = jaroWinklerSimilarity(nameA, nameB)
    const phoneA = normalizePhone(a.phone)
    const phoneB = normalizePhone(b.phone)
    const match = scorePair(a, b)
    console.log(`  ${a.name} ↔ ${b.name}`)
    console.log(`    normNames: ${nameA} ↔ ${nameB}`)
    console.log(`    nameSim=${nameSim.toFixed(3)} phones=(${phoneA} ${phoneB}) score=${match.score} (${match.primarySignal})`)
  }
}

process.exit(0)
