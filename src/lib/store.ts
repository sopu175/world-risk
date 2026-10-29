"use client";

// Global UI state (zustand). Server state lives in TanStack Query.

import { create } from "zustand";
import type { EventDTO } from "@/lib/types";

export type ViewMode = "map" | "windy" | "events" | "about";
export type WindyOverlay = "waves" | "wind" | "gust" | "rain" | "temp" | "clouds" | "cams";

export type SelectedLocation = {
  latitude: number;
  longitude: number;
  name?: string;
  country?: string;
  countryCode?: string;
};

export type FlyTarget = { lat: number; lng: number; zoom?: number; nonce: number };

export type Locale = "en" | "bn";

type AtlasState = {
  locale: Locale;
  view: ViewMode;
  selectedLocation: SelectedLocation | null;
  selectedEvent: EventDTO | null;
  activeLayers: string[];
  flyTarget: FlyTarget | null;
  sessionId: string;
  windyOverlay: WindyOverlay;

  setLocale: (l: Locale) => void;
  setView: (v: ViewMode) => void;
  setWindyOverlay: (overlay: WindyOverlay) => void;
  setLocation: (loc: SelectedLocation) => void;
  clearLocation: () => void;
  openEvent: (e: EventDTO) => void;
  clearEvent: () => void;
  toggleLayer: (key: string) => void;
  setActiveLayers: (keys: string[]) => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  clearFly: () => void;
};

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem("wra-locale");
    return saved === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.localStorage.getItem("wra-session-id");
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem("wra-session-id", id);
  }
  return id;
}

export const useAtlas = create<AtlasState>((set, get) => ({
  locale: typeof window !== "undefined" ? getInitialLocale() : "en",
  view: "map",
  selectedLocation: null,
  selectedEvent: null,
  activeLayers: ["earthquake"],
  flyTarget: null,
  sessionId: typeof window !== "undefined" ? getSessionId() : "ssr",
  windyOverlay: "waves",

  setLocale: (l) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("wra-locale", l);
      } catch {
        // ignore
      }
    }
    set({ locale: l });
  },
  setView: (v) => set({ view: v }),
  setWindyOverlay: (overlay) => set({ windyOverlay: overlay }),
  setLocation: (loc) => set({ selectedLocation: loc, selectedEvent: null }),
  clearLocation: () => set({ selectedLocation: null }),
  openEvent: (e) => set({ selectedEvent: e, selectedLocation: null, view: "events" }),
  clearEvent: () => set({ selectedEvent: null }),
  toggleLayer: (key) => {
    const cur = get().activeLayers;
    set({ activeLayers: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] });
  },
  setActiveLayers: (keys) => set({ activeLayers: keys }),
  flyTo: (lat, lng, zoom = 6) => set({ flyTarget: { lat, lng, zoom, nonce: Date.now() } }),
  clearFly: () => set({ flyTarget: null }),
}));
