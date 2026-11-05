import { useEffect, useState } from "react";
import { cn } from "@/shared/utils/cn";
import avatarImage from "./avatarData";

export default function VtuberAvatar({
  emotion = "neutral",
  speaking = false,
  audioLevel = 0,
  size = 220,
  className,
}) {
  const [blink, setBlink] = useState(false);
  const level = speaking ? Math.max(0, Math.min(1, Number(audioLevel) || 0)) : 0;
  const dimension = typeof size === "number" ? `${size}px` : size;

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
        }, 120);
      }, 2600 + Math.random() * 2600);
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
      <img
        src={avatarImage}
        alt=""
        draggable={false}
        decoding="async"
        className="h-full w-full object-contain transition-transform duration-150"
        style={{
          transform: speaking
            ? `translateY(${level * 2}px) scale(${1 + level * 0.012})`
            : "translateY(0) scale(1)",
        }}
      />
      {blink && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M31 31 Q40 35 48 31" fill="none" stroke="#352f45" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M52 31 Q60 35 69 31" fill="none" stroke="#352f45" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
      {speaking && (
        <span className="absolute right-[7%] top-[7%] rounded-full border border-white/80 bg-emerald-500 px-1.5 py-0.5 text-[8px] font-black tracking-wide text-white shadow-sm">
          LIVE
        </span>
      )}
    </div>
  );
}
