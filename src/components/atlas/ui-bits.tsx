"use client";

// Small presentational primitives shared across atlas panels.

import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/geo";
import { EVENT_TYPE_LABELS, getEventTypeLabel } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Info } from "lucide-react";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { isBn } = useTranslation();
  const map: Record<string, { label: string; labelBn: string; cls: string }> = {
    live: { label: "Live", labelBn: "লাইভ", cls: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
    needs_config: { label: "Needs config", labelBn: "কনফিগ প্রয়োজন", cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
    unavailable: { label: "Unavailable", labelBn: "অনুপলব্ধ", cls: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800" },
    location_level: { label: "Location-level", labelBn: "স্থানভিত্তিক", cls: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-900" },
    active: { label: "Active", labelBn: "সক্রিয়", cls: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
    disabled: { label: "Disabled", labelBn: "নিষ্ক্রিয়", cls: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800" },
    auto_disabled: { label: "Auto-disabled", labelBn: "স্বয়ংক্রিয় নিষ্ক্রিয়", cls: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900" },
    failed: { label: "Failing", labelBn: "ব্যর্থ", cls: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900" },
    success: { label: "Success", labelBn: "সফল", cls: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
    partial: { label: "Partial", labelBn: "আংশিক", cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
    running: { label: "Running", labelBn: "চলছে", cls: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900" },
  };
  const v = map[status] ?? { label: status, labelBn: status, cls: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800" };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", v.cls, className)}>
      {isBn ? v.labelBn : v.label}
    </span>
  );
}

export function TypeChip({ eventType, colorHex, className }: { eventType: string; colorHex?: string; className?: string }) {
  const { isBn } = useTranslation();
  const color = colorHex ?? "#57534e";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground", className)}
    >
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {getEventTypeLabel(eventType, isBn)}
    </span>
  );
}

export function VerificationBadge({ status }: { status: string }) {
  const { isBn } = useTranslation();
  if (status === "cross_verified") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400" title={isBn ? "দুই বা ততোধিক অফিশিয়াল উৎস দ্বারা নিশ্চিত" : "Reported by two or more official sources"}>
        <ShieldCheck className="h-3.5 w-3.5" /> {isBn ? "ক্রস-যাচাইকৃত" : "Cross-verified"}
      </span>
    );
  }
  if (status === "unverified") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500" title={isBn ? "অফিশিয়াল উৎস দ্বারা এখনও নিশ্চিত করা হয়নি" : "Not yet confirmed by an official source"}>
        <ShieldQuestion className="h-3.5 w-3.5" /> {isBn ? "অযাচাইকৃত" : "Unverified"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400" title={isBn ? "উৎস দ্বারা প্রতিবেদনকৃত; স্বাধীনভাবে যাচাই করা হয়নি" : "As reported by the cited source; not independently confirmed"}>
      <ShieldAlert className="h-3.5 w-3.5" /> {isBn ? "উৎস-রিপোর্টকৃত" : "Source-reported"}
    </span>
  );
}

export function Freshness({ at, className }: { at: string | null; className?: string }) {
  const { isBn } = useTranslation();
  const ageHours = at ? (Date.now() - new Date(at).getTime()) / 3600_000 : null;
  const color = ageHours === null ? "bg-zinc-300 dark:bg-zinc-700" : ageHours < 12 ? "bg-emerald-500" : ageHours < 48 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground", className)} title={at ? new Date(at).toUTCString() : "no successful import yet"}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", color)} />
      {at ? (isBn ? `হালনাগাদ ${relativeTime(at)}` : `updated ${relativeTime(at)}`) : (isBn ? "কখনো আপডেট হয়নি" : "never updated")}
    </span>
  );
}

export function MiniStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function InfoHint({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-start gap-1.5 rounded-md bg-muted px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
      <Info className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{children}</span>
    </span>
  );
}
