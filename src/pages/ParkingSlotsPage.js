import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { LOT_NAME } from '../constants/alexandriaLot';
import './ParkingSlotsPage.css';

export { ALEXANDRIA_LOT_PATH, LOT_NAME } from '../constants/alexandriaLot';

/** Demo slot data — replace with API later */
function buildSlots() {
  const rows = ['A', 'B', 'C', 'D'];
  const cols = 6;
  const slots = [];
  let n = 0;
  rows.forEach((row) => {
    for (let c = 1; c <= cols; c += 1) {
      n += 1;
      // Mix of available / occupied for demo
      const status = n % 5 === 0 || n % 7 === 0 ? 'available' : 'occupied';
      slots.push({
        id: `${row}${c}`,
        label: `${row}${c}`,
        status,
      });
    }
  });
  return slots;
}

const ParkingSlotsPage = () => {
  const slots = useMemo(() => buildSlots(), []);
  const [selectedId, setSelectedId] = useState(null);

  const availableCount = slots.filter((s) => s.status === 'available').length;
  const occupiedCount = slots.length - availableCount;

  return (
    <div className="parking-slots-page">
      <Navbar variant="landing" showAuthLinks />

      <main className="parking-slots-main">
        <nav className="parking-slots-breadcrumb" aria-label="Breadcrumb">
          <Link to="/book-parking" className="parking-slots-back">
            ← Book parking
          </Link>
        </nav>

        <header className="parking-slots-header">
          <h1 className="parking-slots-title">{LOT_NAME}</h1>
          <p className="parking-slots-subtitle">Pick an available slot to continue booking.</p>
          <p className="parking-slots-stats">
            <span className="parking-slots-stat available">
              <strong>{availableCount}</strong> available
            </span>
            <span className="parking-slots-stat occupied">
              <strong>{occupiedCount}</strong> occupied
            </span>
          </p>
        </header>

        <div className="parking-slots-legend" role="list">
          <span className="parking-slots-legend-item">
            <span className="parking-slots-swatch available" /> Available
          </span>
          <span className="parking-slots-legend-item">
            <span className="parking-slots-swatch occupied" /> Occupied
          </span>
          <span className="parking-slots-legend-item">
            <span className="parking-slots-swatch selected" /> Selected
          </span>
        </div>

        <section className="parking-slots-grid-wrap" aria-label="Parking slots">
          <div className="parking-slots-grid">
            {slots.map((slot) => {
              const isAvailable = slot.status === 'available';
              const isSelected = selectedId === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={`parking-slot ${slot.status} ${isSelected ? 'selected' : ''}`}
                  disabled={!isAvailable}
                  onClick={() => isAvailable && setSelectedId(slot.id)}
                  aria-pressed={isSelected}
                  aria-label={
                    isAvailable
                      ? `Slot ${slot.label}, available`
                      : `Slot ${slot.label}, occupied`
                  }
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </section>

        {selectedId && (
          <div className="parking-slots-actions">
            <p className="parking-slots-selected-msg">
              Slot <strong>{selectedId}</strong> selected.
            </p>
            <div className="parking-slots-action-btns">
              <Link to="/login" className="parking-slots-btn primary">
                Continue to login
              </Link>
              <button type="button" className="parking-slots-btn ghost" onClick={() => setSelectedId(null)}>
                Clear selection
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ParkingSlotsPage;
