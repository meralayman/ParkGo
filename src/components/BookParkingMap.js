import React, { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ALEXANDRIA_LOT_PATH,
  EGYPT_MAP_CENTER,
  EGYPT_MAP_ZOOM,
  LOT_POSITION,
  LOT_NAME,
} from '../constants/alexandriaLot';
import './BookParkingMap.css';

const LOT_LAT_LNG = [LOT_POSITION.lat, LOT_POSITION.lng];
const MAP_CENTER = [EGYPT_MAP_CENTER.lat, EGYPT_MAP_CENTER.lng];
/** Zoom level when the parking marker is clicked (campus scale). */
const LOT_MARKER_TARGET_ZOOM = 17;
const LOT_MARKER_FLY_SEC = 1.1;

/** CARTO Voyager — clear Latin labels; no API key. English attribution text. */
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function MapResize() {
  const map = useMap();
  useEffect(() => {
    const run = () => {
      map.invalidateSize();
    };
    run();
    const t = window.setTimeout(run, 250);
    window.addEventListener('resize', run);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', run);
    };
  }, [map]);
  return null;
}

function LotMarker({ icon }) {
  const map = useMap();
  return (
    <Marker
      position={LOT_LAT_LNG}
      icon={icon}
      eventHandlers={{
        click: () => {
          map.flyTo(LOT_LAT_LNG, LOT_MARKER_TARGET_ZOOM, { duration: LOT_MARKER_FLY_SEC });
        },
      }}
    >
      <Popup>
        <div className="book-parking-map-popup">
          <h4 className="book-parking-map-popup__title">{LOT_NAME}</h4>
          <p className="book-parking-map-popup__line">Alexandria, Egypt</p>
          <Link to={ALEXANDRIA_LOT_PATH} className="book-parking-map-popup__btn">
            Select
          </Link>
        </div>
      </Popup>
    </Marker>
  );
}

export default function BookParkingMap() {
  const pinIcon = useMemo(
    () =>
      L.divIcon({
        className: 'book-parking-map-pin',
        html: '<span class="book-parking-map-pin__bubble" aria-hidden="true">P</span>',
        iconSize: [40, 44],
        iconAnchor: [20, 44],
        popupAnchor: [0, -42],
      }),
    []
  );

  return (
    <MapContainer
      className="book-parking-leaflet-map"
      center={MAP_CENTER}
      zoom={EGYPT_MAP_ZOOM}
      scrollWheelZoom
      zoomControl
      attributionControl
    >
      <MapResize />
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} subdomains="abcd" maxZoom={20} />
      <LotMarker icon={pinIcon} />
    </MapContainer>
  );
}
