"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  buildSwarmGraphData,
  graphForceSettings,
  pickDisplayReactions,
  type GraphPersonaRow,
  type SwarmGraphLink,
  type SwarmGraphNode,
  type SwarmReactionRow,
} from "@/lib/swarmGraphData";

const ForceGraph3D = dynamic(() => import("./ForceGraph3DCanvas"), {
  ssr: false,
});

type SwarmGraphProps = {
  personas: GraphPersonaRow[] | undefined;
  reactions: SwarmReactionRow[] | undefined;
  isSwarmRunning?: boolean;
  emptyMessage?: string;
};

type GraphCanvasProps = {
  graphData: ReturnType<typeof buildSwarmGraphData>;
  width: number;
  height: number;
  displayRound: 1 | 2;
  onReady: (api: ForceGraphMethods) => void;
  onNodeHover: (node: SwarmGraphNode | null) => void;
  onNodeClick: (node: SwarmGraphNode) => void;
  onBackgroundClick: () => void;
};

const GraphCanvas = memo(function GraphCanvas({
  graphData,
  width,
  height,
  displayRound,
  onReady,
  onNodeHover,
  onNodeClick,
  onBackgroundClick,
}: GraphCanvasProps) {
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const bloomAddedRef = useRef(false);
  const zoomFittedRef = useRef(false);
  const readyRef = useRef(false);

  useEffect(() => {
    readyRef.current = false;
    zoomFittedRef.current = false;
  }, [graphData.nodes.length, graphData.links.length, displayRound]);

  const handleEngineTick = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;

    if (!readyRef.current) {
      readyRef.current = true;
      onReady(graph);
    }

    if (bloomAddedRef.current) return;
    graph.renderer().setClearColor(0x000000, 1);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.0,
      0.3,
      0.65,
    );
    graph.postProcessingComposer().addPass(bloomPass);
    bloomAddedRef.current = true;
  }, [height, onReady, width]);

  return (
    <ForceGraph3D
      ref={graphRef as MutableRefObject<ForceGraphMethods>}
      width={width}
      height={height}
      graphData={graphData}
      backgroundColor="#000000"
      showNavInfo={false}
      nodeId="id"
      nodeLabel=""
      nodeVal={(node) => (node as SwarmGraphNode).val}
      nodeColor={(node) => (node as SwarmGraphNode).color}
      nodeRelSize={9}
      nodeOpacity={1}
      linkColor={(link) => (link as SwarmGraphLink).color}
      linkWidth={(link) => ((link as SwarmGraphLink).peerActivated ? 0.9 : 0.55)}
      linkOpacity={0.5}
      linkResolution={3}
      linkDirectionalParticles={(link) =>
        (link as SwarmGraphLink).peerActivated ? 2 : 0
      }
      linkDirectionalParticleSpeed={0.006}
      linkDirectionalParticleWidth={1.6}
      linkDirectionalParticleColor={(link) => (link as SwarmGraphLink).color}
      d3AlphaDecay={0.025}
      d3VelocityDecay={0.4}
      warmupTicks={100}
      cooldownTicks={150}
      onEngineTick={handleEngineTick}
      onEngineStop={() => {
        if (zoomFittedRef.current) return;
        zoomFittedRef.current = true;
        graphRef.current?.zoomToFit(400, displayRound === 1 ? 120 : 80);
      }}
      onNodeHover={(node) => onNodeHover(node as SwarmGraphNode | null)}
      onNodeClick={(node) => onNodeClick(node as SwarmGraphNode)}
      onBackgroundClick={onBackgroundClick}
    />
  );
});

function NodeDetailOverlay({ node }: { node: SwarmGraphNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 rounded-xl border border-zinc-700/80 bg-zinc-950/90 p-4 shadow-xl backdrop-blur-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-50">{node.label}</h3>
        {node.sentiment ? (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs capitalize text-zinc-300">
            {node.sentiment}
          </span>
        ) : null}
        {node.round === 2 ? (
          <span className="rounded-full bg-violet-950 px-2 py-0.5 text-xs text-violet-200">
            Round 2
          </span>
        ) : null}
      </div>
      {node.reasoningText ? (
        <p className="text-sm leading-relaxed text-zinc-300">{node.reasoningText}</p>
      ) : (
        <p className="text-sm text-zinc-500">Waiting for swarm reaction…</p>
      )}
      {node.citedSignal ? (
        <p className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <span className="font-medium text-zinc-300">Cited signal: </span>
          &ldquo;{node.citedSignal}&rdquo;
        </p>
      ) : null}
    </div>
  );
}

