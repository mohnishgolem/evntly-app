"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Supercluster from "supercluster";
import Link from "next/link";
import { LocateFixed, Minus, Plus, Scan, Star, X } from "lucide-react";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/config";
import { cn } from "@/lib/utils";
import { THEME_CHANGE_EVENT } from "@/components/theme-toggle";
import type { PublicVendor } from "@/lib/vendor-columns";

type Vendor = PublicVendor;
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

const MAX_ZOOM = 16;
// Clusters stop splitting here; anything still grouped beyond it shares
// (coarsened, ~1 km) coordinates and opens as a list of cards instead.
const CLUSTER_MAX_ZOOM = 14;
// Radius of the "approximate area" halo — matches the ~1 km precision the
// `coarsen_vendor_coordinates` DB trigger stores coordinates at.
const APPROX_RADIUS_M = 700;

// Apple-style ease-out: quick start, long gentle settle.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function getCurrentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light")
    ? "light"
    : "dark";
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
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

function distanceSq(a: LocatedVendor, b: LocatedVendor) {
  const dLat = a.latitude - b.latitude;
  const dLng =
    (a.longitude - b.longitude) * Math.cos((a.latitude * Math.PI) / 180);
  return dLat * dLat + dLng * dLng;
}

function circlePolygon(lng: number, lat: number, radiusM: number) {
  const points = 64;
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [ring] },
  };
}

type PointProps = { vendorId: string; color: string };
type ClusterProps = Record<string, never>;

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
      aria-pressed={active}
      className={cn(
        "flex cursor-pointer flex-col items-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75 motion-safe:duration-200",
        "origin-bottom transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        active ? "scale-[1.18]" : "hover:scale-105",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full border-[3px] px-3 py-1.5 text-[13px] leading-none font-extrabold whitespace-nowrap shadow-[0_3px_10px_rgba(0,0,0,0.18)] transition-colors duration-200",
          active ? "text-white" : "bg-background text-foreground",
        )}
        style={{
          borderColor: color,
          backgroundColor: active ? color : undefined,
        }}
      >
        {/* eslint-disable-next-line react-hooks/static-components -- categoryIcon returns a stateless lucide icon, not a dynamically-defined component */}
        <CategoryIcon
          className="size-3.5"
          style={{ color: active ? "white" : color }}
        />
        {`$${Math.round(vendor.hourly_rate)}/hr`}
      </span>
      <span
        className="mt-1.5 size-2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${color}30` }}
      />
    </button>
  );
}

function ClusterBubble({
  count,
  colors,
  onSelect,
}: {
  count: number;
  colors: string[];
  onSelect: () => void;
}) {
  // A conic ring split between the categories inside — the same "what's in
  // here" glance Apple's clustered annotations give.
  const ring =
    colors.length === 1
      ? colors[0]
      : `conic-gradient(${colors
          .map(
            (c, i) =>
              `${c} ${(i / colors.length) * 360}deg ${((i + 1) / colors.length) * 360}deg`,
          )
          .join(", ")})`;
  const size = Math.min(56, 38 + Math.log2(count) * 5);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-label={`${count} vendors here — zoom in`}
      className="flex cursor-pointer items-center justify-center rounded-full p-[3px] shadow-[0_4px_14px_rgba(0,0,0,0.22)] transition-transform duration-200 ease-out hover:scale-105 active:scale-95 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75 motion-safe:duration-200"
      style={{ width: size, height: size, background: ring }}
    >
      <span className="flex size-full items-center justify-center rounded-full bg-background text-sm font-extrabold text-foreground">
        {count}
      </span>
    </button>
  );
}

