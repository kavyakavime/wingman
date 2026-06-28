"use client";

import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { api } from "@/convex/_generated/api";
import {
  buildSwarmGraphData,
  chargeStrengthForNode,
  graphForceSettings,
  pickDisplayReactions,
  SWARM_GRAPH_BG,
  SWARM_GRAPH_BG_NUM,
  type AmbientLeadRow,
  type GraphPersonaRow,
  type SwarmGraphLink,
  type SwarmGraphNode,
  type SwarmReactionRow,
} from "@/lib/swarmGraphData";
import { SEGMENT_LABELS } from "@/lib/segments";
import { createGlowNode, decorateSwarmScene, updateGlowNode, type GlowNodeParts } from "@/lib/swarmGraphScene";
import { SwarmGraphBackdrop, SwarmGraphForeground } from "./SwarmGraphOverlay";

const ForceGraph3D = dynamic(() => import("./ForceGraph3DCanvas"), {
  ssr: false,
});

type SwarmGraphProps = {
  personas: GraphPersonaRow[] | undefined;
  reactions: SwarmReactionRow[] | undefined;
  isSwarmRunning?: boolean;
  emptyMessage?: string;
  /** When set, overrides the default ambient-leads query (e.g. unselected run leads). */
  ambientLeads?: AmbientLeadRow[];
  /** When true, graph fills its container height instead of a fixed 420px. */
  fillContainer?: boolean;
};

type GraphCanvasProps = {
  graphData: ReturnType<typeof buildSwarmGraphData>;
  width: number;
  height: number;
  displayRound: 1 | 2;
  activeNodeCount: number;
  isSwarmRunning: boolean;
  onReady: (api: ForceGraphMethods) => void;
  onNodeClick: (node: SwarmGraphNode) => void;
  onBackgroundClick: () => void;
};

const isActiveGraphNode = (node: object): boolean =>
  !(node as SwarmGraphNode).isAmbient;

function activeNodeRadius(val: number, totalActive: number): number {
  const densityScale = Math.max(0.5, Math.min(1, 7 / Math.sqrt(Math.max(totalActive, 1))));
  return (0.85 + val * 0.08) * densityScale;
}

function nodeWorldPosition(node: SwarmGraphNode): {
  x: number;
  y: number;
  z: number;
} | null {
  const x = node.fx ?? node.x;
  const y = node.fy ?? node.y;
  const z = node.fz ?? node.z;
  if (x == null || y == null || z == null) return null;
  return { x, y, z };
}

function fitActiveNodes(
  api: ForceGraphMethods,
  displayRound: 1 | 2,
  nodeCount: number,
) {
  const pad = Math.max(22, 26 + nodeCount * 1.05);
  api.zoomToFit(480, pad, isActiveGraphNode);
  const cam = api.camera() as THREE.PerspectiveCamera;
  const dist = Math.hypot(cam.position.x, cam.position.y, cam.position.z);
  if (dist > 0) {
    const tighten =
      nodeCount > 18 ? 0.6 : nodeCount > 12 ? 0.66 : nodeCount > 8 ? 0.72 : 0.76;
    api.cameraPosition(
      {
        x: cam.position.x * tighten,
        y: cam.position.y * tighten,
        z: cam.position.z * tighten,
      },
      undefined,
      0,
    );
  }
}

const POPUP_WIDTH = 300;
const POPUP_OFFSET_X = 18;

function sentimentLabel(sentiment: SwarmGraphNode["sentiment"]): string {
  if (sentiment === "positive") return "Positive";
  if (sentiment === "neutral") return "Neutral";
  if (sentiment === "objecting") return "Objecting";
  return "Pending";
}

