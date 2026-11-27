import { cn } from "cn";
import { useId } from "react";

/** Superellipse (n = 5): the continuous-corner tile of a phone app icon. */
const TILE =
  "M32 16L31.97 22.32L31.88 24.32L31.72 25.76L31.50 26.90L31.22 27.84L30.86 28.65L30.43 29.34L29.93 29.93L29.34 30.43L28.65 30.86L27.84 31.22L26.90 31.50L25.76 31.72L24.32 31.88L22.32 31.97L16 32L9.68 31.97L7.68 31.88L6.24 31.72L5.10 31.50L4.16 31.22L3.35 30.86L2.66 30.43L2.07 29.93L1.57 29.34L1.14 28.65L0.78 27.84L0.50 26.90L0.28 25.76L0.12 24.32L0.03 22.32L0 16L0.03 9.68L0.12 7.68L0.28 6.24L0.50 5.10L0.78 4.16L1.14 3.35L1.57 2.66L2.07 2.07L2.66 1.57L3.35 1.14L4.16 0.78L5.10 0.50L6.24 0.28L7.68 0.12L9.68 0.03L16 0L22.32 0.03L24.32 0.12L25.76 0.28L26.90 0.50L27.84 0.78L28.65 1.14L29.34 1.57L29.93 2.07L30.43 2.66L30.86 3.35L31.22 4.16L31.50 5.10L31.72 6.24L31.88 7.68L31.97 9.68Z";

/**
 * Laboratory mark: a concrete test cube, the specimen the lab crushes in its press, lit from above
 * on a navy Warta tile. The tile's light top edge keeps it apart from a navy background too.
 */
export function BrandMark({ className }: { className?: string }) {
  const tile = `brand-tile-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-9 shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b5290" />
          <stop offset="1" stopColor="#0a2f5c" />
        </linearGradient>
      </defs>
      <path d={TILE} fill={`url(#${tile})`} />
      <ellipse cx="16" cy="25.1" rx="7" ry="1.3" fill="#000" opacity=".22" />
      <path d="M16 6.6 23.79 11.1 16 15.6 8.21 11.1Z" fill="#f4f5f6" />
      <path d="M8.21 11.1 16 15.6V24.6L8.21 20.1Z" fill="#c8ccd1" />
      <path d="M16 15.6 23.79 11.1V20.1L16 24.6Z" fill="#9aa1a9" />
      {/* Air voids, visible only at large sizes. */}
      <g fill="#000" opacity=".18">
        <circle cx="10.6" cy="15.6" r=".4" />
        <circle cx="13.3" cy="20.6" r=".32" />
        <circle cx="19.4" cy="17.3" r=".36" />
        <circle cx="21.6" cy="15.1" r=".3" />
        <circle cx="18.6" cy="21.7" r=".32" />
      </g>
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
