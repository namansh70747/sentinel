import { Topology } from "../../components/topology";

export default function MapPage() {
  return (
    <div>
      <h1 className="text-[32px] font-bold leading-none">Topology</h1>
      <p className="mt-2 mb-4 max-w-[68ch] text-[14px] text-muted">
        storefront-web is the only burning node. DynamoDB throttle is a kept hint, not a license to scale. Drag a node. Edges animate where the last hour moved.
      </p>
      <Topology />
    </div>
  );
}
