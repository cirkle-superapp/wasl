'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Loader2, Users, Network, RefreshCw } from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import {
  buildRelationshipGraph,
  computeForceDirectedLayout,
  type GraphLayout,
} from '@/lib/relationship-graph'
import { toast } from 'sonner'

const TYPE_COLORS: Record<string, string> = {
  person: '#10b981',
  group: '#f59e0b',
}

const CANVAS_SIZE = 600

export function RelationshipGraphDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const conversations = useWaslStore((s) => s.conversations)
  const user = useWaslStore((s) => s.user)
  const [layout, setLayout] = useState<GraphLayout | null>(null)
  const [computing, setComputing] = useState(false)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Build + compute the layout when the dialog opens
  useEffect(() => {
    if (!open || !user) return
    setComputing(true)
    // Defer the compute so the dialog can paint first
    const id = setTimeout(() => {
      try {
        const { nodes, edges, stats } = buildRelationshipGraph({
          conversations: conversations.map((c) => ({
            id: c.id,
            name: c.name,
            isGroup: c.isGroup,
            participants: c.participants.map((p) => ({
              userId: p.userId,
              name: p.name,
              username: p.username,
              avatarColor: p.avatarColor,
            })),
          })),
          currentUserId: user.id,
        })
        const computedLayout = computeForceDirectedLayout(nodes, edges, {
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          iterations: 300,
        })
        setLayout({ ...computedLayout })
        // Attach stats to the layout for the footer
        ;(computedLayout as any).stats = stats
      } catch (err) {
        console.error('[relationship-graph] layout failed', err)
        toast.error('Failed to compute graph layout')
      } finally {
        setComputing(false)
      }
    }, 50)
    return () => clearTimeout(id)
  }, [open, conversations, user])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setLayout(null)
      setHoveredNode(null)
    }
  }, [open])

  const stats = (layout as any)?.stats as ReturnType<typeof buildRelationshipGraph>['stats'] | undefined

  // Build the SVG path for edges (so we can render them as curves)
  const edges = layout?.edges ?? []
  const nodes = layout?.nodes ?? []
  const hoveredNodeObj = hoveredNode ? nodes.find((n) => n.id === hoveredNode) : null
  const connectedEdgeIds = new Set<string>()
  if (hoveredNode) {
    for (const e of edges) {
      if (e.source === hoveredNode || e.target === hoveredNode) {
        connectedEdgeIds.add(`${e.source}|${e.target}`)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto wasl-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="w-4 h-4 text-[var(--wasl-green)]" />
            Relationship Graph
          </DialogTitle>
          <DialogDescription>
            Your social network visualized. Connections are based on shared group
            memberships. Built with a from-scratch force-directed layout (spring physics).
          </DialogDescription>
        </DialogHeader>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-4 gap-2 text-center">
            <StatCard label="People" value={stats.totalPeople} icon={Users} color="text-[var(--wasl-green)]" />
            <StatCard label="Groups" value={stats.totalGroups} icon={Users} color="text-amber-500" />
            <StatCard label="Connections" value={stats.totalEdges} icon={Network} color="text-blue-500" />
            <StatCard label="Strongest" value={stats.strongestConnection?.weight ?? 0} icon={Network} color="text-purple-500" suffix=" links" />
          </div>
        )}

        {computing || !layout ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[var(--wasl-green)]" />
            <p className="text-xs text-muted-foreground">
              Computing force-directed layout (300 iterations of spring physics)…
            </p>
          </div>
        ) : nodes.length <= 1 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <div className="wasl-empty-orb mb-3 flex items-center justify-center" style={{ width: 64, height: 64 }}>
              <Network className="w-8 h-8 text-[var(--wasl-green)]" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium">No connections to map yet</p>
            <p className="text-[11px] mt-1 max-w-[280px]">
              Join group conversations to build your social graph. Group memberships create the connections between people.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-muted/10 p-2 overflow-auto">
              <svg
                viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
                className="w-full h-auto"
                style={{ maxHeight: '60vh' }}
              >
                {/* Edges */}
                {edges.map((edge) => {
                  const a = nodes.find((n) => n.id === edge.source)
                  const b = nodes.find((n) => n.id === edge.target)
                  if (!a || !b) return null
                  // Edge opacity scales with weight — stronger connections are more visible
                  const opacity = Math.min(0.85, 0.15 + edge.weight * 0.15)
                  // Highlight if either endpoint is hovered
                  const isHighlighted = hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode)
                  return (
                    <line
                      key={`${edge.source}|${edge.target}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={isHighlighted ? 'var(--wasl-green)' : 'currentColor'}
                      strokeOpacity={isHighlighted ? 0.8 : opacity}
                      strokeWidth={isHighlighted ? 2 : Math.max(0.5, Math.min(2.5, edge.weight * 0.6))}
                      className="text-muted-foreground/40 transition-all"
                    />
                  )
                })}

                {/* Nodes */}
                {nodes.map((n) => {
                  const isCenter = n.id === '__center__'
                  const isGroup = n.kind === 'group'
                  const isHovered = n.id === hoveredNode
                  const isConnectedToHovered = hoveredNode && edges.some(
                    (e) => (e.source === n.id && e.target === hoveredNode) ||
                            (e.target === n.id && e.source === hoveredNode)
                  )
                  const radius = isCenter ? 14 : isGroup ? 8 : 6
                  const color = isCenter ? '#10b981' : isGroup ? '#f59e0b' : (n.color || '#3b82f6')
                  const dim = hoveredNode && !isHovered && !isConnectedToHovered
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x}, ${n.y})`}
                      onMouseEnter={() => setHoveredNode(n.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      className="cursor-pointer"
                      opacity={dim ? 0.3 : 1}
                    >
                      {/* Outer glow for hovered */}
                      {isHovered && (
                        <circle
                          r={radius + 4}
                          fill={color}
                          opacity={0.2}
                          className="transition-all"
                        />
                      )}
                      <circle
                        r={radius}
                        fill={color}
                        stroke="white"
                        strokeWidth={isCenter ? 2 : 1}
                        className="transition-all"
                      />
                      {/* Initial letter */}
                      <text
                        textAnchor="middle"
                        dy="0.3em"
                        fontSize={isCenter ? 10 : 7}
                        fill="white"
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {n.name.charAt(0).toUpperCase()}
                      </text>
                      {/* Name label (only for hovered or center node) */}
                      {(isHovered || isCenter) && (
                        <text
                          textAnchor="middle"
                          dy={radius + 14}
                          fontSize={11}
                          fill="currentColor"
                          className="font-medium"
                          pointerEvents="none"
                        >
                          {n.name.length > 18 ? n.name.slice(0, 16) + '…' : n.name}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* Hovered node info */}
            {hoveredNodeObj && (
              <div className="rounded-lg p-3 bg-muted/30 border border-border wasl-anim-slide-up">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ background: hoveredNodeObj.color || '#3b82f6' }}
                  />
                  <span className="text-sm font-medium">{hoveredNodeObj.name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {hoveredNodeObj.kind}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {connectedEdgeIds.size} connection{connectedEdgeIds.size === 1 ? '' : 's'}
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
                You
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" />
                Person
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
                Group
              </span>
              <span className="opacity-60">· hover to highlight connections</span>
            </div>

            {/* Algorithmic transparency footer */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[10px] text-muted-foreground">
              <strong>Algorithm:</strong> Fruchterman-Reingold force-directed layout (built from scratch — no D3).
              Repulsion (Coulomb) between every pair of nodes + attraction (Hooke's law) along edges +
              centering pull + velocity damping. 300 iterations of relaxation. Layout is deterministic
              given the same seed (positions are randomized within a small range for stability).
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatCard({ label, value, icon: Icon, color, suffix }: {
  label: string
  value: number
  icon: typeof Users
  color: string
  suffix?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <Icon className={`w-3 h-3 mx-auto ${color}`} />
      <div className="text-base font-bold tabular-nums mt-0.5">{value}{suffix}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  )
}
