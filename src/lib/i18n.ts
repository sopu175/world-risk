import { useAtlas, type Locale } from "@/lib/store";

export const DICTIONARY = {
  en: {
    // Brand
    brandName: "WorldRisk Atlas",
    brandSubtitle: "Global Hazard Intelligence",

    // Nav
    navMap: "Atlas Map",
    navWindy: "Live Waves & Wind (Windy)",
    navEvents: "Disaster Events",
    navAbout: "Data & Sources",
    layersBtn: "Layers",
    searchAndLayers: "Search & layers",
    preparingData: "Preparing live data…",
    syncingHazard: "syncing hazard data…",
    tapToInspect: "Tap the map to inspect any location",

    // Windy View
    windyTitle: "Live Atmospheric & Oceanic Models",
    windySubtitle: "ECMWF / GFS interactive radar with real-time waves, wind vectors and storm trajectories",
    layerLabel: "Layer:",
    openInWindy: "Open in Windy.com",
    reloadRadar: "Reload Radar",
    quickPresets: "Quick Presets:",
    presetBangladesh: "Bangladesh & Bay of Bengal",
    presetIndianOcean: "Indian Ocean",
    presetEastAsia: "East Asia & Pacific",
    presetAtlantic: "Atlantic & Europe",
    presetAmericas: "Americas & Caribbean",
    overlayWaves: "Waves & Swell",
    overlayWind: "Wind Streams",
    overlayGust: "Wind Gusts",
    overlayRain: "Rain & Thunder",
    overlayTemp: "Temperature",
    overlayClouds: "Clouds",
    overlayCams: "Air Quality (PM2.5)",

    // Layer Panel
    searchPlaceholder: "Search country, region or city…",
    quickJump: "Quick Jump:",
    activeHazardLayers: "Active Hazard Layers",
    liveAndHistorical: "Live & Historical Hazards",
    toggleAdvanced: "Technical feeds & basemap info",
    activeCount: "active",
    inactiveCount: "inactive",
    layerOpacity: "Layer Opacity",
    resetDefaults: "Reset to defaults",
    liveIndicator: "LIVE",

    // Layer Titles & Summaries
    layerEarthquake: "Earthquakes (USGS M2.5+)",
    layerEarthquakeDesc: "Real-time global seismic feeds from USGS seismograph network.",
    layerWildfire: "Active Wildfires (NASA EONET / FIRMS)",
    layerWildfireDesc: "Thermal anomalies & satellite-detected active fire perimeters.",
    layerTropicalStorm: "Tropical Storms & Cyclones",
    layerTropicalStormDesc: "Active cyclones, hurricanes and typhoons tracked by JTWC & NHC.",
    layerFloodRisk: "Flood Risk Zones",
    layerFloodRiskDesc: "Monitored river basins and observed severe inundations.",
    layerHeatDrought: "Extreme Heat & Drought",
    layerHeatDroughtDesc: "ERA5 surface reanalysis anomaly and Copernicus land moisture.",
    layerVolcano: "Volcanic Activity",
    layerVolcanoDesc: "Smithsonian Global Volcanism Program active alerts.",

    // Location Panel
    locationProfile: "Location Risk Profile",
    latLabel: "Lat",
    lonLabel: "Lon",
    tabIndicators: "Indicators",
    tabTrends: "Trends",
    tabCompare: "Compare",
    tabSources: "Sources",
    saveLocation: "Save location",
    reportIssue: "Report issue",
    closePanel: "Close",
    savedSuccess: "Location saved to this session",
    
    // Indicators
    seismicRisk: "Seismic Exposure",
    heatRisk: "Extreme Heat Trend",
    airQuality: "Air Quality (PM2.5)",
    windRisk: "Wind & Storm Exposure",
    hotDaysBaseline: "Hot Days / Year",
    strongWindPeak: "48h Peak Gust",
    airStatusGood: "Good",
    airStatusModerate: "Moderate",
    airStatusUnhealthy: "Unhealthy",
    
    // Events Panel
    documentedDisasters: "Documented disaster events",
    filterType: "All hazard types",
    filterPeriod: "Time horizon",
    searchEventsPlaceholder: "Filter by title or country…",
    allEvents: "All Events",
    activeOnly: "Active only",
    totalEvents: "total",
    activeEvents: "active",

    // Language Toggle
    switchLang: "Language",
    langEn: "English",
    langBn: "বাংলা",
  },
  bn: {
    // Brand
    brandName: "ওয়ার্ল্ডরিস্ক অ্যাটলাস",
    brandSubtitle: "বৈশ্বিক দুর্যোগ ও পরিবেশগত ঝুঁকি গোয়েন্দা",

    // Nav
    navMap: "অ্যাটলাস মানচিত্র",
    navWindy: "লাইভ তরঙ্গ ও বাতাস (উইন্ডি)",
    navEvents: "দুর্যোগের ঘটনাবলী",
    navAbout: "উপাত্ত ও উৎস",
    layersBtn: "স্তরসমূহ",
    searchAndLayers: "অনুসন্ধান ও স্তরসমূহ",
    preparingData: "লাইভ উপাত্ত প্রস্তুত হচ্ছে…",
    syncingHazard: "ঝুঁকি উপাত্ত সিঙ্ক হচ্ছে…",
    tapToInspect: "যেকোনো স্থানের তথ্য দেখতে মানচিত্রে ক্লিক করুন",

    // Windy View
    windyTitle: "লাইভ বায়ুমণ্ডলীয় ও সামুদ্রিক মডেল",
    windySubtitle: "ECMWF / GFS ইন্টারেক্টিভ রাডার — রিয়েল-টাইম সমুদ্রের ঢেউ, বাতাসের প্রবাহ ও ঝড়ের গতিপথ",
    layerLabel: "স্তর:",
    openInWindy: "উইন্ডি.কম-এ খুলুন",
    reloadRadar: "রাডার রিলোড করুন",
    quickPresets: "দ্রুত অঞ্চল নির্বাচন:",
    presetBangladesh: "বাংলাদেশ ও বঙ্গোপসাগর",
    presetIndianOcean: "ভারত মহাসাগর",
    presetEastAsia: "পূর্ব এশিয়া ও প্রশান্ত মহাসাগর",
    presetAtlantic: "আটলান্টিক ও ইউরোপ",
    presetAmericas: "আমেরিকা ও ক্যারিবিয়ান",
    overlayWaves: "সমুদ্রের ঢেউ ও স্রোত",
    overlayWind: "বাতাসের গতিধারা",
    overlayGust: "দমকা বাতাস",
    overlayRain: "বৃষ্টি ও বজ্রপাত",
    overlayTemp: "তাপমাত্রা",
    overlayClouds: "মেঘমালা",
    overlayCams: "বায়ুর মান (PM2.5)",

    // Layer Panel
    searchPlaceholder: "দেশ, অঞ্চল বা শহর অনুসন্ধান করুন…",
    quickJump: "দ্রুত যান:",
    activeHazardLayers: "সক্রিয় ঝুঁকি স্তরসমূহ",
    liveAndHistorical: "লাইভ ও ঐতিহাসিক ঝুঁকি",
    toggleAdvanced: "কারিগরি ফিড ও বেসম্যাপ তথ্য",
    activeCount: "সক্রিয়",
    inactiveCount: "নিষ্ক্রিয়",
    layerOpacity: "স্তরের অস্বচ্ছতা",
    resetDefaults: "ডিফল্ট অবস্থায় ফেরান",
    liveIndicator: "লাইভ",

    // Layer Titles & Summaries
    layerEarthquake: "ভূমিকম্প (USGS M২.৫+)",
    layerEarthquakeDesc: "USGS ভূকম্পন পরিমাপক নেটওয়ার্ক থেকে রিয়েল-টাইম বৈশ্বিক ফিড।",
    layerWildfire: "সক্রিয় দাবানল (NASA EONET / FIRMS)",
    layerWildfireDesc: "স্যাটেলাইটে শনাক্তকৃত তাপীয় অসঙ্গতি ও সক্রিয় আগুনের পরিধি।",
    layerTropicalStorm: "গ্রীষ্মমণ্ডলীয় ঝড় ও সাইক্লোন",
    layerTropicalStormDesc: "JTWC এবং NHC দ্বারা ট্র্যাকিংকৃত সক্রিয় ঘূর্ণিঝড় ও টাইফুন।",
    layerFloodRisk: "বন্যা ঝুঁকি অঞ্চল",
    layerFloodRiskDesc: "পর্যবেক্ষণাধীন নদী অববাহিকা ও চরম প্লাবনের তথ্য।",
    layerHeatDrought: "তীব্র তাপপ্রবাহ ও খরা",
    layerHeatDroughtDesc: "ERA5 সারফেস পুনঃবিশ্লেষণ এবং কোপার্নিকাস মাটির আর্দ্রতা ডেটা।",
    layerVolcano: "আগ্নেয়গিরির সক্রিয়তা",
    layerVolcanoDesc: "স্মিথসোনিয়ান গ্লোবাল ভলকানিজম প্রোগ্রামের সক্রিয় সতর্কতা।",

    // Location Panel
    locationProfile: "স্থানের ঝুঁকি প্রোফাইল",
    latLabel: "অক্ষাংশ",
    lonLabel: "দ্রাঘিমাংশ",
    tabIndicators: "সূচকসমূহ",
    tabTrends: "ঐতিহাসিক প্রবণতা",
    tabCompare: "তুলনা",
    tabSources: "উৎস ও সীমাবদ্ধতা",
    saveLocation: "স্থান সংরক্ষণ করুন",
    reportIssue: "ত্রুটি জানান",
    closePanel: "বন্ধ করুন",
    savedSuccess: "এই সেশনে স্থানটি সংরক্ষিত হয়েছে",

    // Indicators
    seismicRisk: "ভূমিকম্প ঝুঁকি",
    heatRisk: "তাপপ্রবাহের প্রবণতা",
    airQuality: "বায়ুর মান (PM2.5)",
    windRisk: "বাতাস ও ঝড়ের ঝুঁকি",
    hotDaysBaseline: "উষ্ণ দিন / বছর",
    strongWindPeak: "৪৮ ঘণ্টার সর্বোচ্চ দমকা",
    airStatusGood: "ভালো",
    airStatusModerate: "সহনীয়",
    airStatusUnhealthy: "অস্বাস্থ্যকর",

    // Events Panel
    documentedDisasters: "নথিভুক্ত দুর্যোগের ঘটনাবলী",
    filterType: "সকল ধরনের দুর্যোগ",
    filterPeriod: "সময়কাল",
    searchEventsPlaceholder: "শিরোনাম বা দেশ দিয়ে খুঁজুন…",
    allEvents: "সকল ঘটনাবলী",
    activeOnly: "কেবল সক্রিয়",
    totalEvents: "মোট",
    activeEvents: "সক্রিয়",

    // Language Toggle
    switchLang: "ভাষা",
    langEn: "English",
    langBn: "বাংলা",
  },
} as const;

export type TranslationKey = keyof typeof DICTIONARY.en;

export function t(key: TranslationKey, locale: Locale): string {
  return DICTIONARY[locale]?.[key] ?? DICTIONARY.en[key] ?? key;
}

export function useTranslation() {
  const locale = useAtlas((s) => s.locale);
  const setLocale = useAtlas((s) => s.setLocale);

  return {
    locale,
    setLocale,
    t: (key: TranslationKey) => t(key, locale),
    isBn: locale === "bn",
  };
}
