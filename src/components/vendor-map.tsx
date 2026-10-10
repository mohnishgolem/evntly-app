"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { Star, X } from "lucide-react";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/config";
import { cn } from "@/lib/utils";
import { THEME_CHANGE_EVENT } from "@/components/theme-toggle";
import type { Database } from "@/lib/supabase/database.types";

type Vendor = Database["public"]["Tables"]["service_providers"]["Row"];
type LocatedVendor = Vendor & { latitude: number; longitude: number };

// A recolored fork of OpenFreeMap's "dark" vector style (Apple Maps Dark
// Mode inspired: navy water, muted green parks, plain gray/white roads) — served
// from /public since it's a static, pre-transformed style document; tiles,
// fonts and sprites still load from OpenFreeMap's CDN via the "sources"
// entries inside it. Regenerate with `python3 scripts/generate-map-style.py`
// (not run at build time) if OpenFreeMap changes their base "dark" style.
// Light mode uses OpenFreeMap's stock "positron" style directly — no
// custom recolor needed, it's already a clean minimal light basemap.
const DARK_MAP_STYLE = "/map-style-evntly-dark.json";
const LIGHT_MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const SYDNEY: [number, number] = [151.2093, -33.8688];

function getCurrentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

// Turbopack can't resolve MapLibre's ES-module worker, so we serve it from /public
// (copied by the `copy-maplibre-worker` script before dev/build).
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// Declutter the basemap for a cleaner, more modern look — hide footpaths and
// railway lines (and their labels), which read as visual noise at the zoom
// levels this map is used at.
const HIDDEN_LAYERS = [
  "highway_path",
  "highway-name-path",
  "railway",
  "railway_dashline",
  "railway_minor",
  "railway_minor_dashline",
  "railway_service",
  "railway_service_dashline",
  "railway_transit",
  "railway_transit_dashline",
  "road_pier",
  "road_area_pier",
  "boundary_3",
  "boundary_disputed",
  "highway_name_motorway",
];

function hideClutterLayers(map: maplibregl.Map) {
  for (const layerId of HIDDEN_LAYERS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none");
    }
  }
}



function PricePin({
  vendor,
  active,
  onSelect,
}: {
  vendor: LocatedVendor;
  active: boolean;
  onSelect: () => void;
}) {
  const color = categoryColor(vendor.service_type);
  const CategoryIcon = categoryIcon(vendor.service_type);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-label={`${vendor.name}, $${Math.round(vendor.hourly_rate)} per hour`}
      className={cn(
        "flex cursor-pointer flex-col items-center transition-transform duration-200 ease-out",
        active ? "scale-110" : "hover:scale-105"
      )}
    >
      <span
        className="flex items-center gap-1.5 rounded-full border-[3px] bg-background px-3 py-1.5 text-[13px] leading-none font-extrabold whitespace-nowrap text-foreground shadow-[0_3px_10px_rgba(0,0,0,0.18)]"
        style={{ borderColor: color }}
      >
        {/* eslint-disable-next-line react-hooks/static-components -- categoryIcon returns a stateless lucide icon, not a dynamically-defined component */}
        <CategoryIcon className="size-3.5" style={{ color }} />
        {`$${Math.round(vendor.hourly_rate)}/hr`}
      </span>
      <span
        className="mt-1.5 size-2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${color}30` }}
      />
    </button>
  );
}

