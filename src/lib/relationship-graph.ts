// ═══════════════════════════════════════════════════════════════════════
// Relationship Graph — force-directed layout (Task 90)
// ═══════════════════════════════════════════════════════════════════════
//
// Pure-algorithm force-directed graph layout. NO D3, NO vis.js, NO
// external physics library — just classic spring physics:
//
//   1. Repulsion (Coulomb's law): every pair of nodes pushes apart with
//      force F_repel = k_repel / dist². This prevents overlap.
//
//   2. Attraction (Hooke's law): every connected pair of nodes pulls
//      together with force F_attract = k_spring * (dist - rest_length).
//      This groups related nodes.
//
//   3. Centering: a small attraction toward the center keeps the graph
//      from drifting off-screen.
//
//   4. Damping: each iteration multiplies velocities by 0.85 to simulate
//      friction (otherwise the graph oscillates forever).
//
// We run ~300 iterations of relaxation to reach a stable layout. The
// output is a set of (x, y) positions for each node, plus the edges.
//
// This is the same Fruchterman-Reingold algorithm that powers D3's
// force-directed graph — implemented from scratch in ~120 lines.

export type GraphNode = {
  id: string
  name: string
  // Group/conversation id this node represents (or null for "person")
  kind: 'person' | 'group'
  // Optional: color
  color?: string
  // Additional metadata for tooltips
  meta?: Record<string, any>
}

export type GraphEdge = {
  source: string
  target: string
  // Edge weight — higher = stronger spring
  weight: number
  // Optional metadata
  meta?: Record<string, any>
}

export type PositionedNode = GraphNode & {
  x: number
  y: number
  vx: number
  vy: number
}

export type GraphLayout = {
  nodes: PositionedNode[]
  edges: GraphEdge[]
  width: number
  height: number
  iterations: number
}

// ---- Layout computation -----------------------------------------------------

export function computeForceDirectedLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: {
    width?: number
    height?: number
    iterations?: number
    kRepel?: number
    kSpring?: number
    restLength?: number
    damping?: number
    centeringForce?: number
  } = {},
): GraphLayout {
  const width = options.width ?? 600
  const height = options.height ?? 600
  const iterations = options.iterations ?? 300
  const kRepel = options.kRepel ?? 1500
  const kSpring = options.kSpring ?? 0.05
  const restLength = options.restLength ?? 80
  const damping = options.damping ?? 0.85
  const centeringForce = options.centeringForce ?? 0.01

  // Initialize node positions in a circle (so they don't all start at origin)
  const positioned: PositionedNode[] = nodes.map((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2
    const r = Math.min(width, height) * 0.3
    return {
      ...n,
      x: width / 2 + Math.cos(angle) * r + (Math.random() - 0.5) * 10,
      y: height / 2 + Math.sin(angle) * r + (Math.random() - 0.5) * 10,
      vx: 0,
      vy: 0,
    }
  })

  // Index by id for fast lookup
  const byId = new Map(positioned.map((n) => [n.id, n]))

  // Run iterations of relaxation
  for (let iter = 0; iter < iterations; iter++) {
    // Cooling: scale forces down over time so the layout converges.
    // Standard Fruchterman-Reingold temperature schedule.
    const temperature = 1 - iter / iterations
    const cool = Math.max(0.05, temperature)

    // Reset forces
    const forces = new Map<string, { fx: number; fy: number }>()
    for (const n of positioned) {
      forces.set(n.id, { fx: 0, fy: 0 })
    }

    // 1. REPULSION: every pair of nodes pushes apart
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i]
        const b = positioned[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distSq = dx * dx + dy * dy + 0.01 // avoid division by zero
        const dist = Math.sqrt(distSq)
        const force = kRepel / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        forces.get(a.id)!.fx += fx
        forces.get(a.id)!.fy += fy
        forces.get(b.id)!.fx -= fx
        forces.get(b.id)!.fy -= fy
      }
    }

    // 2. ATTRACTION: every edge pulls its endpoints together
    for (const edge of edges) {
      const a = byId.get(edge.source)
      const b = byId.get(edge.target)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy + 0.01)
      // Hooke's law: F = k * (dist - rest)
      const displacement = dist - restLength
      const force = kSpring * displacement * edge.weight
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      forces.get(a.id)!.fx += fx
      forces.get(a.id)!.fy += fy
      forces.get(b.id)!.fx -= fx
      forces.get(b.id)!.fy -= fy
    }

    // 3. CENTERING: gentle pull toward the canvas center
    for (const n of positioned) {
      const dx = width / 2 - n.x
      const dy = height / 2 - n.y
      forces.get(n.id)!.fx += dx * centeringForce
      forces.get(n.id)!.fy += dy * centeringForce
    }

    // 4. APPLY FORCES with cooling + damping
    for (const n of positioned) {
      const f = forces.get(n.id)!
      // Apply force as acceleration (mass=1)
      n.vx = (n.vx + f.fx * cool) * damping
      n.vy = (n.vy + f.fy * cool) * damping
      // Cap velocity to avoid nodes flying off
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy)
      const maxSpeed = 20 * cool
      if (speed > maxSpeed) {
        n.vx = (n.vx / speed) * maxSpeed
        n.vy = (n.vy / speed) * maxSpeed
      }
      n.x += n.vx
      n.y += n.vy
      // Keep nodes inside the canvas (with a small margin)
      const margin = 30
      n.x = Math.max(margin, Math.min(width - margin, n.x))
      n.y = Math.max(margin, Math.min(height - margin, n.y))
    }
  }

  return {
    nodes: positioned,
    edges,
    width,
    height,
    iterations,
  }
}

