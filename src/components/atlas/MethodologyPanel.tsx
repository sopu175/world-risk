"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchLayers } from "@/lib/api-client";
import { StatusBadge } from "@/components/atlas/ui-bits";
import { useTranslation } from "@/lib/i18n";
import { AlertTriangle, Scale, CircleDashed } from "lucide-react";

function getLayerTitle(key: string, defaultName: string, isBn: boolean): string {
  if (!isBn) return defaultName;
  switch (key) {
    case "earthquake":
      return "ভূমিকম্প (USGS M২.৫+)";
    case "wildfire":
      return "সক্রিয় দাবানল (NASA EONET)";
    case "flood":
      return "বন্যা ঝুঁকি অঞ্চল";
    case "cyclone":
      return "ঘূর্ণিঝড় ও সাইক্লোন";
    case "drought":
      return "তীব্র তাপপ্রবাহ ও খরা";
    case "volcano":
      return "আগ্নেয়গিরির সক্রিয়তা";
    case "waves":
      return "সমুদ্র তরঙ্গ ও ঢেউ";
    default:
      return defaultName;
  }
}

export function MethodologyPanel() {
  const { t, isBn } = useTranslation();
  const layersQ = useQuery({ queryKey: ["layers"], queryFn: fetchLayers, refetchInterval: 60_000 });
  const layers = layersQ.data ?? [];

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-3xl space-y-6 p-6 pb-16">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">{t("methodologyTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("methodologySubtitle")}</p>
        </header>

        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/50">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" /> {t("whatPlatformIsNot")}
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-snug text-amber-900/90 dark:text-amber-200/90">
            <li>{t("notWarning1")}</li>
            <li>{t("notWarning2")}</li>
            <li>{t("notWarning3")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CircleDashed className="h-4 w-4" /> {t("hazardLayersAndMethod")}
          </h2>
          <div className="space-y-2">
            {layersQ.isLoading && <p className="text-xs text-muted-foreground">{t("loadingRegistry")}</p>}
            {layers.map((l) => (
              <div key={l.key} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.colorHex }} />
                  <span className="text-[13px] font-semibold">{getLayerTitle(l.key, l.name, isBn)}</span>
                  <StatusBadge status={l.status} />
                  <span className="text-[11px] text-muted-foreground">
                    {l.recordCount.toLocaleString()} {t("recordsCount")}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{l.description}</p>
                {l.methodology && (
                  <p className="mt-1 text-xs leading-snug">
                    <span className="font-medium">{t("method")}:</span> {l.methodology}
                  </p>
                )}
                {l.limitations && (
                  <p className="mt-1 text-xs leading-snug text-amber-800 dark:text-amber-300">
                    <span className="font-medium">{t("limitations")}:</span> {l.limitations}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Scale className="h-4 w-4" /> {t("sourcesLicensing")}
          </h2>
          <div className="overflow-hidden rounded-lg border text-xs">
            <table className="w-full">
              <thead className="bg-muted/70 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("tableSource")}</th>
                  <th className="px-2 py-2 font-medium">{t("tableUsedFor")}</th>
                  <th className="px-2 py-2 font-medium">{t("tableLicense")}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "U.S. Geological Survey — Earthquake Hazards Program",
                    isBn ? "ভূমিকম্প স্তর, স্থানের ভূকম্পন ইতিহাস" : "earthquake layer, location seismic history",
                    isBn ? "পাবলিক ডোমেইন (ইউএস সরকার)" : "Public domain (U.S. Government)",
                    "https://www.usgs.gov/information-policies-and-instructions",
                  ],
                  [
                    "NASA EONET v3 (event feed + category archives)",
                    isBn ? "নথিভুক্ত দুর্যোগ: দাবানল, বন্যা, সাইক্লোন, আগ্নেয়গিরি" : "documented events: wildfire, flood, cyclone, volcano (5-year category archive)",
                    isBn ? "পাবলিক ডোমেইন (নাসা)" : "Public domain (NASA)",
                    "https://eonet.gsfc.nasa.gov/api/v3",
                  ],
                  [
                    "Open-Meteo Weather Forecast (ECMWF IFS / NOAA GFS)",
                    isBn ? "বায়ুপ্রবাহ ও দমকা হাওয়া স্তর — বৈশ্বিক উইন্ড গ্রিড" : "wind & gusts layer — global wind-speed grid",
                    "CC-BY 4.0",
                    "https://open-meteo.com/en/docs",
                  ],
                  [
                    "Open-Meteo Marine (ECMWF WAM)",
                    isBn ? "সমুদ্র তরঙ্গ — তাৎপর্যপূর্ণ তরঙ্গের উচ্চতা গ্রিড" : "ocean waves — significant wave height grid",
                    "CC-BY 4.0",
                    "https://open-meteo.com/en/docs/marine-weather-api",
                  ],
                  [
                    "Open-Meteo (ERA5 / CAMS / GeoNames)",
                    isBn ? "তাপপ্রবাহ প্রোফাইল, বায়ু জলবায়ু, PM2.5, জিওকোডিং" : "heat profile, wind climatology, PM2.5, geocoding",
                    "CC-BY 4.0",
                    "https://open-meteo.com/en/license",
                  ],
                  [
                    "OpenStreetMap Nominatim",
                    isBn ? "রিভার্স জিওকোডিং (মানচিত্রে স্থান অনুসন্ধান)" : "reverse geocoding",
                    "ODbL 1.0",
                    "https://www.openstreetmap.org/copyright",
                  ],
                  [
                    "OpenFreeMap + OpenMapTiles + OpenStreetMap",
                    isBn ? "নিরপেক্ষ পজিট্রন ভেক্টর বেসম্যাপ" : "neutral basemap (Positron / dark)",
                    isBn ? "উন্মুক্ত, কোনো কি প্রয়োজন নেই" : "Free, no key — © OpenStreetMap contributors",
                    "https://openfreemap.org/",
                  ],
                ].map(([name, use, license, url]) => (
                  <tr key={name} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      <a className="underline hover:text-foreground" href={url} target="_blank" rel="noopener noreferrer">
                        {name}
                      </a>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{use}</td>
                    <td className="px-2 py-2 text-muted-foreground">{license}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {isBn
              ? "ReliefWeb (UN OCHA) এবং NASA FIRMS সোর্স ক্যাটালগে তালিকাভুক্ত তবে বিনামূল্যে ক্রেডেনশিয়াল কনফিগার না হওয়া পর্যন্ত নিষ্ক্রিয় থাকে। প্ল্যাটফর্ম কখনোই কোনো অনুমানের তথ্য যোগ করে না।"
              : "ReliefWeb (UN OCHA) and NASA FIRMS are registered in the source catalog but disabled until their free credentials are configured (RELIEFWEB_APPNAME, FIRMS_MAP_KEY). The atlas never substitutes estimates for unconfigured sources."}
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">{t("verificationStatuses")}</h2>
          <ul className="mt-2 space-y-1 text-[13px] leading-snug text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">{isBn ? "ক্রস-যাচাইকৃত" : "Cross-verified"}</span> — {t("crossVerifiedDesc")}
            </li>
            <li>
              <span className="font-medium text-foreground">{isBn ? "উৎস-রিপোর্টকৃত" : "Source-reported"}</span> — {t("sourceReportedDesc")}
            </li>
            <li>
              <span className="font-medium text-foreground">{isBn ? "অযাচাইকৃত" : "Unverified"}</span> — {t("unverifiedDesc")}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold">{t("dataPipelineQuality")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-snug text-muted-foreground">
            <li>{t("pipeline1")}</li>
            <li>{t("pipeline2")}</li>
            <li>{t("pipeline3")}</li>
            <li>{t("pipeline4")}</li>
            <li>{t("pipeline5")}</li>
            <li>{t("pipeline6")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold">{t("platformRoadmap")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-snug text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">{isBn ? "সবার জন্য উন্মুক্ত প্রবেশাধিকার" : "Free public access"}</span> — {t("roadmap1")}
            </li>
            <li>
              <span className="font-medium text-foreground">{isBn ? "প্রিমিয়াম রিপোর্ট ও পোর্টফোলিও পর্যবেক্ষণ" : "Premium reports & portfolio monitoring"}</span> — {t("roadmap2")}
            </li>
            <li>
              <span className="font-medium text-foreground">{isBn ? "ব্যবসায়িক এপিআই" : "Business API"}</span> — {t("roadmap3")}
            </li>
            <li>
              <span className="font-medium text-foreground">{isBn ? "বাল্ক এক্সপোর্ট" : "Bulk exports"}</span> — {t("roadmap4")}
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
