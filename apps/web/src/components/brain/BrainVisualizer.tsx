import { CopyIcon, ExternalLinkIcon, RefreshCwIcon, SearchIcon, XIcon } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { observeResize } from "../../lib/observeResize";
import type { BrainGraphData, BrainNode, BrainViewMode, NodePosition } from "./brainTypes";
import { layoutNodes } from "./brainLayout";

const AREA_COLORS: Record<string, string> = {
  core: "var(--chart-1, #38bdf8)",
  business: "var(--chart-4, #fbbf24)",
  system: "var(--chart-3, #34d399)",
  dev: "var(--chart-2, #818cf8)",
  personal: "var(--chart-5, #f43f5e)",
  skills: "var(--chart-6, #a855f7)",
};

const LEGEND: ReadonlyArray<{ area: string; label: string }> = [
  { area: "core", label: "Core" },
  { area: "business", label: "Business" },
  { area: "system", label: "System" },
  { area: "dev", label: "Dev" },
  { area: "personal", label: "Personal" },
];

const VIEW_MODES: readonly BrainViewMode[] = ["rings", "areas", "timeline", "orbit"];

const VIEW_HELP: Record<BrainViewMode, { title: string; help: string }> = {
  rings: {
    title: "Rings",
    help: "What kind of file is it? Each ring is one layer. The center is AGENTS.md, the router.",
  },
  areas: {
    title: "Areas",
    help: "Which part of your life or work? Each cluster is one area.",
  },
  timeline: {
    title: "Timeline",
    help: "When did it last change? One column per day. Oldest left, newest right.",
  },
  orbit: {
    title: "Orbit",
    help: "Everything at once. A slowly turning globe. Nearer files look bigger.",
  },
};

const FALLBACK_COLOR = "#38bdf8";
const HUB_KINDS = new Set(["root", "area"]);

export interface BrainVisualizerProps {
  initialData?: BrainGraphData;
  dataSourceUrl?: string;
  className?: string;
  onOpenFile?: (path: string) => void;
}

/** Canvas cannot read var(); resolve each color once from the element's styles. */
function resolveColor(style: CSSStyleDeclaration, value: string): string {
  const match = /^var\((--[\w-]+),\s*([^)]+)\)$/.exec(value);
  if (!match) return value;
  return style.getPropertyValue(match[1]!).trim() || match[2]!.trim();
}

