'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { formatRelative, initials } from '@teamnest/ui';
import type { MapPerson } from './map-client';

const icon = (name: string) =>
  L.divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;border-radius:9999px;background:#2563EB;color:#fff;display:flex;align-items:center;justify-content:center;font:600 12px Inter,sans-serif;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)">${initials(name)}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

export default function LeafletMap({ people }: { people: MapPerson[] }) {
  const center: [number, number] = people.length ? [people.reduce((a, p) => a + p.lat, 0) / people.length, people.reduce((a, p) => a + p.lng, 0) / people.length] : [17.43, 78.43];
  return (
    <MapContainer center={center} zoom={people.length ? 11 : 5} style={{ height: 560, width: '100%' }} scrollWheelZoom aria-label="Map of team locations">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {people.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={icon(p.name)} title={p.name}>
          <Popup>
            <strong>{p.name}</strong><br />
            Updated {formatRelative(p.at)}<br />
            {p.visits} visits today{p.battery != null ? ` · battery ${p.battery}%` : ''}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
