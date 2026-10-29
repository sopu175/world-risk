"use client";

// Global UI state (zustand). Server state lives in TanStack Query.

import { create } from "zustand";
import type { EventDTO } from "@/lib/types";

export type ViewMode = "map" | "events" | "admin" | "about";

export type SelectedLocation = {
  latitude: number;
  longitude: number;
  name?: string;
  country?: string;
  countryCode?: string;
};

export type FlyTarget = { lat: number; lng: number; zoom?: number; nonce: number };

type AtlasState = {
  view: ViewMode;
  selectedLocation: SelectedLocation | null;
  selectedEvent: EventDTO | null;
  activeLayers: string[];
  flyTarget: FlyTarget | null;
  adminToken: string;
  sessionId: string;

  setView: (v: ViewMode) => void;
  setLocation: (loc: SelectedLocation) => void;
  clearLocation: () => void;
  openEvent: (e: EventDTO) => void;
  clearEvent: () => void;
  toggleLayer: (key: string) => void;
  setActiveLayers: (keys: string[]) => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  clearFly: () => void;
  setAdminToken: (t: string) => void;
};

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
  view: "map",
  selectedLocation: null,
  selectedEvent: null,
  activeLayers: ["earthquake"],
  flyTarget: null,
  adminToken: typeof window !== "undefined" ? window.sessionStorage.getItem("wra-admin-token") ?? "" : "",
  sessionId: typeof window !== "undefined" ? getSessionId() : "ssr",

  setView: (v) => set({ view: v }),
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
  setAdminToken: (t) => {
    if (typeof window !== "undefined") window.sessionStorage.setItem("wra-admin-token", t);
    set({ adminToken: t });
  },
}));
