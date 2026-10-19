import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMapEvents,
} from "react-leaflet";
import type { Contribution } from "./domain";
import { facts, formatDate, approximatePoint } from "./domain";
function PointPicker({ onPick }: { onPick: (p: [number, number]) => void }) {
  useMapEvents({
    click: (e) => onPick(approximatePoint(e.latlng.lat, e.latlng.lng)),
  });
  return null;
}
export default function RadarMap({
  items,
  pick,
  point,
}: {
  items: Contribution[];
  pick?: (p: [number, number]) => void;
  point?: [number, number] | null;
}) {
  return (
    <MapContainer
      center={[45.475, 9.19]}
      zoom={12}
      scrollWheelZoom={false}
      className="radar-map"
      aria-label="Mappa delle segnalazioni pubbliche"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={18}
      />
      {items
        .filter((c) => c.latitude !== null && c.longitude !== null)
        .map((c) => (
          <CircleMarker
            key={c.id}
            center={[c.latitude!, c.longitude!]}
            radius={9}
            pathOptions={{
              color: "#fff",
              weight: 3,
              fillColor: c.category === "mobilita" ? "#b63238" : "#a3262c",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <strong>{c.title}</strong>
              <p>{c.zone} · Posizione approssimativa</p>
              <p>
                {formatDate(c.event_at)} · {facts[c.fact_status]}
              </p>
            </Popup>
          </CircleMarker>
        ))}
      {pick && <PointPicker onPick={pick} />}
      {point && (
        <CircleMarker
          center={point}
          radius={25}
          pathOptions={{ color: "#d46d43", fillOpacity: 0.15 }}
        >
          <Popup>Punto approssimativo selezionato</Popup>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
