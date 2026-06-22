/** SUIKA X — Knowledge Fabric graph canvas. SVG, deterministic radial layout with
 *  type-based coloring and hover/click highlighting. No external graph lib. */
"use client";

import { useMemo, useState } from "react";
import type { GraphDTO } from "@/lib/suika/types";
import { cn } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  subsystem: "#34d399", // emerald
  store: "#f472b6", // rose
  runtime: "#fbbf24", // amber
  bus: "#38bdf8", // sky
  concept: "#a78bfa", // violet
  default: "#94a3b8",
};

export function GraphCanvas({ graph }: { graph: GraphDTO }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    const nodes = graph.nodes;
    const n = nodes.length;
    if (n === 0) return { positions: {} as Record<string, { x: number; y: number; r: number }>, w: 0, h: 0 };
    const W = 760;
    const H = 480;
    const cx = W / 2;
    const cy = H / 2;
    // Highest-degree node goes to center; rest on concentric rings by degree bucket.
    const sorted = [...nodes].sort((a, b) => b.degree - a.degree);
    const positions: Record<string, { x: number; y: number; r: number }> = {};
    sorted.forEach((node, i) => {
      if (i === 0) {
        positions[node.id] = { x: cx, y: cy, r: 9 + Math.min(14, node.degree * 2) };
      } else {
        // ring index by degree
        const ring = node.degree > 3 ? 1 : node.degree > 1 ? 2 : 3;
        const ringR = 90 + ring * 70;
        const angle = (i / (n - 1)) * Math.PI * 2 + ring * 0.5;
        positions[node.id] = {
          x: cx + Math.cos(angle) * ringR,
          y: cy + Math.sin(angle) * ringR * 0.78,
          r: 5 + Math.min(10, node.degree * 1.4),
        };
      }
    });
    return { positions, w: W, h: H };
  }, [graph]);

  const activeId = selected ?? hover;
  const connectedIds = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const e of graph.edges) {
      if (e.fromId === activeId) set.add(e.toId);
      if (e.toId === activeId) set.add(e.fromId);
    }
    return set;
  }, [activeId, graph.edges]);

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No entities in this workspace. Create one to seed the graph.
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        className="h-[420px] w-full"
        role="img"
        aria-label="Knowledge fabric entity graph"
      >
        <defs>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* edges */}
        <g>
          {graph.edges.map((e) => {
            const a = layout.positions[e.fromId];
            const b = layout.positions[e.toId];
            if (!a || !b) return null;
            const dim = connectedIds && !(connectedIds.has(e.fromId) && connectedIds.has(e.toId));
            return (
              <line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={dim ? "#ffffff08" : "#34d39955"}
                strokeWidth={1 + Math.min(2, e.weight)}
              />
            );
          })}
        </g>

        {/* nodes */}
        <g>
          {graph.nodes.map((node) => {
            const p = layout.positions[node.id];
            if (!p) return null;
            const color = TYPE_COLORS[node.type] ?? TYPE_COLORS.default;
            const dim = connectedIds && !connectedIds.has(node.id);
            const isActive = activeId === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${p.x},${p.y})`}
                className="cursor-pointer"
                onClick={() => setSelected(isActive ? null : node.id)}
                onMouseEnter={() => setHover(node.id)}
                onMouseLeave={() => setHover(null)}
                opacity={dim ? 0.25 : 1}
              >
                {isActive && <circle r={p.r + 8} fill="url(#nodeGlow)" />}
                <circle
                  r={p.r}
                  fill={color}
                  fillOpacity={0.18}
                  stroke={color}
                  strokeWidth={isActive ? 2 : 1.2}
                />
                <text
                  y={p.r + 12}
                  textAnchor="middle"
                  className="pointer-events-none fill-foreground font-sans"
                  fontSize={9}
                  opacity={isActive ? 1 : 0.7}
                >
                  {node.name.length > 18 ? node.name.slice(0, 17) + "…" : node.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* legend */}
      <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-1 rounded-lg border border-border/50 bg-card/80 p-2 text-[10px] backdrop-blur">
        {Object.entries(TYPE_COLORS)
          .filter(([k]) => k !== "default")
          .map(([k, c]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
              <span className="text-muted-foreground">{k}</span>
            </div>
          ))}
      </div>

      {/* selected detail */}
      {selected && (() => {
        const node = graph.nodes.find((n) => n.id === selected);
        if (!node) return null;
        const rels = graph.edges.filter((e) => e.fromId === selected || e.toId === selected);
        return (
          <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-emerald-300">{node.name}</p>
              <span className="font-mono text-[10px] text-muted-foreground">{node.type} · deg {node.degree}</span>
            </div>
            <p className="mt-1 text-muted-foreground">
              salience {node.salience.toFixed(2)} · props {Object.keys(node.properties).length}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {rels.slice(0, 12).map((r) => {
                const other = r.fromId === selected ? r.toId : r.fromId;
                const otherNode = graph.nodes.find((n) => n.id === other);
                return (
                  <span key={r.id} className={cn("rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px]")}>
                    {r.fromId === selected ? "→" : "←"} {r.type} {otherNode?.name ?? "…"}
                  </span>
                );
              })}
              {rels.length > 12 && <span className="text-muted-foreground">+{rels.length - 12} more</span>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
