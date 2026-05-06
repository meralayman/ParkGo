export const ALEXANDRIA_LOT_PATH = '/book-parking/alexandria-national-university';
export const LOT_NAME = 'Alexandria National University Parking';

/** WGS84 — Alexandria National University (Smoha campus). */
export const LOT_POSITION = { lat: 31.214028, lng: 29.976111 };

/** Initial book-parking map: country view of Egypt. */
export const EGYPT_MAP_CENTER = { lat: 26.75, lng: 30.85 };

/** Equivalent region deltas for RN Maps (approx. Egypt country view). */
export const EGYPT_REGION = {
  latitude: EGYPT_MAP_CENTER.lat,
  longitude: EGYPT_MAP_CENTER.lng,
  latitudeDelta: 18,
  longitudeDelta: 18,
};

export const LOT_MARKER_TARGET_REGION = {
  latitude: LOT_POSITION.lat,
  longitude: LOT_POSITION.lng,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};
