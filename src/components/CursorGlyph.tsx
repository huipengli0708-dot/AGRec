import type { CursorKind } from "../lib/api";

type Props = {
  kind: CursorKind;
  color: string;
  outlineColor: string;
  size: number; // 像素
};

/** 与导出端 CursorRenderer 保持一致的形状，用于界面预览和编辑器叠加层 */
export function CursorGlyph({ kind, color, outlineColor, size }: Props) {
  if (kind === "none") return null;
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 100 100" } as const;

  if (kind === "arrow" || kind === "arrowLight") {
    const fill = kind === "arrowLight" ? outlineColor : color;
    const stroke = kind === "arrowLight" ? color : outlineColor;
    return (
      <svg {...common} style={{ overflow: "visible" }}>
        <polygon
          points="16,10 16,86 35,68 47,95 60,89 48,63 72,62"
          fill={fill}
          stroke={stroke}
          strokeWidth={4.5}
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,.45))" }}
        />
      </svg>
    );
  }
  if (kind === "dot") {
    return (
      <svg {...common}>
        <circle cx="50" cy="50" r="28" fill={color} stroke={outlineColor} strokeWidth={5}
          style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,.4))" }} />
      </svg>
    );
  }
  if (kind === "ring") {
    return (
      <svg {...common}>
        <circle cx="50" cy="50" r="32" fill="none" stroke={color} strokeWidth={9} />
        <circle cx="50" cy="50" r="6" fill={color} />
      </svg>
    );
  }
  // halo
  return (
    <svg {...common}>
      <defs>
        <radialGradient id="zl-halo">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#zl-halo)" />
      <circle cx="50" cy="50" r="10" fill={color} />
    </svg>
  );
}

/** 热点（0~1，左上原点），与 Swift 端一致 */
export function hotspotOf(kind: CursorKind): { x: number; y: number } {
  if (kind === "arrow" || kind === "arrowLight") return { x: 0.16, y: 0.10 };
  return { x: 0.5, y: 0.5 };
}
