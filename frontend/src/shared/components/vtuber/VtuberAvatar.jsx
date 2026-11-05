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

export default function VtuberAvatar({
  emotion = "neutral",
  speaking = false,
  audioLevel = 0,
  size = 220,
  palette = {},
  className,
}) {
  const [blink, setBlink] = useState(false);
  const colors = { ...DEFAULT_PALETTE, ...palette };
  const level = speaking ? Math.max(0, Math.min(1, Number(audioLevel) || 0)) : 0;
  const dimension = typeof size === "number" ? `${size}px` : size;
  const isSad = emotion === "sad";
  const isAngry = emotion === "angry";
  const isSurprised = emotion === "surprised";
  const isShy = emotion === "shy";
  const eyeY = blink ? 43 : isSad ? 42 : 40;

  useEffect(() => {
    let timer;
    let active = true;
    const scheduleBlink = () => {
      timer = window.setTimeout(() => {
        if (!active) return;
        setBlink(true);
        timer = window.setTimeout(() => {
          if (!active) return;
          setBlink(false);
          scheduleBlink();
        }, 130);
      }, 2400 + Math.random() * 2400);
    };
    scheduleBlink();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center align-middle select-none",
        speaking && "drop-shadow-[0_0_12px_rgba(59,130,246,0.24)]",
        className,
      )}
      style={{ width: dimension, height: dimension }}
      role="img"
      aria-label={`Karakter VTuber Kuro, ekspresi ${emotion}${speaking ? ", sedang berbicara" : ""}`}
    >
      <svg viewBox="0 0 200 200" className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="kuro-shirt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={colors.outfit} />
            <stop offset="1" stopColor={colors.bg} />
          </linearGradient>
        </defs>
        <ellipse cx="100" cy="188" rx="70" ry="8" fill={colors.line} opacity=".12" />
        <path d="M35 194 Q39 143 75 137 L125 137 Q161 143 165 194Z" fill="url(#kuro-shirt)" stroke={colors.line} strokeWidth="4" strokeLinejoin="round"/>
        <path d="M77 139 L100 164 L123 139 L114 194 L86 194Z" fill={colors.accent} stroke={colors.line} strokeWidth="2.5"/>
        <path d="M88 151 L100 164 L112 151 L108 194 L92 194Z" fill={colors.hair2} opacity=".9"/>
        <path d="M48 75 Q37 18 99 13 Q165 10 155 88 L148 133 Q133 153 100 153 Q61 151 49 124Z" fill={colors.hair} stroke={colors.line} strokeWidth="4"/>
        <path d="M62 77 Q57 43 83 35 Q115 20 143 49 Q156 66 145 115 Q137 145 101 146 Q70 144 59 117Z" fill={colors.skin} stroke={colors.line} strokeWidth="3"/>
        <path d="M51 91 Q42 45 76 23 Q105 2 139 26 Q163 43 153 91 Q141 70 132 56 Q111 73 82 67 Q67 66 51 91Z" fill={colors.hair} stroke={colors.line} strokeWidth="4" strokeLinejoin="round"/>
        <path d="M57 67 Q72 54 86 42 Q82 68 72 86 Q64 94 56 99Z" fill={colors.hair2}/>
        <path d="M92 61 Q111 37 137 48 Q130 75 112 83 Q99 82 92 61Z" fill={colors.hair2}/>
        <path d="M134 61 Q153 73 154 105 Q145 94 137 89Z" fill={colors.hair2}/>
        <path d="M54 101 Q42 119 53 146 Q36 133 37 112Z" fill={colors.hair} stroke={colors.line} strokeWidth="3"/>
        <path d="M146 101 Q161 118 148 148 Q166 133 164 111Z" fill={colors.hair} stroke={colors.line} strokeWidth="3"/>
        <path d="M75 88 Q85 81 94 87" fill="none" stroke={colors.line} strokeWidth="3" strokeLinecap="round"/>
        <path d="M108 87 Q119 81 129 88" fill="none" stroke={colors.line} strokeWidth="3" strokeLinecap="round"/>
        {blink ? (
          <g fill="none" stroke={colors.line} strokeWidth="3.5" strokeLinecap="round">
            <path d="M75 101 Q85 105 95 101"/><path d="M106 101 Q117 105 128 101"/>
          </g>
        ) : (
          <g>
            <ellipse cx="85" cy={eyeY} rx={isSurprised ? 7 : 6} ry={isSurprised ? 10 : 8} fill={colors.eye}/>
            <ellipse cx="117" cy={eyeY} rx={isSurprised ? 7 : 6} ry={isSurprised ? 10 : 8} fill={colors.eye}/>
            <circle cx="87" cy={eyeY - 3} r="2.5" fill="white"/><circle cx="119" cy={eyeY - 3} r="2.5" fill="white"/>
            {isAngry && <path d="M76 81 L94 86 M108 86 L127 81" stroke={colors.line} strokeWidth="3.5" strokeLinecap="round"/>}
          </g>
        )}
        <ellipse cx="69" cy="113" rx="9" ry="4" fill={colors.hair2} opacity={isShy ? ".8" : ".42"}/>
        <ellipse cx="134" cy="113" rx="9" ry="4" fill={colors.hair2} opacity={isShy ? ".8" : ".42"}/>
        {speaking ? (
          <ellipse cx="101" cy="123" rx={3 + level * 3} ry={2 + level * 5} fill={colors.mouth}/>
        ) : isSurprised ? (
          <ellipse cx="101" cy="122" rx="4" ry="6" fill={colors.mouth}/>
        ) : (
          <path d={isSad ? "M92 127 Q101 119 110 127" : "M92 120 Q101 131 110 120"} fill="none" stroke={colors.mouth} strokeWidth="3" strokeLinecap="round"/>
        )}
        <path d="M72 150 L57 173 M128 150 L143 173" stroke={colors.line} strokeWidth="4" strokeLinecap="round"/>
        <path d="M45 174 Q54 166 64 176 M136 176 Q146 166 155 174" fill="none" stroke={colors.accent} strokeWidth="5" strokeLinecap="round"/>
        <path d="M42 35 Q29 57 39 81 M157 30 Q174 57 163 81" fill="none" stroke={colors.accent} strokeWidth="4" strokeLinecap="round" opacity=".9"/>
      </svg>
      {speaking && (
        <span className="absolute right-[7%] top-[7%] rounded-full border border-white/80 bg-emerald-500 px-1.5 py-0.5 text-[8px] font-black tracking-wide text-white shadow-sm">
          LIVE
        </span>
      )}
    </div>
  );
}
