import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { GeoPoint, TripPlan } from "../types";
import type { EndpointKind } from "../App";
import { STOP_META, fmtTime } from "../utils";

export interface Endpoints {
  current: GeoPoint | null;
  pickup: GeoPoint | null;
  dropoff: GeoPoint | null;
}

function dot(color: string, size = 16): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="marker-pin" style="width:${size}px;height:${size}px;background:${color}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 9);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

interface Props {
  endpoints: Endpoints;
  plan?: TripPlan | null;
  onEndpointDrag?: (kind: EndpointKind, lat: number, lng: number) => void;
}

export default function RouteMap({ endpoints, plan, onEndpointDrag }: Props) {
  const geometry = plan?.route.geometry ?? [];

  const markerDefs: { kind: EndpointKind; p: GeoPoint | null; color: string; label: string }[] = [
    { kind: "current", p: endpoints.current, color: "#0f172a", label: "Current / Start" },
    { kind: "pickup", p: endpoints.pickup, color: STOP_META.PICKUP.color, label: "Pickup" },
    { kind: "dropoff", p: endpoints.dropoff, color: STOP_META.DROPOFF.color, label: "Dropoff" },
  ];

  const allPoints: [number, number][] = [
    ...geometry,
    ...markerDefs.filter((m) => m.p).map((m) => [m.p!.lat, m.p!.lng] as [number, number]),
  ];

  return (
    <div className="map-shell">
      <MapContainer center={[39, -96]} zoom={4} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={allPoints} />

        {geometry.length >= 2 && (
          <Polyline
            positions={geometry}
            pathOptions={{ color: "#1d4ed8", weight: 4, opacity: 0.8 }}
          />
        )}

        {markerDefs
          .filter((m) => m.p)
          .map((m) => (
            <Marker
              key={m.kind}
              position={[m.p!.lat, m.p!.lng]}
              icon={dot(m.color, 20)}
              draggable={!!onEndpointDrag}
              eventHandlers={
                onEndpointDrag
                  ? {
                      dragend: (evt) => {
                        const { lat, lng } = (evt.target as L.Marker).getLatLng();
                        onEndpointDrag(m.kind, lat, lng);
                      },
                    }
                  : undefined
              }
            >
              <Popup>
                <strong>{m.label}</strong>
                <br />
                {m.p!.name}
                {onEndpointDrag && (
                  <>
                    <br />
                    <em>Drag to move, then re-plan</em>
                  </>
                )}
              </Popup>
            </Marker>
          ))}

        {(plan?.stops ?? [])
          .filter((s) => s.type !== "PICKUP" && s.type !== "DROPOFF")
          .map((s, i) => {
            const meta = STOP_META[s.type];
            return (
              <Marker
                key={`${s.type}-${i}`}
                position={[s.lat, s.lng]}
                icon={dot(meta.color, 14)}
              >
                <Popup>
                  <strong>{meta.label}</strong>
                  <br />
                  {fmtTime(s.start)} – {fmtTime(s.end)}
                  <br />
                  {s.remarks}
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}
