"use client";

import { useMemo, useState } from "react";

type Item = {
  id: string;
  name: string;
  category: string;
  capabilities: string[];
  authEnv: string[];
  writes: boolean;
  ready: boolean;
};

export function ConnectorBoard({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = ["all", ...Array.from(new Set(items.map((item) => item.category)))];
  const shown = useMemo(
    () =>
      items.filter((item) => {
        const hay = `${item.name} ${item.id} ${item.capabilities.join(" ")}`.toLowerCase();
        return (category === "all" || item.category === category) && hay.includes(query.toLowerCase());
      }),
    [items, query, category],
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold leading-none">Tools</h1>
          <p className="mt-2 text-[14px] text-muted">{items.length} tools. A dark row still needs its credentials.</p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter tools"
          className="w-64 border border-line bg-panel px-3 py-2 font-mono text-[13px] outline-none placeholder:text-faint"
        />
      </div>
      <div className="mt-4 flex gap-1 overflow-x-auto">
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setCategory(name)}
            className={`border px-2 py-1 font-mono text-[11px] ${category === name ? "border-amber text-amber" : "border-line text-faint"}`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="mt-3 font-mono text-[11px] text-faint">{shown.length} shown · dark means the env vars are empty, which is expected</div>
      <div className="mt-2 grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((item) => (
          <article key={item.id} className="bg-bg px-3 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[14px]">{item.name}</h2>
              <span className={`font-mono text-[10px] ${item.writes ? "text-sev2" : "text-ok"}`}>{item.writes ? "write" : "read"}</span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-faint">{item.category}</div>
            <div className="mt-2 text-[12px] text-muted">{item.capabilities.join(" · ") || "—"}</div>
            <div className="mt-2 font-mono text-[11px] text-faint">{item.authEnv.join(" ") || "no secrets"}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