/** @public Loaded by name through MemoryWindow's lazy module import. */
export function BrainVisualizer({
  initialData,
  dataSourceUrl = "/data/brain.json",
  className = "",
  onOpenFile,
}: BrainVisualizerProps) {
  const [graphData, setGraphData] = useState<BrainGraphData | null>(initialData ?? null);
  const [currentView, setCurrentView] = useState<BrainViewMode>("rings");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedNode, setSelectedNode] = useState<BrainNode | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!initialData);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<string | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const lastPosRef = useRef<Record<string, NodePosition>>({});
  const angleRef = useRef<number>(0);

  // Load data from disk JSON if not supplied via props
  useEffect(() => {
    if (initialData) {
      setGraphData(initialData);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    fetch(dataSourceUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data: BrainGraphData) => {
        if (isMounted) {
          setGraphData(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn(
          "[BrainVisualizer] Could not load data/brain.json, using fallback nodes:",
          err,
        );
        if (isMounted) {
          // Robust fallback mock representing core AIOS nodes
          setGraphData({
            version: "1.0.0",
            nodes: [
              {
                id: "root",
                label: "CLAUDE.md",
                kind: "root",
                layer: "core",
                area: "core",
                path: "CLAUDE.md",
                note: "Central root router (<60 lines). Pointers to areas only.",
              },
              {
                id: "core-agents",
                label: "AGENTS.md",
                kind: "memory",
                layer: "core",
                area: "core",
                path: "AGENTS.md",
                note: "Operational governance & agent constraints.",
              },
              {
                id: "area-biz",
                label: "Business",
                kind: "area",
                layer: "core",
                area: "business",
                path: "areas/business.md",
                note: "SimplyGersi and commercial ventures.",
              },
              {
                id: "area-sys",
                label: "System",
                kind: "area",
                layer: "core",
                area: "system",
                path: "areas/system.md",
                note: "Substrate, scripts, and runtime infrastructure.",
              },
              {
                id: "area-dev",
                label: "Coding",
                kind: "area",
                layer: "core",
                area: "dev",
                path: "areas/dev.md",
                note: "Leonidas app, worktrees, and release pipelines.",
              },
              {
                id: "sk-yt",
                label: "youtube-analyzer",
                kind: "skill",
                layer: "skills",
                area: "business",
                path: ".agents/skills/youtube-analyzer",
                note: "Intelligence extraction with SponsorBlock.",
              },
              {
                id: "sk-canvas",
                label: "leonidas-canvas",
                kind: "skill",
                layer: "skills",
                area: "dev",
                path: ".agents/skills/leonidas-canvas",
                note: "Interactive HTML canvas renderer standard.",
              },
              {
                id: "r-digest",
                label: "morning-digest",
                kind: "routine",
                layer: "routines",
                area: "system",
                path: "scripts/Invoke-MorningLaunchpad.ps1",
                note: "Pre-dawn brief and task ignition.",
              },
              {
                id: "app-lc",
                label: "leonidas-code",
                kind: "app",
                layer: "apps",
                area: "dev",
                path: "apps/desktop",
                note: "Product-native desktop harness and collaborative browser.",
              },
            ],
            links: [
              { s: "root", t: "core-agents" },
              { s: "root", t: "area-biz" },
              { s: "root", t: "area-sys" },
              { s: "root", t: "area-dev" },
              { s: "area-biz", t: "sk-yt" },
              { s: "area-dev", t: "sk-canvas" },
              { s: "area-dev", t: "app-lc" },
              { s: "area-sys", t: "r-digest" },
            ],
          });
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [dataSourceUrl, initialData]);

  // Track the canvas box (not the toolbar) so drawing and clicks share one coordinate space.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    return observeResize(wrap, () => {
      setSize({ w: wrap.clientWidth, h: wrap.clientHeight });
    });
  }, []);

  // Draw. Static views paint once per change; only Orbit animates.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !graphData || size.w === 0 || size.h === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);

    const style = getComputedStyle(wrap);
    const areaColors: Record<string, string> = {};
    for (const [area, value] of Object.entries(AREA_COLORS)) {
      areaColors[area] = resolveColor(style, value);
    }
    const foreground = style.color || "#e5e7eb";
    const surface = style.backgroundColor || "#0b0d12";
    const accent = resolveColor(style, "var(--primary, #38bdf8)");

    const nodeById = new Map(graphData.nodes.map((n) => [n.id, n]));
    const neighbors = new Map<string, Set<string>>();
    for (const link of graphData.links) {
      (neighbors.get(link.s) ?? neighbors.set(link.s, new Set()).get(link.s)!).add(link.t);
      (neighbors.get(link.t) ?? neighbors.set(link.t, new Set()).get(link.t)!).add(link.s);
    }

    const query = searchQuery.trim().toLowerCase();
    const matchIds = new Set<string>();
    if (query) {
      for (const n of graphData.nodes) {
        if (n.label.toLowerCase().includes(query) || n.path.toLowerCase().includes(query)) {
          matchIds.add(n.id);
        }
      }
    }
    const isVisible = (n: BrainNode): boolean => {
      if (selectedArea !== "all" && n.area !== selectedArea && n.id !== "root") return false;
      return !query || matchIds.has(n.id);
    };
    const filtered = selectedArea !== "all" || query !== "";

    const draw = () => {
      const { w, h } = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const { pos, guides } = layoutNodes(currentView, graphData, w, h, angleRef.current);
      lastPosRef.current = pos;

      const focusId = hoverRef.current ?? selectedNode?.id ?? null;
      const focusNeighbors = focusId ? (neighbors.get(focusId) ?? new Set<string>()) : null;

      // Lane and ring names
      ctx.fillStyle = foreground;
      ctx.globalAlpha = 0.45;
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "middle";
      for (const guide of guides) {
        ctx.textAlign = guide.align;
        ctx.fillText(guide.text, guide.x, guide.y);
      }
      ctx.globalAlpha = 1;

      // Links in three batches: quiet, dimmed by the filter, and highlighted
      const quiet = new Path2D();
      const dimmed = new Path2D();
      const lit = new Path2D();
      for (const link of graphData.links) {
        const p1 = pos[link.s];
        const p2 = pos[link.t];
        if (!p1 || !p2) continue;
        const nodeS = nodeById.get(link.s);
        const nodeT = nodeById.get(link.t);
        const isFocusLink = focusId !== null && (link.s === focusId || link.t === focusId);
        const target = isFocusLink
          ? lit
          : filtered && !(nodeS && isVisible(nodeS)) && !(nodeT && isVisible(nodeT))
            ? dimmed
            : quiet;
        target.moveTo(p1.x, p1.y);
        target.lineTo(p2.x, p2.y);
      }
      ctx.fillStyle = foreground;
      ctx.strokeStyle = foreground;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.09;
      ctx.stroke(quiet);
      ctx.globalAlpha = 0.025;
      ctx.stroke(dimmed);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.85;
      ctx.stroke(lit);
      ctx.globalAlpha = 1;

      // Nodes, far to near in Orbit
      const drawOrder =
        currentView === "orbit"
          ? graphData.nodes.toSorted((a, b) => (pos[a.id]?.z ?? 1) - (pos[b.id]?.z ?? 1))
          : graphData.nodes;
      const labelled: Array<{ node: BrainNode; x: number; y: number; r: number }> = [];
      for (const node of drawOrder) {
        const p = pos[node.id];
        if (!p) continue;
        const scale = p.z ?? 1;
        const baseRadius = node.id === "root" ? 9 : node.kind === "area" ? 7 : 3.6;
        const r = Math.max(1.5, baseRadius * scale);
        const visible = isVisible(node);
        const inFocus =
          focusId === null || node.id === focusId || (focusNeighbors?.has(node.id) ?? false);
        ctx.globalAlpha = !visible ? 0.12 : inFocus ? 1 : 0.35;
        ctx.fillStyle = node.id === "root" ? foreground : (areaColors[node.area] ?? FALLBACK_COLOR);
        ctx.beginPath();
        if (node.id === "root") {
          for (let i = 0; i < 6; i += 1) {
            const a = (i * Math.PI) / 3;
            const px = p.x + r * Math.cos(a);
            const py = p.y + r * Math.sin(a);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else {
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }
        ctx.fill();

        if (node.id === focusId || node.id === selectedNode?.id) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        const showLabel =
          (HUB_KINDS.has(node.kind) && visible) ||
          node.id === focusId ||
          node.id === selectedNode?.id ||
          (focusNeighbors !== null && focusNeighbors.size <= 24 && focusNeighbors.has(node.id)) ||
          (query !== "" && matchIds.size <= 30 && matchIds.has(node.id));
        if (showLabel) labelled.push({ node, x: p.x, y: p.y, r });
      }

      // Labels last so no dot hides them; a halo keeps them readable
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.lineJoin = "round";
      for (const { node, x, y, r } of labelled) {
        ctx.font = HUB_KINDS.has(node.kind) ? "600 12px sans-serif" : "11px sans-serif";
        ctx.lineWidth = 4;
        ctx.strokeStyle = surface;
        ctx.strokeText(node.label, x, y + r + 14);
        ctx.fillStyle = foreground;
        ctx.fillText(node.label, x, y + r + 14);
      }
    };

    drawRef.current = draw;
    draw();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let lastTick = 0;
    if (currentView === "orbit" && !reduceMotion) {
      const tick = (now: number) => {
        angleRef.current += Math.min(now - lastTick, 50) * 0.00008;
        lastTick = now;
        draw();
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame((now) => {
        lastTick = now;
        frame = requestAnimationFrame(tick);
      });
    }

    return () => {
      cancelAnimationFrame(frame);
      drawRef.current = null;
    };
  }, [currentView, graphData, searchQuery, selectedArea, selectedNode, size]);

  const hitTest = (e: React.MouseEvent<HTMLCanvasElement>): BrainNode | null => {
    const canvas = canvasRef.current;
    if (!canvas || !graphData) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best: BrainNode | null = null;
    let bestDistance = 12;
    for (const node of graphData.nodes) {
      const p = lastPosRef.current[node.id];
      if (!p) continue;
      const distance = Math.hypot(p.x - mx, p.y - my);
      if (distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e);
    if (canvasRef.current) canvasRef.current.style.cursor = hit ? "pointer" : "default";
    const id = hit?.id ?? null;
    if (id === hoverRef.current) return;
    hoverRef.current = id;
    if (currentView !== "orbit") drawRef.current?.();
  };

  const handleLeave = () => {
    if (hoverRef.current === null) return;
    hoverRef.current = null;
    if (currentView !== "orbit") drawRef.current?.();
  };

  const handleCopyPath = () => {
    if (!selectedNode) return;
    void navigator.clipboard.writeText(selectedNode.path);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1800);
  };

  const summary = useMemo(
    () => (graphData ? `${graphData.nodes.length} files, ${graphData.links.length} links` : ""),
    [graphData],
  );

  return (
    <div
      className={`relative flex h-full min-h-[460px] w-full flex-col overflow-hidden rounded-lg border border-border bg-background select-none ${className}`}
    >
      {/* Top Toolbar */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/60 p-0.5">
          {VIEW_MODES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setCurrentView(v)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                currentView === v
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {VIEW_HELP[v].title}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {["all", "core", "business", "dev", "system"].map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => setSelectedArea(area)}
                className={`rounded-full border px-2 py-0.5 text-2xs capitalize transition-all ${
                  selectedArea === area
                    ? "border-primary bg-primary/15 font-semibold text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {area}
              </button>
            ))}
          </div>

          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find a file"
              aria-label="Find a file"
              className="w-28 rounded border border-border/60 bg-muted/60 py-1 pr-2 pl-7 text-xs text-foreground transition-all focus:border-primary focus:outline-none sm:w-36"
            />
          </div>
        </div>
      </div>

      {/* Canvas box: its size drives drawing and click positions */}
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {isLoading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <RefreshCwIcon className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : null}

        <canvas
          ref={canvasRef}
          onClick={(e) => setSelectedNode(hitTest(e))}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          style={{ width: size.w, height: size.h }}
          className="absolute inset-0 block"
        />

        {/* Selected Node Inspection Card */}
        {selectedNode ? (
          <div className="absolute top-3 right-3 z-20 w-64 rounded-lg border border-border bg-card/95 p-3.5 shadow-2xl backdrop-blur-xl">
            <div className="mb-1.5 flex items-start justify-between gap-1">
              <span className="truncate text-sm font-bold text-foreground">
                {selectedNode.label}
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedNode(null)}
                className="p-0.5 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mb-2 flex items-center gap-1.5">
              <span className="rounded border border-primary/20 bg-muted px-1.5 py-0.5 text-3xs font-semibold text-primary uppercase">
                {selectedNode.kind}
              </span>
              <span className="text-3xs text-muted-foreground">Layer: {selectedNode.layer}</span>
            </div>

            <div className="mb-2 rounded border border-border/40 bg-muted/40 p-1.5 font-mono text-2xs break-all text-muted-foreground">
              {selectedNode.path}
            </div>

            <div className="mb-3 line-clamp-3 text-xs leading-snug text-foreground/90">
              {selectedNode.note || "No description provided for this node."}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenFile?.(selectedNode.path)}
                className="flex flex-1 items-center justify-center gap-1 rounded border border-border bg-muted px-2 py-1 text-xs font-semibold transition-all hover:bg-primary hover:text-primary-foreground"
              >
                <ExternalLinkIcon className="h-3 w-3" />
                <span>Open</span>
              </button>
              <button
                type="button"
                onClick={handleCopyPath}
                className="flex flex-1 items-center justify-center gap-1 rounded border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground transition-all hover:bg-muted/80"
              >
                <CopyIcon className="h-3 w-3" />
                <span>{copyFeedback ? "Copied!" : "Copy"}</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* What am I looking at */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-sm rounded-lg border border-border/60 bg-card/85 px-3 py-2 text-xs shadow-lg backdrop-blur-md">
          <div className="font-semibold text-foreground">
            {VIEW_HELP[currentView].title}
            <span className="ml-2 font-normal text-muted-foreground">{summary}</span>
          </div>
          <div className="mt-0.5 text-muted-foreground">{VIEW_HELP[currentView].help}</div>
          <div className="mt-0.5 text-muted-foreground">
            Each dot is one file. Hover a dot to read its name. Click it for its path.
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-1.5 text-2xs text-muted-foreground">
            {LEGEND.map(({ area, label }) => (
              <span key={area} className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: AREA_COLORS[area] }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
