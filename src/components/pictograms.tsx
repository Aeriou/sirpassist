import type { ReactNode } from "react";
import type { GhsCode } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABELS: Record<GhsCode, string> = {
  GHS01: "Explosif",
  GHS02: "Inflammable",
  GHS03: "Comburant",
  GHS04: "Gaz sous pression",
  GHS05: "Corrosif",
  GHS06: "Toxique",
  GHS07: "Irritant",
  GHS08: "Danger santé",
  GHS09: "Danger environnement",
};

function Diamond({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-12", className)} aria-hidden>
      <rect
        x="10"
        y="10"
        width="44"
        height="44"
        rx="2"
        transform="rotate(45 32 32)"
        fill="#f4f4f0"
        stroke="#c0392b"
        strokeWidth="3.2"
      />
      {children}
    </svg>
  );
}

export function GhsPictogram({ code, className }: { code: GhsCode; className?: string }) {
  return (
    <Diamond className={className}>
      {code === "GHS02" && (
        <g fill="#1a1a1a">
          <path d="M32 16c2 6 3 10 2 14 6-2 10-1 14 2-4 2-8 4-12 4 2 5 2 9 0 14-2-5-5-8-8-9-2 4-6 7-10 9 1-6 2-10 1-14-5 1-9-1-13-4 5-2 9-3 13-2-1-5 2-9 5-14z" />
        </g>
      )}
      {code === "GHS05" && (
        <g fill="none" stroke="#1a1a1a" strokeWidth="2.2" strokeLinecap="round">
          <path d="M22 24h8v8H22zM34 22h10v6H34z" fill="#1a1a1a" stroke="none" />
          <path d="M26 32v6c0 4 12 4 12 0v-8" />
          <path d="M22 46h20M24 46c0-3 3-5 8-5s8 2 8 5" />
        </g>
      )}
      {code === "GHS08" && (
        <g fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinejoin="round">
          <circle cx="32" cy="22" r="4" fill="#1a1a1a" stroke="none" />
          <path d="M32 26v8M26 30h12M24 48l8-14 8 14M28 38h8" />
        </g>
      )}
      {code === "GHS07" && (
        <g fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round">
          <circle cx="32" cy="32" r="12" />
          <path d="M32 26v8M32 38v2" />
        </g>
      )}
      {code === "GHS06" && (
        <g fill="#1a1a1a">
          <circle cx="32" cy="24" r="6" />
          <path d="M22 30h20l-4 8h-12zM26 38v8h12v-8M24 48h16" />
          <path d="M20 22h6M38 22h6" stroke="#1a1a1a" strokeWidth="2" />
        </g>
      )}
      {code === "GHS09" && (
        <g fill="none" stroke="#1a1a1a" strokeWidth="2">
          <path d="M20 40c4-8 8-10 12-10s8 2 12 10" />
          <path d="M24 28c2 2 4 2 6 0M34 26c2 2 4 2 6-1" />
          <path d="M32 18v6" />
        </g>
      )}
      {code === "GHS01" && (
        <g fill="#1a1a1a">
          <path d="M32 16l3 10 10-2-8 8 8 6-11-1-2 10-3-10-11 3 7-8-8-7 11 1z" />
        </g>
      )}
      {code === "GHS03" && (
        <g fill="#1a1a1a">
          <circle cx="32" cy="32" r="5" />
          <path
            d="M32 18v6M32 40v6M18 32h6M40 32h6M22 22l4 4M38 38l4 4M42 22l-4 4M26 38l-4 4"
            stroke="#1a1a1a"
            strokeWidth="2"
          />
        </g>
      )}
      {code === "GHS04" && (
        <g fill="none" stroke="#1a1a1a" strokeWidth="2.2">
          <rect x="24" y="20" width="16" height="24" rx="2" />
          <path d="M28 20v-4h8v4" />
        </g>
      )}
    </Diamond>
  );
}

export function GhsRow({ codes }: { codes: GhsCode[] }) {
  if (!codes.length) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {codes.map((c) => (
        <li key={c} className="flex flex-col items-center gap-1">
          <GhsPictogram code={c} />
          <span className="text-center text-xs font-medium tracking-wide text-muted">
            {LABELS[c]}
          </span>
        </li>
      ))}
    </ul>
  );
}

export { LABELS as GHS_LABELS };
