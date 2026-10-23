"use client";

import { History as HistoryIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import * as actions from "./actions";
import { useEditor } from "./store";

export function HistoryPanel() {
  const history = useEditor((s) => s.snapshot?.history);
  const index = useEditor((s) => s.snapshot?.historyIndex ?? 0);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [index, history?.length]);

  if (!history) return <div className="p-3 text-ink-faint">No document</div>;

  return (
    <ul className="h-full overflow-y-auto bg-panel py-1 text-[12px]" aria-label="History" data-testid="history">
      {history.map((entry, i) => (
        <li
          key={i}
          ref={i === index ? activeRef : undefined}
          aria-current={i === index}
          onClick={() => actions.jumpToHistory(i)}
          className={`flex h-7 cursor-default items-center gap-2 px-2 ${i === index ? "bg-accent/25" : "hover:bg-panel-hover"} ${
            i > index ? "text-ink-faint" : ""
          }`}
        >
          <HistoryIcon size={13} className="shrink-0 text-ink-muted" />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