function SelectedCard({ vendor, onClose }: { vendor: LocatedVendor; onClose: () => void }) {
  const color = categoryColor(vendor.service_type);
  const CategoryIcon = categoryIcon(vendor.service_type);
  return (
    <div className="glass-material pointer-events-auto absolute inset-x-3 bottom-3 z-30 mx-auto max-w-md rounded-3xl border border-border p-3 shadow-[0_12px_40px_rgba(0,0,0,0.28)]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
      <Link href={`/vendor/${vendor.id}`} className="flex items-center gap-3 pr-8">
        <span
          className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white"
          style={{ backgroundColor: color }}
        >
          {vendor.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vendor.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            // eslint-disable-next-line react-hooks/static-components -- categoryIcon returns a stateless lucide icon, not a dynamically-defined component
            <CategoryIcon className="size-6" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-tight font-semibold text-foreground">
            {vendor.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {categoryLabel(vendor.service_type)}
            {vendor.city ? ` · ${vendor.city}` : ""}
          </span>
          <span className="mt-1.5 flex items-center gap-3 text-xs">
            <span className="font-semibold text-foreground">
              ${Math.round(vendor.hourly_rate)}
              <span className="font-normal text-muted-foreground">/hr</span>
            </span>
            {!!vendor.rating && vendor.rating > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Star className="size-3 fill-champagne text-champagne" />
                {vendor.rating.toFixed(1)}
                {!!vendor.review_count && <span>({vendor.review_count})</span>}
              </span>
            )}
          </span>
        </span>
      </Link>
      <Link
        href={`/vendor/${vendor.id}`}
        className="mt-3 flex h-10 w-full items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
      >
        View profile
      </Link>
    </div>
  );
}

export function VendorMap({
  vendors,
  embedded = false,
}: {
  vendors: Vendor[];
  embedded?: boolean;
}) {
  const mapRef = useRef<MapRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Lazy-initialized from the DOM, not synced in an effect: VendorMap is
  // loaded with `ssr: false` (see vendor-map-loader.tsx), so it only ever
  // mounts client-side — the initializer already sees the real theme.
  const [theme, setTheme] = useState<"light" | "dark">(getCurrentTheme);

  useEffect(() => {
    function handleThemeChange(e: Event) {
      setTheme((e as CustomEvent<"light" | "dark">).detail);
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);

  // Re-apply the declutter pass every time a style finishes loading —
  // covers both the first load and switching basemaps on theme change
  // (changing the `mapStyle` prop makes MapLibre reload the whole style,
  // which fires style.load again but not the one-shot onLoad prop below).
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const onStyleLoad = () => hideClutterLayers(map);
    map.on("style.load", onStyleLoad);
    return () => {
      map.off("style.load", onStyleLoad);
    };
  }, [theme]);

  const located = useMemo(
    () =>
      vendors.filter(
        (v): v is LocatedVendor => v.latitude != null && v.longitude != null
      ),
    [vendors]
  );

  const fitAll = useCallback(
    (animate: boolean) => {
      const map = mapRef.current?.getMap();
      if (!map || located.length === 0) return;
      if (located.length === 1) {
        map.easeTo({
          center: [located[0].longitude, located[0].latitude],
          zoom: 13,
          duration: animate ? 600 : 0,
        });
        return;
      }
      const lngs = located.map((v) => v.longitude);
      const lats = located.map((v) => v.latitude);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: embedded ? 56 : 80, maxZoom: 12.5, duration: animate ? 700 : 0 }
      );
    },
    [located, embedded]
  );

  // Re-frame when the filtered vendor set changes (skip the very first fit — onLoad does it).
  const hasLoaded = useRef(false);
  useEffect(() => {
    if (hasLoaded.current) {
      setSelectedId(null);
      fitAll(true);
    }
  }, [fitAll]);

  const sortedForStacking = useMemo(
    () => [...located].sort((a, b) => b.latitude - a.latitude),
    [located]
  );

  const selected = useMemo(
    () => located.find((v) => v.id === selectedId) ?? null,
    [located, selectedId]
  );

  const selectVendor = useCallback((vendor: LocatedVendor) => {
    setSelectedId(vendor.id);
    mapRef.current?.getMap().easeTo({
      center: [vendor.longitude, vendor.latitude],
      offset: [0, -70],
      duration: 500,
    });
  }, []);

  return (
    <div className="relative size-full">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={{ longitude: SYDNEY[0], latitude: SYDNEY[1], zoom: 10.5 }}
        mapStyle={theme === "light" ? LIGHT_MAP_STYLE : DARK_MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
        cooperativeGestures={embedded}
        dragRotate={false}
        touchPitch={false}
        onLoad={(e) => {
          hasLoaded.current = true;
          hideClutterLayers(e.target);
          fitAll(false);
        }}
        onIdle={() => setReady(true)}
        onClick={() => setSelectedId(null)}
      >
        {!embedded && <NavigationControl position="top-right" showCompass={false} />}

        {/* Southern pins render last so they overlap northern ones naturally. */}
        {sortedForStacking.map((vendor) => (
          <Marker
            key={vendor.id}
            longitude={vendor.longitude}
            latitude={vendor.latitude}
            anchor="bottom"
            style={{ zIndex: vendor.id === selectedId ? 20 : undefined }}
          >
            <PricePin
              vendor={vendor}
              active={vendor.id === selectedId}
              onSelect={() => selectVendor(vendor)}
            />
          </Marker>
        ))}
      </Map>

      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 bg-muted transition-opacity duration-700",
          ready ? "opacity-0" : "animate-pulse opacity-100"
        )}
      />

      {selected && <SelectedCard vendor={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