function positionNodePopup(
  el: HTMLDivElement,
  screenX: number,
  screenY: number,
  containerW: number,
  containerH: number,
) {
  el.style.display = "block";
  const popupH = el.offsetHeight || 168;
  let left = screenX + POPUP_OFFSET_X;
  if (left + POPUP_WIDTH > containerW - 12) {
    left = screenX - POPUP_WIDTH - POPUP_OFFSET_X;
  }
  left = Math.max(12, Math.min(left, containerW - POPUP_WIDTH - 12));
  const top = Math.max(
    popupH / 2 + 12,
    Math.min(screenY, containerH - popupH / 2 - 12),
  );
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function applyGraphForces(
  api: ForceGraphMethods,
  activeNodeCount: number,
  displayRound: 1 | 2,
) {
  const { charge, linkDistance } = graphForceSettings(activeNodeCount, displayRound);
  api.d3Force("charge")?.strength((node: object) =>
    chargeStrengthForNode(node as SwarmGraphNode, charge),
  );
  api.d3Force("link")?.distance(linkDistance);
}

const GraphCanvas = memo(function GraphCanvas({
  graphData,
  width,
  height,
  displayRound,
  activeNodeCount,
  isSwarmRunning,
  onReady,
  onNodeClick,
  onBackgroundClick,
}: GraphCanvasProps) {
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const graphDataRef = useRef(graphData);
  const nodeMeshesRef = useRef(new Map<string, GlowNodeParts>());
  const bloomAddedRef = useRef(false);
  const sceneDecorRef = useRef<ReturnType<typeof decorateSwarmScene> | null>(null);
  const animRef = useRef(0);
  const zoomFittedRef = useRef(false);
  const readyRef = useRef(false);

  graphDataRef.current = graphData;

  useEffect(() => {
    readyRef.current = false;
    zoomFittedRef.current = false;
    bloomAddedRef.current = false;
    nodeMeshesRef.current.clear();
    sceneDecorRef.current?.dispose();
    sceneDecorRef.current = null;
    return () => {
      cancelAnimationFrame(animRef.current);
      sceneDecorRef.current?.dispose();
      sceneDecorRef.current = null;
      nodeMeshesRef.current.clear();
    };
  }, [graphData.nodes.length, displayRound]);

  const handleEngineTick = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;

    if (!readyRef.current) {
      readyRef.current = true;
      onReady(graph);
    }

    if (!bloomAddedRef.current) {
      graph.scene().background = new THREE.Color(SWARM_GRAPH_BG_NUM);
      graph.renderer().setClearColor(SWARM_GRAPH_BG_NUM, 1);
      graph.renderer().toneMapping = THREE.ACESFilmicToneMapping;
      graph.renderer().toneMappingExposure = 0.72;
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.42,
        0.35,
        0.22,
      );
      graph.postProcessingComposer().addPass(bloomPass);
      sceneDecorRef.current = decorateSwarmScene(graph.scene());
      bloomAddedRef.current = true;
    }

    const decor = sceneDecorRef.current;
    if (decor) {
      decor.tick(performance.now());
    }

    for (const node of graphDataRef.current.nodes) {
      const parts = nodeMeshesRef.current.get(node.id);
      if (!parts) continue;
      const radius = node.isAmbient
        ? 0.18
        : activeNodeRadius(node.val, activeNodeCount);
      const emissive =
        !node.isAmbient && !node.sentiment && isSwarmRunning
          ? node.emissiveIntensity + Math.sin(performance.now() * 0.004) * 0.08
          : node.emissiveIntensity;
      updateGlowNode(
        parts,
        node.color,
        emissive,
        radius,
        !!node.isAmbient,
      );
    }
  }, [activeNodeCount, height, isSwarmRunning, onReady, width]);

  const handleNodeThreeObject = useCallback(
    (node: object) => {
      const graphNode = node as SwarmGraphNode;
      const radius = graphNode.isAmbient
        ? 0.18
        : activeNodeRadius(graphNode.val, activeNodeCount);
      const parts = createGlowNode(
        graphNode.color,
        graphNode.emissiveIntensity,
        radius,
        !!graphNode.isAmbient,
      );
      nodeMeshesRef.current.set(graphNode.id, parts);
      return parts.group;
    },
    [activeNodeCount],
  );

  return (
    <div className="absolute inset-0 z-[8]">
      <ForceGraph3D
      ref={graphRef as MutableRefObject<ForceGraphMethods>}
      width={width}
      height={height}
      graphData={graphData}
      backgroundColor={SWARM_GRAPH_BG}
      showNavInfo={false}
      nodeId="id"
      nodeLabel=""
      nodeThreeObject={handleNodeThreeObject}
      nodeThreeObjectExtend={false}
      linkColor={(link) => (link as SwarmGraphLink).color}
      linkWidth={(link) => {
        const l = link as SwarmGraphLink;
        if (l.isCrossSegment) return 0.08;
        if (displayRound === 2 && l.peerActivated) return 0.32;
        return 0.18;
      }}
      linkOpacity={0.14}
      linkCurvature={0.28}
      linkResolution={8}
      linkDirectionalParticles={(link) => {
        const l = link as SwarmGraphLink;
        if (l.isCrossSegment) return 0;
        return displayRound === 2 && l.peerActivated ? 3 : 1;
      }}
      linkDirectionalParticleSpeed={0.004}
      linkDirectionalParticleWidth={0.45}
      linkDirectionalParticleColor={(link) => (link as SwarmGraphLink).color}
      d3AlphaDecay={0.018}
      d3VelocityDecay={0.32}
      warmupTicks={120}
      cooldownTicks={180}
      onEngineTick={handleEngineTick}
      onEngineStop={() => {
        if (zoomFittedRef.current || !graphRef.current) return;
        zoomFittedRef.current = true;
        fitActiveNodes(graphRef.current, displayRound, activeNodeCount);
      }}
      onNodeClick={(node) => {
        const graphNode = node as SwarmGraphNode;
        if (!graphNode.isAmbient) onNodeClick(graphNode);
      }}
      onBackgroundClick={onBackgroundClick}
    />
    </div>
  );
});