// ---- Build the relationship graph from conversation data -------------------

/**
 * Build the relationship graph from the user's conversations.
 *
 * Algorithm:
 *   - For each conversation, create a "group" node (for group convs) or
 *     skip (for 1-on-1 convs — those just create edges directly).
 *   - For each participant in a group conversation, create a "person" node
 *     and an edge from the person to the group node.
 *   - Person-to-person edges are implicit: two people who are both in the
 *     same group are connected via that group node.
 *   - Edge weight = number of shared groups (so close friends in many
 *     groups together have a stronger spring).
 *
 *   - For 1-on-1 conversations, create a direct person-to-person edge
 *     between the user and the other participant (weight = 2, since
 *     1-on-1 is a stronger relationship than group membership).
 */
export function buildRelationshipGraph(params: {
  conversations: Array<{
    id: string
    name: string
    isGroup: boolean
    participants: Array<{ userId: string; name: string; username?: string; avatarColor?: string | null }>
  }>
  currentUserId: string
}): { nodes: GraphNode[]; edges: GraphEdge[]; stats: { totalPeople: number; totalGroups: number; totalEdges: number; strongestConnection?: { name: string; weight: number } } } {
  const nodes = new Map<string, GraphNode>()
  const edgeWeights = new Map<string, number>() // key = "src|tgt" sorted

  function addPerson(userId: string, name: string, color?: string | null) {
    if (!nodes.has(userId)) {
      nodes.set(userId, {
        id: userId,
        name,
        kind: 'person',
        color: color || undefined,
      })
    }
  }

  function addEdge(a: string, b: string, weight: number) {
    // Sort to canonicalize the edge key (so A-B and B-A are the same edge)
    const [src, tgt] = a < b ? [a, b] : [b, a]
    const key = `${src}|${tgt}`
    edgeWeights.set(key, (edgeWeights.get(key) || 0) + weight)
  }

  for (const conv of params.conversations) {
    if (conv.isGroup) {
      // Create a group node
      nodes.set(`group:${conv.id}`, {
        id: `group:${conv.id}`,
        name: conv.name,
        kind: 'group',
        color: '#f59e0b', // amber for groups
      })
      // Add edges between each participant and the group
      for (const p of conv.participants) {
        addPerson(p.userId, p.name, p.avatarColor)
        addEdge(p.userId, `group:${conv.id}`, 1)
      }
    } else {
      // 1-on-1 conversation — direct person-to-person edge
      const other = conv.participants.find((p) => p.userId !== params.currentUserId)
      if (other) {
        addPerson(other.userId, other.name, other.avatarColor)
        // We don't add the current user as a node — they're the center of
        // the graph. But we add an edge from each person to the center.
        addEdge(other.userId, '__center__', 2)
      }
    }
  }

  // Add the implicit center node (the current user)
  nodes.set('__center__', {
    id: '__center__',
    name: 'You',
    kind: 'person',
    color: '#10b981', // green for the user
  })

  // Build edges array
  const edges: GraphEdge[] = []
  for (const [key, weight] of edgeWeights) {
    const [src, tgt] = key.split('|')
    edges.push({ source: src, target: tgt, weight })
  }

  // Stats
  const totalPeople = Array.from(nodes.values()).filter((n) => n.kind === 'person').length - 1 // minus center
  const totalGroups = Array.from(nodes.values()).filter((n) => n.kind === 'group').length
  let strongest: { name: string; weight: number } | undefined
  for (const [key, weight] of edgeWeights) {
    if (key.includes('__center__')) continue
    const [src, tgt] = key.split('|')
    const srcNode = nodes.get(src)
    const tgtNode = nodes.get(tgt)
    if (!srcNode || !tgtNode) continue
    if (!strongest || weight > strongest.weight) {
      strongest = { name: `${srcNode.name} ↔ ${tgtNode.name}`, weight }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    stats: {
      totalPeople,
      totalGroups,
      totalEdges: edges.length,
      strongestConnection: strongest,
    },
  }
}
