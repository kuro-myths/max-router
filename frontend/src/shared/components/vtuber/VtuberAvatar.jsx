import { useEffect, useState } from "react";
import { cn } from "@/shared/utils/cn";

const DEFAULT_PALETTE = {
  bg: "#35224f",
  hair: "#ff79b0",
  hair2: "#f45b9c",
  skin: "#ffe9da",
  eye: "#4c1d95",
  accent: "#ffd6e8",
  outfit: "#7c3aed",
  line: "#292343",
  mouth: "#7f1d3a",
};

const MOUTHS = {
  neutral: { kind: "path", d: "M112 149 Q120 154 128 149" },
  sad: { kind: "path", d: "M112 153 Q120 147 128 153" },
  angry: { kind: "path", d: "M110 151 L115 147 L120 151 L125 147 L130 151" },
  surprised: { kind: "o" },
  thinking: { kind: "path", d: "M113 152 L127 149" },
  shy: { kind: "path", d: "M113 150 Q116 147 120 150 Q124 153 127 150" },
  happy: { kind: "open", d: "M108 146 Q120 160 132 146 Z" },
  excited: { kind: "open", d: "M106 145 Q120 164 134 145 Z" },
};

export default function VtuberAvatar({ emotion = "neutral", speaking = false, audioLevel = 0, palette, size = 220, className }) {
  const p = { ...DEFAULT_PALETTE, ...(palette || {}) };
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    let t1 = null;
    let t2 = null;
    const schedule = () => {
      t1 = setTimeout(() => {
        setBlink(true);
        t2 = setTimeout(() => {
          setBlink(false);
          schedule();
        }, 140);
      }, 2400 + Math.random() * 3200);
    };
    schedule();
    return () => {
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, []);

  const level = speaking ? Math.max(0, Math.min(1, Number(audioLevel) || 0)) : 0;
  const closedEyes = blink || emotion === "happy" || emotion === "excited";
  const blushOpacity = emotion === "shy" ? 0.8 : emotion === "excited" ? 0.6 : 0.4;

  const eyeParams = {
    neutral: { rx: 9, ry: 12, iris: 5.5, cy: 119 },
    sad: { rx: 9, ry: 12, iris: 5.5, cy: 122 },
    angry: { rx: 9, ry: 9, iris: 5, cy: 120 },
    surprised: { rx: 11, ry: 13, iris: 4, cy: 119 },
    thinking: { rx: 9, ry: 8, iris: 5, cy: 114 },
    shy: { rx: 9, ry: 12, iris: 5.5, cy: 119 },
    happy: { rx: 9, ry: 12, iris: 5.5, cy: 119 },
    excited: { rx: 9, ry: 12, iris: 5.5, cy: 119 },
  }[emotion] || { rx: 9, ry: 12, iris: 5.5, cy: 119 };

  const renderEye = (cx) => {
    if (closedEyes) {
      return (
        <path
          d={"M" + (cx - 9) + " 118 Q" + cx + " 108 " + (cx + 9) + " 118"}
          stroke={p.line}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
      );
    }
    return (
      <g>
        <ellipse cx={cx} cy="118" rx={eyeParams.rx} ry={eyeParams.ry} fill="#ffffff" stroke={p.line} strokeWidth={2} />
        <circle cx={cx} cy={eyeParams.cy} r={eyeParams.iris} fill={p.eye} />
        <circle cx={cx + 2} cy={eyeParams.cy - 3} r={Math.max(1.4, eyeParams.iris * 0.38)} fill="#ffffff" />
      </g>
    );
  };

  const renderBrow = (cx, side) => {
    if (emotion === "angry") {
      return side === "left"
        ? <path d="M86 105 L108 100" stroke={p.line} strokeWidth={3.5} strokeLinecap="round" fill="none" />
        : <path d="M132 100 L154 105" stroke={p.line} strokeWidth={3.5} strokeLinecap="round" fill="none" />;
    }
    if (emotion === "sad") {
      return side === "left"
        ? <path d="M88 107 L108 101" stroke={p.line} strokeWidth={3} strokeLinecap="round" fill="none" />
        : <path d="M132 101 L152 107" stroke={p.line} strokeWidth={3} strokeLinecap="round" fill="none" />;
    }
    if (emotion === "surprised") {
      return <path d={"M" + (cx - 10) + " 97 Q" + cx + " 93 " + (cx + 10) + " 97"} stroke={p.line} strokeWidth={3} strokeLinecap="round" fill="none" />;
    }
    if (emotion === "thinking" && side === "right") {
      return <path d="M132 95 Q142 91 152 95" stroke={p.line} strokeWidth={3} strokeLinecap="round" fill="none" />;
    }
    return <path d={"M" + (cx - 10) + " 102 Q" + cx + " 98 " + (cx + 10) + " 102"} stroke={p.line} strokeWidth={3} strokeLinecap="round" fill="none" />;
  };

  const renderMouth = () => {
    if (speaking) {
      return <ellipse cx="120" cy="150" rx={7 + level * 4} ry={2.5 + level * 8} fill={p.mouth} />;
    }
    const m = MOUTHS[emotion] || MOUTHS.neutral;
    if (m.kind === "open") {
      return <path d={m.d} fill={p.mouth} />;
    }
    if (m.kind === "o") {
      return <ellipse cx="120" cy="150" rx={5} ry={6} fill={p.mouth} />;
    }
    return <path d={m.d} stroke={p.line} strokeWidth={3} strokeLinecap="round" fill="none" />;
  };

  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      role="img"
      aria-label={"Karakter VTuber dengan ekspresi " + emotion}
      className={cn("select-none", className)}
    >
      <rect x="2" y="2" width="236" height="236" rx="28" fill={p.bg} />
      <circle cx="120" cy="120" r="88" fill="#ffffff" opacity="0.05" />

      {/* Halftone comic dots */}
      <g fill={p.accent} opacity="0.3">
        <circle cx="24" cy="24" r="2.2" />
        <circle cx="36" cy="24" r="2.2" />
        <circle cx="48" cy="24" r="2.2" />
        <circle cx="24" cy="36" r="2.2" />
        <circle cx="36" cy="36" r="2.2" />
        <circle cx="24" cy="48" r="2.2" />
      </g>

      {/* Body & neck */}
      <path d="M60 240 Q120 186 180 240 Z" fill={p.outfit} />
      <rect x="110" y="158" width="20" height="18" rx="6" fill={p.skin} />

      {/* Back hair & side tails */}
      <circle cx="120" cy="112" r="76" fill={p.hair} />
      <ellipse cx="56" cy="142" rx="15" ry="34" fill={p.hair} transform="rotate(14 56 142)" />
      <ellipse cx="184" cy="142" rx="15" ry="34" fill={p.hair} transform="rotate(-14 184 142)" />

      {/* Cat ears */}
      <path d="M76 74 L84 38 L108 60 Z" fill={p.hair} />
      <path d="M81 66 L85 48 L97 59 Z" fill={p.accent} opacity="0.85" />
      <path d="M164 74 L156 38 L132 60 Z" fill={p.hair} />
      <path d="M159 66 L155 48 L143 59 Z" fill={p.accent} opacity="0.85" />

      {/* Face */}
      <circle cx="120" cy="116" r="52" fill={p.skin} />

      {/* Bangs */}
      <path d="M68 118 Q66 64 120 60 Q174 64 172 118 Q154 90 140 94 Q126 76 108 94 Q92 90 68 118 Z" fill={p.hair} />
      <path d="M84 92 Q96 72 116 68" stroke={p.hair2} strokeWidth={4} fill="none" opacity="0.7" strokeLinecap="round" />
      <path d="M116 60 Q104 30 132 42 Q120 44 122 58 Z" fill={p.hair} />

      {/* Blush */}
      <ellipse cx="86" cy="136" rx="9" ry="4" fill={p.accent} opacity={blushOpacity} />
      <ellipse cx="154" cy="136" rx="9" ry="4" fill={p.accent} opacity={blushOpacity} />

      {/* Eyes & brows */}
      {renderBrow(98, "left")}
      {renderBrow(142, "right")}
      {renderEye(98)}
      {renderEye(142)}

      {/* Mouth */}
      {renderMouth()}
    </svg>
  );
}
