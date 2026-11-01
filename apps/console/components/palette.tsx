"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLive } from "../lib/live";

const pages = [
  ["/", "Fleet"],
  ["/incidents", "Incidents"],
  ["/incidents/inc-bad-deploy-advise", "War room · bad deploy"],
  ["/map", "Topology"],
  ["/services", "Catalog"],
  ["/changes", "Changes"],
  ["/connectors", "Connectors"],
  ["/lab", "Policy lab"],
  ["/audit", "Audit"],
];

const signals = [
  ["bad-deploy-advise", "Fire: bad deploy (advise)"],
  ["bad-deploy-act", "Fire: bad deploy (act, sandbox replay)"],
  ["retry-storm", "Fire: retry storm"],
  ["access-denied", "Fire: AccessDenied after rotation"],
  ["two-strikes", "Fire: rollback that never holds"],
  ["healthy-critical-title", "Fire: CRITICAL alarm on a healthy SLI"],
];

export function Palette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { fire } = useLive();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[18vh] z-50 w-[min(620px,92vw)] -translate-x-1/2 border border-line bg-panel/95 backdrop-blur-xl"
    >
      <Command.Input
        placeholder="Jump to a page or fire a signal"
        className="w-full border-b border-line bg-transparent px-4 py-3 text-[15px] outline-none placeholder:text-faint"
      />
      <Command.List className="max-h-[52vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-[13px] text-faint">Nothing matches.</Command.Empty>
        <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-faint">
          {pages.map(([href, label]) => (
            <Command.Item
              key={href}
              value={label}
              onSelect={() => run(() => router.push(href))}
              className="cursor-pointer px-3 py-2 text-[13px] text-muted data-[selected=true]:bg-panel-2 data-[selected=true]:text-ink"
            >
              {label}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Replay a signal" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-faint">
          {signals.map(([id, label]) => (
            <Command.Item
              key={id}
              value={label}
              onSelect={() => run(() => void fire(id))}
              className="cursor-pointer px-3 py-2 text-[13px] text-muted data-[selected=true]:bg-panel-2 data-[selected=true]:text-amber"
            >
              {label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
