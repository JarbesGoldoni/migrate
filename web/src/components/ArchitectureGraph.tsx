import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react"
import type { ELK as ElkInstance } from "elkjs/lib/elk-api"
import { motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import type { ArchitectureNode, Discovery } from "../../../src/shared/contracts"
import { cn } from "../lib/format"
import { NODE_KINDS } from "../lib/tech"
import { TechIcon } from "./brand"

const NODE_W = 236
const NODE_H = 96

// The layout engine is large; load it only when a graph is actually shown.
let elkInstance: Promise<ElkInstance> | undefined
const loadElk = () => {
  elkInstance ??= import("elkjs/lib/elk.bundled.js").then((mod) => new mod.default())
  return elkInstance
}

type ArchData = { node: ArchitectureNode; index: number }
type ArchNodeType = Node<ArchData, "arch">

const EDGE_COLORS = { sync: "#7c86a3", async: "#a78bfa", data: "#f5a524" }

function ArchNodeCard({ data }: NodeProps<ArchNodeType>) {
  const meta = NODE_KINDS[data.node.kind] ?? NODE_KINDS.module
  const Kind = meta.icon
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.08 * data.index, type: "spring", stiffness: 240, damping: 20 }}
      whileHover={{ y: -3 }}
      className="group relative rounded-2xl p-3"
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        background: "linear-gradient(180deg, rgba(20,26,40,0.95), rgba(10,14,23,0.95))",
        boxShadow: `0 0 0 1px ${meta.color}33, 0 18px 50px -24px ${meta.color}88`,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <span className="absolute top-3 right-3 flex size-2">
        <span className="absolute inline-flex size-full animate-ping-slow rounded-full opacity-60" style={{ background: meta.color }} />
        <span className="relative inline-flex size-2 rounded-full" style={{ background: meta.color }} />
      </span>
      <div className="flex items-center gap-2.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/50" style={{ boxShadow: `inset 0 0 0 1px ${meta.color}40` }}>
          <TechIcon tech={data.node.tech} kind={data.node.kind} size={20} />
        </div>
        <div className="min-w-0 pr-3">
          <div className="truncate text-[13px] font-semibold text-white">{data.node.label}</div>
          <div className="flex items-center gap-1 text-[10px] font-medium tracking-wider uppercase" style={{ color: meta.color }}>
            <Kind className="size-3" />
            {meta.label}
            {data.node.tech && <span className="truncate tracking-normal text-slate-500 normal-case">· {data.node.tech}</span>}
          </div>
        </div>
      </div>
      {data.node.description && <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-slate-400">{data.node.description}</p>}
    </motion.div>
  )
}

const nodeTypes = { arch: ArchNodeCard }

async function layout(discovery: Discovery) {
  const elk = await loadElk()
  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "36",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    },
    children: discovery.nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
    edges: discovery.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  })
  return new Map((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]))
}

function gridFallback(discovery: Discovery) {
  const columns = Math.ceil(Math.sqrt(discovery.nodes.length))
  return new Map(discovery.nodes.map((n, i) => [n.id, { x: (i % columns) * (NODE_W + 80), y: Math.floor(i / columns) * (NODE_H + 60) }]))
}

export function ArchitectureGraph({ discovery, className }: { discovery: Discovery; className?: string }) {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>()

  useEffect(() => {
    let cancelled = false
    layout(discovery)
      .catch(() => gridFallback(discovery))
      .then((p) => {
        if (!cancelled) setPositions(p)
      })
    return () => {
      cancelled = true
    }
  }, [discovery])

  const nodes = useMemo<ArchNodeType[]>(
    () =>
      discovery.nodes.map((node, index) => ({
        id: node.id,
        type: "arch",
        position: positions?.get(node.id) ?? { x: 0, y: 0 },
        data: { node, index },
      })),
    [discovery, positions],
  )

  const edges = useMemo<Edge[]>(
    () =>
      discovery.edges.map((edge) => {
        const color = EDGE_COLORS[edge.kind]
        return {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          label: edge.label || undefined,
          animated: edge.kind !== "sync",
          style: { stroke: color, strokeWidth: 1.6, strokeDasharray: edge.kind === "data" ? "6 5" : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 6,
        }
      }),
    [discovery],
  )

  return (
    <div className={cn("relative h-[560px] overflow-hidden rounded-2xl bg-ink-900/70 ring-1 ring-white/[0.06]", className)}>
      {positions && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.2}
          maxZoom={1.8}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          style={{ background: "transparent" }}
        >
          <Background color="#1d2436" gap={22} size={1.3} />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor={(n) => NODE_KINDS[(n.data as ArchData).node.kind]?.color ?? "#64748b"}
            maskColor="rgba(5,7,12,0.72)"
          />
        </ReactFlow>
      )}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-3 rounded-xl bg-ink-950/70 px-3 py-2 text-[10px] text-slate-400 ring-1 ring-white/5 backdrop-blur">
        {Object.entries(EDGE_COLORS).map(([kind, color]) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: color }} />
            {kind === "sync" ? "request" : kind === "async" ? "async" : "data"}
          </span>
        ))}
      </div>
    </div>
  )
}
