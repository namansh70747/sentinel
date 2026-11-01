"use client";

import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes: Node[] = [
  { id: "alb", position: { x: 40, y: 150 }, data: { label: "ALB" }, type: "svc" },
  { id: "web", position: { x: 260, y: 140 }, data: { label: "storefront-web", hot: true }, type: "svc" },
  { id: "cart", position: { x: 520, y: 40 }, data: { label: "cart" }, type: "svc" },
  { id: "aurora", position: { x: 520, y: 150 }, data: { label: "Aurora" }, type: "svc" },
  { id: "ddb", position: { x: 520, y: 260 }, data: { label: "DynamoDB" }, type: "svc" },
  { id: "sqs", position: { x: 760, y: 150 }, data: { label: "SQS" }, type: "svc" },
];

const edges: Edge[] = [
  { id: "a", source: "alb", target: "web", sourceHandle: "out", targetHandle: "in", animated: true, style: { stroke: "oklch(0.82 0.12 85)" } },
  { id: "b", source: "web", target: "cart", sourceHandle: "out", targetHandle: "in", style: { stroke: "oklch(0.45 0.02 75)" } },
  { id: "c", source: "web", target: "aurora", sourceHandle: "out", targetHandle: "in", style: { stroke: "oklch(0.45 0.02 75)" } },
  { id: "d", source: "web", target: "ddb", sourceHandle: "out", targetHandle: "in", animated: true, label: "throttle", style: { stroke: "oklch(0.68 0.18 28)" } },
  { id: "e", source: "cart", target: "sqs", sourceHandle: "out", targetHandle: "in", style: { stroke: "oklch(0.45 0.02 75)" } },
];

function Svc({ data }: { data: { label: string; hot?: boolean } }) {
  return (
    <div className={`min-w-[120px] border px-3 py-2 ${data.hot ? "border-sev1 bg-panel-2" : "border-line bg-panel"}`}>
      <Handle id="in" type="target" position={Position.Left} style={{ background: "oklch(0.45 0.02 75)", width: 6, height: 6 }} />
      <div className="font-mono text-[10px] text-faint">{data.hot ? "sev1" : "steady"}</div>
      <div className="text-[13px]">{data.label}</div>
      <Handle id="out" type="source" position={Position.Right} style={{ background: "oklch(0.45 0.02 75)", width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = { svc: Svc };

export function Topology() {
  return (
    <div className="h-[560px] w-full border border-line">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        colorMode="light"
        nodesDraggable
        nodesConnectable={false}
        style={{ width: "100%", height: "100%" }}
      >
        <Background color="oklch(0.3 0.012 75)" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
