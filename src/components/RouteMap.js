import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// coords: [[lat, lng], ...]; follow = true: mapa podąża za biegaczem (widok na żywo)
export default function RouteMap({ coords, follow = false, height = 320 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});
  const fitted = useRef(false);

  // utworzenie mapy
  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView([52.23, 21.01], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    layersRef.current = {
      line: L.polyline([], { color: '#fc4c02', weight: 5, opacity: 0.9 }).addTo(map),
      start: L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 2, fillColor: '#1a9d4b', fillOpacity: 1 }),
      end: L.circleMarker([0, 0], { radius: 8, color: '#fff', weight: 2, fillColor: '#d33', fillOpacity: 1 }),
    };
    mapRef.current = map;
    fitted.current = false;
    const t = setTimeout(() => map.invalidateSize(), 0);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      layersRef.current = {};
    };
  }, []);

  // aktualizacja trasy
  useEffect(() => {
    const map = mapRef.current;
    const { line, start, end } = layersRef.current;
    if (!map || !line) return;

    line.setLatLngs(coords);
    if (coords.length === 0) return;

    const first = coords[0];
    const last = coords[coords.length - 1];
    if (!map.hasLayer(start)) start.addTo(map);
    if (!map.hasLayer(end)) end.addTo(map);
    start.setLatLng(first);
    end.setLatLng(last);

    if (follow) {
      if (!fitted.current) {
        map.setView(last, 17);
        fitted.current = true;
      } else if (!map.getBounds().pad(-0.2).contains(last)) {
        map.panTo(last);
      }
    } else if (!fitted.current || coords.length > 1) {
      const bounds = L.latLngBounds(coords);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
      fitted.current = true;
    }
  }, [coords, follow]);

  return <div ref={elRef} className="route-map" style={{ height }} />;
}