export function SwarmGraph({
  personas,
  reactions,
  isSwarmRunning = false,
  emptyMessage = "No personas to display.",
}: SwarmGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsLayerRef = useRef<HTMLDivElement>(null);
  const graphApiRef = useRef<ForceGraphMethods | undefined>(undefined);
  const graphDataRef = useRef(buildSwarmGraphData([], []));
  const labelElsRef = useRef(new Map<string, HTMLDivElement>());
  const rafRef = useRef(0);

  const [dimensions, setDimensions] = useState({ width: 640, height: 480 });
  const [focusedNode, setFocusedNode] = useState<SwarmGraphNode | null>(null);
  const [hoverNode, setHoverNode] = useState<SwarmGraphNode | null>(null);
  const [displayRound, setDisplayRound] = useState<1 | 2>(1);

  const safeReactions = reactions ?? [];
  const safePersonas = personas ?? [];

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
    () => buildSwarmGraphData(safePersonas, displayReactions, displayRound),
    [safePersonas, displayReactions, displayRound],
  );

  graphDataRef.current = graphData;

  const nodeIds = useMemo(
    () => graphData.nodes.map((n) => n.id).join(","),
    [graphData.nodes],
  );

  const handleGraphReady = useCallback(
    (api: ForceGraphMethods) => {
      graphApiRef.current = api;
      const { charge, linkDistance } = graphForceSettings(
        graphDataRef.current.nodes.length || 6,
        displayRound,
      );
      api.d3Force("charge")?.strength(charge);
      api.d3Force("link")?.distance(linkDistance);
    },
    [displayRound],
  );

  useEffect(() => {
    const api = graphApiRef.current;
    if (!api) return;
    const { charge, linkDistance } = graphForceSettings(
      graphDataRef.current.nodes.length || 6,
      displayRound,
    );
    api.d3Force("charge")?.strength(charge);
    api.d3Force("link")?.distance(linkDistance);
    api.d3ReheatSimulation();
  }, [displayRound, graphData.nodes.length]);

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
      el.className = "swarm-node-label absolute";
      el.textContent = node.shortLabel;
      el.style.display = "none";
      layer.appendChild(el);
      labelElsRef.current.set(node.id, el);
    }
  }, [nodeIds, graphData.nodes]);

  useEffect(() => {
    const loop = () => {
      const api = graphApiRef.current;
      const layer = labelsLayerRef.current;
      if (api && layer) {
        for (const node of graphDataRef.current.nodes) {
          const el = labelElsRef.current.get(node.id);
          if (!el || node.x == null || node.y == null || node.z == null) {
            if (el) el.style.display = "none";
            continue;
          }
          const coords = api.graph2ScreenCoords(node.x, node.y, node.z);
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
          el.style.left = `${coords.x}px`;
          el.style.top = `${coords.y + 18}px`;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dimensions.height, dimensions.width]);

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

  if (personas === undefined) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-950 text-sm text-zinc-500">
        Connecting to Convex…
      </div>
    );
  }

  if (safePersonas.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-zinc-300 bg-zinc-950 px-6 text-center text-sm text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  const detailNode = focusedNode ?? hoverNode;
  const hasPeerFlow = displayRound === 2 && round2Count > 0;
  const showRoundToggle = displayReactions.length > 0;

  return (
    <div
      ref={containerRef}
      className="relative h-[480px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-black"
    >
      <GraphCanvas
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        displayRound={displayRound}
        onReady={handleGraphReady}
        onNodeHover={(node) => setHoverNode(node?.isActive ? node : null)}
        onNodeClick={(node) =>
          setFocusedNode(node.isActive ? node : null)
        }
        onBackgroundClick={() => setFocusedNode(null)}
      />

      <div
        ref={labelsLayerRef}
        className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      />

      {showRoundToggle ? (
        <div className="absolute inset-x-0 top-4 z-30 flex justify-center">
          <div
            className="flex rounded-full border border-zinc-700/80 bg-zinc-950/90 p-0.5 shadow-lg backdrop-blur-sm"
            role="group"
            aria-label="Swarm round"
          >
            <button
              type="button"
              onClick={() => setDisplayRound(1)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                displayRound === 1
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-400 hover:text-zinc-200"
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
                  ? "bg-violet-500 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Round 2
            </button>
          </div>
        </div>
      ) : null}

      {displayReactions.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center">
          <p className="rounded-full border border-zinc-800 bg-zinc-950/80 px-4 py-1.5 text-xs text-zinc-500 backdrop-blur-sm">
            {isSwarmRunning
              ? "Swarm running — watch names bloom in as reactions land"
              : "Idle swarm — run to see personas bloom in live"}
          </p>
        </div>
      ) : hasPeerFlow ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center">
          <p className="rounded-full border border-violet-900/60 bg-violet-950/70 px-4 py-1.5 text-xs text-violet-200 backdrop-blur-sm">
            Round 2 — segment links pulsing with peer influence
          </p>
        </div>
      ) : displayRound === 1 && displayReactions.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center">
          <p className="rounded-full border border-zinc-800 bg-zinc-950/80 px-4 py-1.5 text-xs text-zinc-500 backdrop-blur-sm">
            Round 1 — solo reactions before peer influence
          </p>
        </div>
      ) : null}

      {detailNode ? <NodeDetailOverlay node={detailNode} /> : null}
    </div>
  );
}