function VendorCard({
  vendor,
  active,
}: {
  vendor: LocatedVendor;
  active: boolean;
}) {
  const color = categoryColor(vendor.service_type);
  const CategoryIcon = categoryIcon(vendor.service_type);
  return (
    <div
      className={cn(
        "glass-material w-[min(82vw,340px)] shrink-0 snap-center rounded-3xl border border-border p-3 shadow-[0_12px_40px_rgba(0,0,0,0.28)] transition-[opacity,transform] duration-300 ease-out",
        active ? "opacity-100" : "scale-[0.96] opacity-70",
      )}
    >
      <Link
        href={`/vendor/${vendor.id}`}
        tabIndex={active ? 0 : -1}
        className="flex items-center gap-3"
      >
        <span
          className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white"
          style={{ backgroundColor: color }}
        >
          {vendor.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vendor.avatar_url}
              alt=""
              className="size-full object-cover"
            />
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
        tabIndex={active ? 0 : -1}
        className="mt-3 flex h-10 w-full items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
      >
        View profile
      </Link>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-10 items-center justify-center text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10 disabled:opacity-40"
    >
      {children}
    </button>
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
  const deckRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The swipeable row of cards. Built once per pin/cluster tap (nearest
  // first) and left alone while swiping, so cards don't reshuffle under the
  // user's finger.
  const [deck, setDeck] = useState<LocatedVendor[]>([]);
  const [view, setView] = useState<{
    bbox: [number, number, number, number];
    zoom: number;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<number | null>(null);
  // Lazy-initialized from the DOM, not synced in an effect: VendorMap is
  // loaded with `ssr: false` (see vendor-map-loader.tsx), so it only ever
  // mounts client-side — the initializer already sees the real theme.
  const [theme, setTheme] = useState<"light" | "dark">(getCurrentTheme);

  useEffect(() => {
    function handleThemeChange(e: Event) {
      setTheme((e as CustomEvent<"light" | "dark">).detail);
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () =>
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
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

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const located = useMemo(
    () =>
      vendors.filter(
        (v): v is LocatedVendor => v.latitude != null && v.longitude != null,
      ),
    [vendors],
  );

  const byId = useMemo(
    () => new globalThis.Map(located.map((v) => [v.id, v])),
    [located],
  );
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  // The selected vendor is pulled out of clustering so its pin always shows,
  // the way Apple keeps a selected annotation visible above its cluster.
  const index = useMemo(() => {
    const sc = new Supercluster<PointProps, ClusterProps>({
      // Price pins are ~90px wide, so group anything that would visibly collide.
      radius: 72,
      maxZoom: CLUSTER_MAX_ZOOM,
    });
    sc.load(
      located
        .filter((v) => v.id !== selectedId)
        .map((v) => ({
          type: "Feature" as const,
          properties: { vendorId: v.id, color: categoryColor(v.service_type) },
          geometry: {
            type: "Point" as const,
            coordinates: [v.longitude, v.latitude],
          },
        })),
    );
    return sc;
  }, [located, selectedId]);

  const clusters = useMemo(() => {
    if (!view) return [];
    // Southern features render last so they overlap northern ones naturally.
    return index
      .getClusters(view.bbox, Math.round(view.zoom))
      .sort((a, b) => b.geometry.coordinates[1] - a.geometry.coordinates[1]);
  }, [index, view]);

  const syncView = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = map.getBounds();
    setView({
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      zoom: map.getZoom(),
    });
  }, []);

  const duration = useCallback(
    (ms: number) => (prefersReducedMotion() ? 0 : ms),
    [],
  );

  const fitAll = useCallback(
    (animate: boolean) => {
      const map = mapRef.current?.getMap();
      if (!map || located.length === 0) return;
      if (located.length === 1) {
        map.easeTo({
          center: [located[0].longitude, located[0].latitude],
          zoom: 13,
          duration: animate ? duration(600) : 0,
          easing: easeOutCubic,
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
        {
          padding: embedded ? 56 : 80,
          maxZoom: 12.5,
          duration: animate ? duration(700) : 0,
          easing: easeOutCubic,
        },
      );
    },
    [located, embedded, duration],
  );

  const closeDeck = useCallback(() => {
    setSelectedId(null);
    setDeck([]);
    setDragY(0);
  }, []);

  // Re-frame when the filtered vendor set changes (skip the very first fit — onLoad does it).
  const hasLoaded = useRef(false);
  useEffect(() => {
    if (hasLoaded.current) {
      closeDeck();
      fitAll(true);
    }
  }, [fitAll, closeDeck]);

  // Glide to a vendor, leaving room for the card row below the pin.
  const focusVendor = useCallback(
    (vendor: LocatedVendor) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      map.easeTo({
        center: [vendor.longitude, vendor.latitude],
        zoom: Math.max(map.getZoom(), 12),
        offset: [0, embedded ? -40 : -80],
        duration: duration(550),
        easing: easeOutCubic,
      });
    },
    [embedded, duration],
  );

  const scrollDeckTo = useCallback((i: number, smooth: boolean) => {
    const el = deckRef.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({
      left: card.offsetLeft - (el.clientWidth - card.clientWidth) / 2,
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
    });
  }, []);

  const openVendor = useCallback(
    (vendor: LocatedVendor) => {
      setDeck(
        [...located].sort(
          (a, b) => distanceSq(vendor, a) - distanceSq(vendor, b),
        ),
      );
      setSelectedId(vendor.id);
      setDragY(0);
      focusVendor(vendor);
      // The tapped vendor is always first in the rebuilt deck.
      requestAnimationFrame(() => scrollDeckTo(0, false));
    },
    [located, focusVendor, scrollDeckTo],
  );

  const openCluster = useCallback(
    (clusterId: number, lng: number, lat: number) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const expansionZoom = index.getClusterExpansionZoom(clusterId);
      if (expansionZoom <= CLUSTER_MAX_ZOOM) {
        map.easeTo({
          center: [lng, lat],
          zoom: Math.min(expansionZoom + 0.5, MAX_ZOOM),
          duration: duration(600),
          easing: easeOutCubic,
        });
        return;
      }
      // Can't split any further (same ~1 km cell) — show them as cards.
      const first = index.getLeaves(clusterId, 1)[0];
      const vendor = first && byId.get(first.properties.vendorId);
      if (vendor) openVendor(vendor);
    },
    [index, byId, openVendor, duration],
  );

  const step = useCallback(
    (delta: number) => {
      const i = deck.findIndex((v) => v.id === selectedId);
      const next = deck[i + delta];
      if (!next) return;
      setSelectedId(next.id);
      focusVendor(next);
      scrollDeckTo(i + delta, true);
    },
    [deck, selectedId, focusVendor, scrollDeckTo],
  );

  // Swiping the card row selects whichever card settles in the centre.
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDeckScroll = useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const el = deckRef.current;
      if (!el) return;
      const centre = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      Array.from(el.children).forEach((child, i) => {
        const c = child as HTMLElement;
        const d = Math.abs(c.offsetLeft + c.clientWidth / 2 - centre);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      const vendor = deck[best];
      if (vendor && vendor.id !== selectedId) {
        setSelectedId(vendor.id);
        focusVendor(vendor);
      }
    }, 90);
  }, [deck, selectedId, focusVendor]);

  useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") closeDeck();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, closeDeck, step]);

  function locateMe() {
    if (!("geolocation" in navigator)) {
      setNotice("Location isn't available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const here: [number, number] = [
          pos.coords.longitude,
          pos.coords.latitude,
        ];
        setUserLocation(here);
        mapRef.current?.getMap().flyTo({
          center: here,
          zoom: 12.5,
          duration: duration(1000),
          essential: true,
        });
      },
      (err) => {
        setLocating(false);
        setNotice(
          err.code === err.PERMISSION_DENIED
            ? "Allow location access to see vendors near you."
            : "Couldn't find your location.",
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    );
  }

  function zoomBy(delta: number) {
    const map = mapRef.current?.getMap();
    map?.easeTo({ zoom: map.getZoom() + delta, duration: duration(300) });
  }

  const halo = useMemo(
    () =>
      selected
        ? circlePolygon(selected.longitude, selected.latitude, APPROX_RADIUS_M)
        : null,
    [selected],
  );
  const haloColor = selected ? categoryColor(selected.service_type) : "#000";
  const selectedIndex = deck.findIndex((v) => v.id === selectedId);

  return (
    <div className="relative size-full overflow-hidden">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={{
          longitude: SYDNEY[0],
          latitude: SYDNEY[1],
          zoom: 10.5,
        }}
        mapStyle={theme === "light" ? LIGHT_MAP_STYLE : DARK_MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
        cooperativeGestures={embedded}
        dragRotate={false}
        touchPitch={false}
        maxZoom={MAX_ZOOM}
        onLoad={(e) => {
          hasLoaded.current = true;
          hideClutterLayers(e.target);
          fitAll(false);
          syncView();
        }}
        onMove={syncView}
        onIdle={() => setReady(true)}
        onClick={(e) => {
          // MapLibre's click fires on the container before React's handlers
          // run, so pins/clusters can't stop it — ignore clicks that started
          // on a marker and only treat bare-map taps as "dismiss".
          const target = e.originalEvent.target as HTMLElement | null;
          if (target?.closest(".maplibregl-marker")) return;
          closeDeck();
        }}
      >
        {halo && (
          <Source id="selected-area" type="geojson" data={halo}>
            <Layer
              id="selected-area-fill"
              type="fill"
              paint={{ "fill-color": haloColor, "fill-opacity": 0.12 }}
            />
            <Layer
              id="selected-area-line"
              type="line"
              paint={{
                "line-color": haloColor,
                "line-opacity": 0.45,
                "line-width": 1.5,
              }}
            />
          </Source>
        )}

        {clusters.map((feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          if ("cluster" in feature.properties && feature.properties.cluster) {
            const { cluster_id, point_count } = feature.properties;
            const colors = Array.from(
              new Set(
                index.getLeaves(cluster_id, 50).map((l) => l.properties.color),
              ),
            ).slice(0, 4);
            return (
              <Marker key={`c${cluster_id}`} longitude={lng} latitude={lat}>
                <ClusterBubble
                  count={point_count}
                  colors={colors}
                  onSelect={() => openCluster(cluster_id, lng, lat)}
                />
              </Marker>
            );
          }
          const vendor = byId.get((feature.properties as PointProps).vendorId);
          if (!vendor) return null;
          return (
            <Marker
              key={vendor.id}
              longitude={lng}
              latitude={lat}
              anchor="bottom"
            >
              <PricePin
                vendor={vendor}
                active={false}
                onSelect={() => openVendor(vendor)}
              />
            </Marker>
          );
        })}

        {selected && (
          <Marker
            key={`selected-${selected.id}`}
            longitude={selected.longitude}
            latitude={selected.latitude}
            anchor="bottom"
            style={{ zIndex: 20 }}
          >
            <PricePin
              vendor={selected}
              active
              onSelect={() => focusVendor(selected)}
            />
          </Marker>
        )}

        {userLocation && (
          <Marker
            longitude={userLocation[0]}
            latitude={userLocation[1]}
            style={{ zIndex: 15 }}
          >
            <span className="relative flex size-4">
              <span className="absolute inset-0 rounded-full bg-[#0a84ff] opacity-40 motion-safe:animate-ping" />
              <span className="relative size-4 rounded-full border-[2.5px] border-white bg-[#0a84ff] shadow-[0_1px_4px_rgba(0,0,0,0.35)]" />
            </span>
          </Marker>
        )}
      </Map>

      {!embedded && (
        <div className="glass-material absolute top-3 right-3 z-20 flex flex-col overflow-hidden rounded-2xl border border-border shadow-[0_6px_20px_rgba(0,0,0,0.16)]">
          <ControlButton label="Zoom in" onClick={() => zoomBy(1)}>
            <Plus className="size-[18px]" />
          </ControlButton>
          <span className="mx-2 h-px bg-border" />
          <ControlButton label="Zoom out" onClick={() => zoomBy(-1)}>
            <Minus className="size-[18px]" />
          </ControlButton>
          <span className="mx-2 h-px bg-border" />
          <ControlButton
            label="Show my location"
            onClick={locateMe}
            disabled={locating}
          >
            <LocateFixed
              className={cn(
                "size-[18px]",
                userLocation && "text-[#0a84ff]",
                locating && "animate-pulse",
              )}
            />
          </ControlButton>
          <span className="mx-2 h-px bg-border" />
          <ControlButton
            label="Show all vendors"
            onClick={() => {
              closeDeck();
              fitAll(true);
            }}
          >
            <Scan className="size-[18px]" />
          </ControlButton>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="glass-material absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border px-4 py-2 text-xs font-medium whitespace-nowrap text-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2"
        >
          {notice}
        </div>
      )}

      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 bg-muted transition-opacity duration-700",
          ready ? "opacity-0" : "animate-pulse opacity-100",
        )}
      />

      {selected && deck.length > 0 && (
        <div
          className="absolute inset-x-0 bottom-0 z-30 pb-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-300"
          style={{
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            opacity: dragY ? Math.max(0.3, 1 - dragY / 200) : undefined,
            transition: dragging
              ? "none"
              : "transform 250ms ease-out, opacity 250ms",
          }}
          // Pull the row down to dismiss, like an Apple Maps sheet. The cards
          // still scroll horizontally — `touch-action: pan-x` leaves that to
          // the browser and hands us only the vertical part of the gesture.
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") return;
            dragStart.current = e.clientY;
            setDragging(true);
          }}
          onPointerMove={(e) => {
            if (dragStart.current === null) return;
            setDragY(Math.max(0, e.clientY - dragStart.current));
          }}
          onPointerUp={() => {
            if (dragStart.current === null) return;
            dragStart.current = null;
            setDragging(false);
            if (dragY > 80) closeDeck();
            else setDragY(0);
          }}
          onPointerCancel={() => {
            dragStart.current = null;
            setDragging(false);
            setDragY(0);
          }}
        >
          <div className="mb-2 flex items-center justify-center gap-2">
            {deck.length > 1 && (
              <span className="glass-material rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground tabular-nums shadow-sm">
                {selectedIndex + 1} of {deck.length}
              </span>
            )}
            <button
              type="button"
              onClick={closeDeck}
              aria-label="Close"
              className="glass-material flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground shadow-sm transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div
            ref={deckRef}
            onScroll={onDeckScroll}
            role="region"
            aria-label="Vendors on the map"
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[max(12px,calc(50%-170px))] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
          >
            {deck.map((v) => (
              <VendorCard key={v.id} vendor={v} active={v.id === selectedId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
