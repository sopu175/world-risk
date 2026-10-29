"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Layers3, Map as MapIcon, ScrollText, Radio, Waves, Languages } from "lucide-react";
import { fetchLayers, fetchObservations, fetchEvents, runBootstrap } from "@/lib/api-client";
import { useAtlas } from "@/lib/store";
import { useTranslation } from "@/lib/i18n";
import { Logo } from "@/components/atlas/Logo";
import { MapView } from "@/components/atlas/MapView";
import { WindyMapView } from "@/components/atlas/WindyMapView";
import { LayerPanel } from "@/components/atlas/LayerPanel";
import { LocationPanel } from "@/components/atlas/LocationPanel";
import { EventsPanel, EventDetailSheet } from "@/components/atlas/EventsPanel";
import { MethodologyPanel } from "@/components/atlas/MethodologyPanel";
import { Sheet as UiSheet, SheetContent as UiSheetContent, SheetTitle as UiSheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function AtlasShell() {
  const { view, setView, selectedLocation, setLocation, activeLayers, flyTarget, clearFly } = useAtlas();
  const { t, locale, setLocale } = useTranslation();
  const qc = useQueryClient();
  const [layersDrawerOpen, setLayersDrawerOpen] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  // First-run bootstrap: idempotent; kicks the initial ingestion on a fresh DB.
  useEffect(() => {
    runBootstrap()
      .catch(() => undefined)
      .finally(() => {
        setBootstrapping(false);
        qc.invalidateQueries({ queryKey: ["layers"] });
        qc.invalidateQueries({ queryKey: ["obs"] });
        qc.invalidateQueries({ queryKey: ["events"] });
      });
  }, [qc]);

  const layersQ = useQuery({ queryKey: ["layers"], queryFn: fetchLayers, refetchInterval: 60_000 });

  const obsQ = useQuery({
    queryKey: ["obs"],
    queryFn: () => fetchObservations(4000),
    staleTime: 150_000,
    refetchInterval: 180_000,
  });

  const eventsQ = useQuery({
    queryKey: ["events", "all", "all", 365],
    queryFn: () => fetchEvents({ type: "all", kind: "all", days: 365, limit: 500 }),
    staleTime: 150_000,
    refetchInterval: 180_000,
  });

  const showMap = view === "map" || view === "events";

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      {/* ------------------------------------------------------------ header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 lg:px-4">
        <button
          className="flex items-center text-left transition-opacity hover:opacity-90"
          onClick={() => setView("map")}
          aria-label="WorldRisk Atlas home"
        >
          <Logo showSubtitle={false} />
        </button>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main navigation">
          <NavButton active={view === "map"} onClick={() => setView("map")} icon={<MapIcon className="h-3.5 w-3.5" />} label={t("navMap")} />
          <NavButton
            active={view === "windy"}
            onClick={() => setView("windy")}
            icon={<Waves className="h-3.5 w-3.5 text-teal-600 animate-pulse" />}
            label={t("navWindy")}
          />
          <NavButton active={view === "events"} onClick={() => setView("events")} icon={<Radio className="h-3.5 w-3.5" />} label={t("navEvents")} />
          <NavButton active={view === "about"} onClick={() => setView("about")} icon={<ScrollText className="h-3.5 w-3.5" />} label={t("navAbout")} />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {bootstrapping && (
            <span className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              {t("preparingData")}
            </span>
          )}

          {/* mobile layers drawer */}
          <Sheet open={layersDrawerOpen} onOpenChange={setLayersDrawerOpen}>
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setLayersDrawerOpen(true)}
              aria-expanded={layersDrawerOpen}
              aria-haspopup="dialog"
            >
              <Layers3 className="mr-1.5 h-4 w-4" /> {t("layersBtn")}
            </Button>
            <UiSheetContent side="left" className="w-[320px] p-0">
              <SheetHeader className="border-b p-4 pb-3">
                <SheetTitle className="text-sm">{t("searchAndLayers")}</SheetTitle>
              </SheetHeader>
              <div className="h-[calc(100%-57px)]">
                <LayerPanel onLocate={() => setLayersDrawerOpen(false)} />
              </div>
            </UiSheetContent>
          </Sheet>

          {/* mobile nav */}
          <MobileNav />

          {/* Bilingual Language Switcher (EN / বাংলা) */}
          <div className="flex items-center rounded-lg border bg-muted/50 p-0.5 shadow-2xs">
            <button
              onClick={() => setLocale("en")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition-all",
                locale === "en"
                  ? "bg-white text-teal-900 shadow-xs ring-1 ring-black/5"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="English"
              aria-label="Switch to English"
            >
              EN
            </button>
            <button
              onClick={() => setLocale("bn")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition-all",
                locale === "bn"
                  ? "bg-white text-teal-900 shadow-xs ring-1 ring-black/5"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="বাংলা (Bengali)"
              aria-label="বাংলা ভাষায় পরিবর্তন করুন"
            >
              বাংলা
            </button>
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------- main */}
      <main className="relative min-h-0 flex-1">
        {view === "windy" ? (
          <WindyMapView />
        ) : showMap ? (
          <div className="flex h-full">
            <aside className="hidden w-[340px] shrink-0 border-r bg-background lg:block">
              {view === "map" ? (
                <LayerPanel />
              ) : (
                <EventsPanel />
              )}
            </aside>
            <div className="relative min-w-0 flex-1">
              {/* Floating Quick Mode Switcher */}
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border bg-background/95 p-1 shadow-md backdrop-blur">
                <button
                  onClick={() => setView("map")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    view === "map" ? "bg-foreground text-background shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MapIcon className="h-3 w-3" />
                  <span>{t("navMap")}</span>
                </button>
                <button
                  onClick={() => setView("windy")}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  title="Switch to Windy live animated waves and wind model"
                >
                  <Waves className="h-3 w-3 text-teal-600 animate-pulse" />
                  <span>{t("navWindy")}</span>
                </button>
              </div>

              <MapView
                layers={layersQ.data ?? []}
                observations={obsQ.data ?? []}
                events={eventsQ.data ?? []}
                activeLayers={activeLayers}
                onSelectEvent={(e) => useAtlas.getState().openEvent(e)}
                onRequestLocation={(loc) => setLocation(loc)}
                flyTarget={flyTarget}
                onFlyDone={clearFly}
              />

              {obsQ.isFetching && (
                <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm border">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-600" /> {t("syncingHazard")}
                </div>
              )}

              {/* mobile: floating locate hint */}
              <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm border md:hidden">
                {t("tapToInspect")}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full">
            <MethodologyPanel />
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------- footer */}
      <footer className="shrink-0 border-t bg-background">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[10.5px] leading-none text-muted-foreground">
          <span className="font-medium text-foreground/70">Open data:</span>
          <a className="hover:text-foreground hover:underline" href="https://earthquake.usgs.gov/earthquakes/feed/" target="_blank" rel="noopener noreferrer">USGS (public domain)</a>
          <span aria-hidden>·</span>
          <a className="hover:text-foreground hover:underline" href="https://eonet.gsfc.nasa.gov/api/v3" target="_blank" rel="noopener noreferrer">NASA EONET (public domain)</a>
          <span aria-hidden>·</span>
          <a className="hover:text-foreground hover:underline" href="https://open-meteo.com/en/license" target="_blank" rel="noopener noreferrer">Open-Meteo ERA5/CAMS/Forecast (CC-BY 4.0)</a>
          <span aria-hidden>·</span>
          <a className="hover:text-foreground hover:underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · OpenFreeMap</a>
          <span className="ml-auto hidden sm:inline">
            Area-level indicators — never street-level safety advice. <button className="underline hover:text-foreground" onClick={() => setView("about")}>Read methodology</button>
          </span>
        </div>
      </footer>

      {/* -------------------------------------------------------- overlays */}
      {selectedLocation && (
        <UiSheet open onOpenChange={(v) => !v && useAtlas.getState().clearLocation()}>
          <UiSheetContent side="right" className="flex h-full max-h-screen w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[460px]">
            {/* Radix requires a DialogTitle inside the sheet — the visible header
                lives in LocationPanel, so expose this one to screen readers only. */}
            <UiSheetTitle className="sr-only">Location details</UiSheetTitle>
            <LocationPanel />
          </UiSheetContent>
        </UiSheet>
      )}
      <EventDetailSheet />
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Button variant={active ? "secondary" : "ghost"} size="sm" onClick={onClick} className={cn(active && "font-medium")} aria-current={active ? "page" : undefined}>
      {icon}
      <span className="ml-1.5">{label}</span>
    </Button>
  );
}

function MobileNav() {
  const { view, setView } = useAtlas();
  return (
    <div className="flex items-center gap-1 md:hidden">
      <NavButton active={view === "map"} onClick={() => setView("map")} icon={<MapIcon className="h-4 w-4" />} label="" />
      <NavButton active={view === "windy"} onClick={() => setView("windy")} icon={<Waves className="h-4 w-4 text-teal-500" />} label="" />
      <NavButton active={view === "events"} onClick={() => setView("events")} icon={<Radio className="h-4 w-4" />} label="" />
      <NavButton active={view === "about"} onClick={() => setView("about")} icon={<ScrollText className="h-4 w-4" />} label="" />
    </div>
  );
}
