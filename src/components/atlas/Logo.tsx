"use client";

import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function WorldRiskEmblem({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 drop-shadow-xs", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="emblemBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f766e" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
        <linearGradient id="waveGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id="beaconGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>

      {/* Rounded Container */}
      <rect width="512" height="512" rx="128" fill="url(#emblemBg)" />

      {/* Globe Lat/Lon Grid lines */}
      <circle cx="256" cy="256" r="180" stroke="#ccfbf1" strokeOpacity="0.4" strokeWidth="6" strokeDasharray="10 8" />
      <ellipse cx="256" cy="256" rx="180" ry="80" stroke="#ccfbf1" strokeOpacity="0.35" strokeWidth="5" />
      <ellipse cx="256" cy="256" rx="90" ry="180" stroke="#ccfbf1" strokeOpacity="0.35" strokeWidth="5" />
      <line x1="76" y1="256" x2="436" y2="256" stroke="#ccfbf1" strokeOpacity="0.4" strokeWidth="5" />

      {/* Dynamic Ocean Swell / Wave Crest */}
      <path
        d="M120 280 C 160 230, 200 320, 256 260 C 310 200, 350 290, 392 240"
        stroke="url(#waveGlow)"
        strokeWidth="20"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M140 330 C 180 290, 215 360, 265 310 C 315 260, 345 330, 372 300"
        stroke="#5eead4"
        strokeWidth="12"
        strokeLinecap="round"
        strokeOpacity="0.85"
        fill="none"
      />

      {/* Central Seismic Beacon & Waves */}
      <circle cx="256" cy="205" r="48" stroke="#f59e0b" strokeOpacity="0.5" strokeWidth="5" strokeDasharray="6 6" />
      <circle cx="256" cy="205" r="30" fill="url(#beaconGlow)" />
      <circle cx="256" cy="205" r="15" fill="#ffffff" />
    </svg>
  );
}

export function Logo({
  showSubtitle = true,
  className,
}: {
  showSubtitle?: boolean;
  className?: string;
}) {
  const { t, isBn } = useTranslation();

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <WorldRiskEmblem size={30} />
      <div className="flex flex-col text-left leading-none">
        <span className="text-[14px] font-bold tracking-tight text-foreground">
          {isBn ? (
            <span>ওয়ার্ল্ডরিস্ক <span className="text-teal-700">অ্যাটলাস</span></span>
          ) : (
            <span>WorldRisk <span className="text-teal-700">Atlas</span></span>
          )}
        </span>
        {showSubtitle && (
          <span className="mt-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("brandSubtitle")}
          </span>
        )}
      </div>
    </div>
  );
}
