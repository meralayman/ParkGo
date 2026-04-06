import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import AlexandriaParkingGrid from '../components/AlexandriaParkingGrid';
import { LOT_NAME } from '../constants/alexandriaLot';
import { PARKGO_PENDING_SLOT_KEY } from '../constants/pendingSlot';
import './ParkingSlotsPage.css';

export { ALEXANDRIA_LOT_PATH, LOT_NAME } from '../constants/alexandriaLot';

const API_BASE = 'http://localhost:5000';

const ParkingSlotsPage = () => {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSlotNo, setSelectedSlotNo] = useState(null);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/slots`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.slots)) {
        setSlots(data.slots);
      } else {
        setError(data.error || 'Failed to load parking map');
      }
    } catch (err) {
      setError(err.message || 'Cannot reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PARKGO_PENDING_SLOT_KEY);
      if (saved && slots.some((s) => s.slot_no === saved && Number(s.state) === 0)) {
        setSelectedSlotNo(saved);
      }
    } catch {
      /* ignore */
    }
  }, [slots]);

  const handleSelect = (slotNo) => {
    setSelectedSlotNo(slotNo);
    try {
      localStorage.setItem(PARKGO_PENDING_SLOT_KEY, slotNo);
    } catch {
      /* ignore */
    }
  };

  const handleClear = () => {
    setSelectedSlotNo(null);
    try {
      localStorage.removeItem(PARKGO_PENDING_SLOT_KEY);
    } catch {
      /* ignore */
    }
  };

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
        </header>

        {loading ? (
          <p className="parking-slots-subtitle">Loading live availability…</p>
        ) : error ? (
          <p className="parking-slots-subtitle" style={{ color: '#b91c1c' }}>
            {error}{' '}
            <button type="button" className="parking-slots-back" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={loadSlots}>
              Retry
            </button>
          </p>
        ) : (
          <AlexandriaParkingGrid
            slots={slots}
            selectedSlotNo={selectedSlotNo}
            onSlotClick={handleSelect}
            showLegend
          />
        )}

        {selectedSlotNo && !loading && !error && (
          <div className="parking-slots-actions">
            <p className="parking-slots-selected-msg">
              Slot <strong>{selectedSlotNo}</strong> selected. After you log in, this spot stays selected for your reservation.
            </p>
            <div className="parking-slots-action-btns">
              <Link to="/login" className="parking-slots-btn primary">
                Continue to login
              </Link>
              <button type="button" className="parking-slots-btn ghost" onClick={handleClear}>
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
