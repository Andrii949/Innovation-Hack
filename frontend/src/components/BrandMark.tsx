import { cn } from "cn";

/**
 * Warta plant mark: lime tile with the plant's preheater tower, rotary kiln and silo. The lime tile
 * keeps the mark legible on the navy header.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-9 shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      <rect width="32" height="32" rx="8" className="fill-brand-lime" />
      <g className="fill-brand-navy">
        <path d="M6 24.6V11.4l2.9-2.7 2.9 2.7v13.2z" />
        <rect x="25" y="16.2" width="3.6" height="8.4" />
        <rect x="4" y="25.4" width="24" height="1.5" rx="0.75" />
      </g>
      <path
        d="M11.6 19.4 24.4 13"
        className="stroke-brand-navy"
        strokeWidth="2.9"
        strokeLinecap="round"
      />
      <circle cx="18" cy="16.2" r="1.1" className="fill-brand-lime" />
    </svg>
  );
}

/** Cement-plant elevation used as brand art: preheater tower, kiln, mill hall, silos, stack. */
export function PlantSkyline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 92"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* Preheater tower */}
      <path d="M16 88V42h7V24h24v18h7v46" />
      <path d="M28 24V10h12v14" />
      <path d="M16 42h38M16 58h38M16 74h38" opacity=".65" />
      <path d="M30 42v46M44 42v46" opacity=".45" />
      {/* Rotary kiln on piers */}
      <g transform="rotate(-12 116 76)">
        <rect x="56" y="68" width="120" height="13" rx="6.5" />
        <path d="M100 81v7M150 81v7" />
        <circle cx="130" cy="74.5" r="10" opacity=".8" />
      </g>
      {/* Mill hall with sawtooth roof */}
      <path d="M182 88V76l12-10 12 10 12-10 12 10 12-10 12 10v12" />
      <path d="M194 88V70M218 88V70M242 88V72" opacity=".45" />
      {/* Clinker conveyor */}
      <path d="M188 66 252 52" opacity=".8" />
      <path d="M206 63v9M226 59v9" opacity=".45" />
      {/* Storage silos */}
      <path d="M262 88V56a9 9 0 0 1 18 0v32" />
      <path d="M284 88V56a9 9 0 0 1 18 0v32" />
      <path d="M262 70h18M284 70h18" opacity=".45" />
      {/* Pipe rack and stack */}
      <path d="M306 70h70" opacity=".7" />
      <path d="M318 70v18M346 70v18M370 70v18" opacity=".45" />
      <path d="M376 88V16h12v72" />
      <path d="M376 34h12M376 52h12M376 70h12" opacity=".5" />
      <path d="M4 88h432" />
    </svg>
  );
}
