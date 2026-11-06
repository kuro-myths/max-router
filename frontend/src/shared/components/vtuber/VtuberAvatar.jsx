import { cn } from "@/shared/utils/cn";

export default function VtuberAvatar({
  emotion = "neutral",
  speaking = false,
  audioLevel = 0,
  size = 220,
  className,
}) {
  const level = speaking ? Math.max(0, Math.min(1, Number(audioLevel) || 0)) : 0;
  const dimension = typeof size === "number" ? `${size}px` : size;
  const mouthHeight = 2 + level * 5;

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden", className)}
      style={{ width: dimension, height: dimension }}
      role="img"
      aria-label={`Karakter VTuber Kuro, ekspresi ${emotion}${speaking ? ", sedang berbicara" : ""}`}
      data-vtuber-emotion={emotion}
    >
      <img
        src="/vtuber/kuro-avatar.svg"
        alt=""
        draggable={false}
        decoding="async"
        loading="eager"
        className="h-full w-full select-none object-contain transition-transform duration-200"
        style={{ transform: speaking ? `translateY(${level * 1.5}px) scale(${1 + level * 0.008})` : "none" }}
      />
      {speaking && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 rounded-[50%] bg-[#572b3d] shadow-inner"
            style={{
              top: "43.5%",
              width: `${4 + level * 2}%`,
              height: `${mouthHeight}%`,
              transform: "translateX(-50%)",
              opacity: 0.92,
            }}
          />
          <span className="absolute right-[7%] top-[7%] rounded-full border border-white/80 bg-emerald-500 px-1.5 py-0.5 text-[8px] font-black tracking-wide text-white shadow-sm">
            LIVE
          </span>
        </>
      )}
    </div>
  );
}