function NodeDetailPopup({
  node,
  popupRef,
  onClose,
}: {
  node: SwarmGraphNode;
  popupRef: MutableRefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-label={`${node.label} agent response`}
      className="swarm-node-popup pointer-events-auto absolute z-[25] hidden w-[300px] rounded-xl border border-stone-700/80 bg-cream-deep/95 p-0 shadow-2xl backdrop-blur-md"
      style={{ transform: "translateY(-50%)" }}
    >
      <div className="flex items-start justify-between gap-2 border-b border-stone-800 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-stone-100">{node.label}</h3>
          <p className="mt-0.5 text-[11px] text-stone-500">
            {SEGMENT_LABELS[node.segment]}
            {node.round ? ` · Round ${node.round}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-stone-500 transition hover:bg-stone-800 hover:text-stone-200"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <dl className="space-y-3 px-4 py-3 text-xs">
        <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1">
          <dt className="font-medium text-stone-500">Sentiment</dt>
          <dd>
            {node.sentiment ? (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 font-medium capitalize swarm-node-label--${node.sentiment}`}
                style={{ fontSize: "11px", textShadow: "none" }}
              >
                {sentimentLabel(node.sentiment)}
              </span>
            ) : (
              <span className="text-stone-500">Awaiting reaction</span>
            )}
          </dd>
        </div>

        <div className="grid grid-cols-[88px_1fr] gap-x-2">
          <dt className="font-medium text-stone-500">Reaction</dt>
          <dd className="text-sm leading-relaxed text-stone-300">
            {node.reasoningText ?? "Swarm has not reacted yet."}
          </dd>
        </div>

        {node.citedSignal ? (
          <div className="grid grid-cols-[88px_1fr] gap-x-2 border-t border-stone-800 pt-3">
            <dt className="font-medium text-stone-500">Cited signal</dt>
            <dd className="text-sm italic leading-relaxed text-stone-400">
              &ldquo;{node.citedSignal}&rdquo;
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function resolveFocusedGraphNode(
  focusedNode: SwarmGraphNode | null,
  nodes: SwarmGraphNode[],
): SwarmGraphNode | null {
  if (!focusedNode) return null;
  return (
    nodes.find((node) => node.id === focusedNode.id && !node.isAmbient) ??
    focusedNode
  );
}

export function SwarmGraph({
  personas,
  reactions,
  isSwarmRunning = false,
  emptyMessage = "No personas to display.",
  ambientLeads: ambientLeadsOverride,
  fillContainer = false,
}: SwarmGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsLayerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const graphApiRef = useRef<ForceGraphMethods | undefined>(undefined);
  const graphDataRef = useRef(buildSwarmGraphData([], []));
  const labelElsRef = useRef(new Map<string, HTMLDivElement>());
  const focusedNodeRef = useRef<SwarmGraphNode | null>(null);
  const rafRef = useRef(0);

  const [dimensions, setDimensions] = useState({ width: 640, height: 480 });
  const [focusedNode, setFocusedNode] = useState<SwarmGraphNode | null>(null);
  const [displayRound, setDisplayRound] = useState<1 | 2>(1);

  focusedNodeRef.current = focusedNode;

  const safeReactions = reactions ?? [];
  const safePersonas = personas ?? [];
  const ambientLeadsQuery = useQuery(
    api.leads.listAmbientGraphLeads,
    ambientLeadsOverride !== undefined ? "skip" : {},
  ) ?? [];

  const filteredAmbientLeads = useMemo(() => {
    if (ambientLeadsOverride !== undefined) {
      return ambientLeadsOverride;
    }
    const activeIds = new Set(safePersonas.map((persona) => persona._id));
    return ambientLeadsQuery.filter((lead) => !activeIds.has(lead._id));
  }, [ambientLeadsOverride, ambientLeadsQuery, safePersonas]);

  const hasRound2Data = useMemo(
    () => safeReactions.some((r) => (r.round ?? 1) === 2),
    [safeReactions],
  );

  const displayReactions = useMemo(
    () => pickDisplayReactions(safeReactions, displayRound),
    [safeReactions, displayRound],
  );

  const round2Count = useMemo(
    () => safeReactions.filter((r) => r.round === 2).length,
    [safeReactions],
  );

  const graphData = useMemo(
    () =>
      buildSwarmGraphData(
        safePersonas,
        displayReactions,
        displayRound,
        filteredAmbientLeads,
      ),
    [safePersonas, displayReactions, displayRound, filteredAmbientLeads],
  );

  const activeNodeCount = safePersonas.length || 6;

  graphDataRef.current = graphData;

  const nodeIds = useMemo(
    () => graphData.nodes.map((node) => node.id).join(","),
    [graphData.nodes],
  );

  const handleGraphReady = useCallback(
    (api: ForceGraphMethods) => {
      graphApiRef.current = api;
      applyGraphForces(api, activeNodeCount, displayRound);
    },
    [activeNodeCount, displayRound],
  );

  useEffect(() => {
    const api = graphApiRef.current;
    if (!api) return;
    applyGraphForces(api, activeNodeCount, displayRound);
    api.d3ReheatSimulation();
  }, [activeNodeCount, displayRound, graphData.links.length]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const layer = labelsLayerRef.current;
    if (!layer) return;

    labelElsRef.current.clear();
    layer.innerHTML = "";
    for (const node of graphData.nodes) {
      const el = document.createElement("div");
      el.dataset.id = node.id;
      if (node.isAmbient) {
        el.className = "swarm-node-label swarm-node-label--ambient absolute";
      } else if (node.sentiment) {
        el.className = `swarm-node-label swarm-node-label--${node.sentiment} absolute`;
      } else if (isSwarmRunning) {
        el.className = "swarm-node-label swarm-node-label--pending absolute";
      } else {
        el.className = "swarm-node-label absolute";
      }
      el.textContent = node.shortLabel;
      el.style.display = "none";
      layer.appendChild(el);
      labelElsRef.current.set(node.id, el);
    }
  }, [nodeIds, graphData.nodes, isSwarmRunning]);

  useEffect(() => {
    const loop = () => {
      const api = graphApiRef.current;
      const layer = labelsLayerRef.current;
      if (api && layer) {
        for (const node of graphDataRef.current.nodes) {
          const el = labelElsRef.current.get(node.id);
          const world = nodeWorldPosition(node);
          if (!el || !world) {
            if (el) el.style.display = "none";
            continue;
          }
          const coords = api.graph2ScreenCoords(world.x, world.y, world.z);
          if (
            !Number.isFinite(coords.x) ||
            !Number.isFinite(coords.y) ||
            coords.x < -40 ||
            coords.y < -40 ||
            coords.x > dimensions.width + 40 ||
            coords.y > dimensions.height + 40
          ) {
            el.style.display = "none";
            continue;
          }
          el.style.display = "block";
          if (!node.isAmbient) {
            const sentimentClass = node.sentiment
              ? `swarm-node-label--${node.sentiment}`
              : isSwarmRunning
                ? "swarm-node-label--pending"
                : "";
            el.className = `swarm-node-label absolute ${sentimentClass}`.trim();
          }
          el.style.left = `${coords.x + (node.labelOffsetX ?? 0)}px`;
          el.style.top = `${coords.y + (node.labelOffsetY ?? (node.isAmbient ? 8 : 18))}px`;
        }

        const popupEl = popupRef.current;
        const focusedId = focusedNodeRef.current?.id;
        const focused =
          focusedId != null
            ? graphDataRef.current.nodes.find((node) => node.id === focusedId)
            : null;
        if (popupEl && focused && !focused.isAmbient) {
          const world = nodeWorldPosition(focused);
          if (world) {
            const coords = api.graph2ScreenCoords(world.x, world.y, world.z);
            if (
              Number.isFinite(coords.x) &&
              Number.isFinite(coords.y) &&
              coords.x >= -24 &&
              coords.y >= -24 &&
              coords.x <= dimensions.width + 24 &&
              coords.y <= dimensions.height + 24
            ) {
              positionNodePopup(
                popupEl,
                coords.x,
                coords.y,
                dimensions.width,
                dimensions.height,
              );
            } else {
              popupEl.style.display = "none";
            }
          } else {
            popupEl.style.display = "none";
          }
        } else if (popupEl) {
          popupEl.style.display = "none";
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dimensions.height, dimensions.width, isSwarmRunning]);

  useEffect(() => {
    if (displayRound === 2 && !hasRound2Data) {
      setDisplayRound(1);
    }
  }, [displayRound, hasRound2Data]);

  useEffect(() => {
    if (round2Count === 0 || displayRound !== 2) return;
    const interval = window.setInterval(() => {
      const api = graphApiRef.current;
      if (!api) return;
      for (const link of graphDataRef.current.links) {
        if (link.peerActivated) api.emitParticle(link);
      }
    }, 2200);
    return () => window.clearInterval(interval);
  }, [displayRound, round2Count]);

  useEffect(() => {
    const api = graphApiRef.current;
    if (!api || safePersonas.length === 0) return;
    const timer = window.setTimeout(() => {
      fitActiveNodes(api, displayRound, activeNodeCount);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [displayReactions.length, activeNodeCount, displayRound, safePersonas.length]);

  const simulatedCount = useMemo(() => {
    const ids = new Set<string>();
    for (const reaction of safeReactions) {
      if ((reaction.round ?? 1) <= 2) ids.add(reaction.leadId);
    }
    return ids.size;
  }, [safeReactions]);

  if (personas === undefined) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-stone-800 bg-cream-deep text-sm text-stone-500 ${
          fillContainer ? "h-full min-h-[480px]" : "h-[480px]"
        }`}
      >
        Connecting to Convex…
      </div>
    );
  }

  if (safePersonas.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-stone-800 bg-cream-deep px-6 text-center text-sm text-stone-500 ${
          fillContainer ? "h-full min-h-[480px]" : "h-[480px]"
        }`}
      >
        {emptyMessage}
      </div>
    );
  }

  const hasPeerFlow = displayRound === 2 && round2Count > 0;
  const showRoundToggle = displayReactions.length > 0;
  const focusedGraphNode = resolveFocusedGraphNode(focusedNode, graphData.nodes);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-[#040408] ${
        fillContainer ? "min-h-0" : "h-[420px] rounded-xl border border-stone-900/80 shadow-inner"
      }`}
    >
      <SwarmGraphBackdrop />
      <GraphCanvas
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        displayRound={displayRound}
        activeNodeCount={activeNodeCount}
        isSwarmRunning={isSwarmRunning}
        onReady={handleGraphReady}
        onNodeClick={(node) => {
          if (node.isAmbient) return;
          setFocusedNode((prev) => (prev?.id === node.id ? null : node));
        }}
        onBackgroundClick={() => setFocusedNode(null)}
      />

      <SwarmGraphForeground active={safePersonas.length > 0} />

      <div
        ref={labelsLayerRef}
        className="pointer-events-none absolute inset-0 z-[20] overflow-hidden"
      />

      {(isSwarmRunning || simulatedCount > 0) && (
        <div className="pointer-events-none absolute right-4 top-4 z-30">
          <div className="rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 shadow-xl backdrop-blur-md">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
              Live simulation
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">
              {simulatedCount}
              <span className="text-sm font-normal text-white/40">
                {" "}
                / {safePersonas.length}
              </span>
            </p>
            {isSwarmRunning ? (
              <div className="mt-2 h-1 w-28 overflow-hidden rounded-full bg-cream-deep/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-300 via-emerald-300 to-sky-400 transition-all duration-500"
                  style={{
                    width: `${Math.max(8, (simulatedCount / Math.max(safePersonas.length, 1)) * 100)}%`,
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}

      {showRoundToggle ? (
        <div className="absolute inset-x-0 top-10 z-30 flex justify-center">
          <div
            className="flex rounded-full border border-white/15 bg-black/40 p-0.5 shadow-lg backdrop-blur-md"
            role="group"
            aria-label="Swarm round"
          >
            <button
              type="button"
              onClick={() => setDisplayRound(1)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                displayRound === 1
                  ? "bg-cream-deep/15 text-white"
                  : "text-white/45 hover:text-white/70"
              }`}
            >
              Round 1
            </button>
            <button
              type="button"
              onClick={() => hasRound2Data && setDisplayRound(2)}
              disabled={!hasRound2Data}
              title={
                hasRound2Data
                  ? "Peer influence — agents re-react after seeing segment peers"
                  : "Run with round 2 enabled to unlock"
              }
              className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                displayRound === 2
                  ? "bg-brand-blue/80 text-stone-100"
                  : "text-white/45 hover:text-white/70"
              }`}
            >
              Round 2
            </button>
          </div>
        </div>
      ) : null}

      {displayReactions.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center">
          <p className="rounded-full border border-white/10 bg-black/35 px-4 py-1.5 text-xs text-white/50 backdrop-blur-sm">
            {isSwarmRunning
              ? "Swarm running — nodes blooming live"
              : "Idle swarm — run to populate"}
          </p>
        </div>
      ) : hasPeerFlow ? (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center">
          <p className="rounded-full border border-emerald-400/20 bg-emerald-950/40 px-4 py-1.5 text-xs text-emerald-200/80 backdrop-blur-sm">
            Round 2 — peer influence pulsing through segments
          </p>
        </div>
      ) : displayRound === 1 && displayReactions.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center">
          <p className="rounded-full border border-white/10 bg-black/35 px-4 py-1.5 text-xs text-white/45 backdrop-blur-sm">
            Round 1 — solo reactions
          </p>
        </div>
      ) : null}

      {focusedGraphNode ? (
        <NodeDetailPopup
          node={focusedGraphNode}
          popupRef={popupRef}
          onClose={() => setFocusedNode(null)}
        />
      ) : null}
    </div>
  );
}
