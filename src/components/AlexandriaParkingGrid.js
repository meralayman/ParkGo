import React from 'react';
import { sortSlotsForAlexandriaGrid } from '../utils/slotSorting';
import '../pages/ParkingSlotsPage.css';

/** Map DB state: 0=available, 1=occupied, 2=reserved */
function stateToClass(state) {
  const n = Number(state);
  if (n === 0) return 'available';
  if (n === 2) return 'reserved';
  return 'occupied';
}

function isSelectable(state) {
  return Number(state) === 0;
}

/**
 * Shared lot grid: same layout on public booking page and user dashboard.
 * @param {Array<{ slot_no: string, state: number }>} slots
 * @param {string|null} selectedSlotNo
 * @param {(slotNo: string) => void} [onSlotClick] — if set, available slots are clickable
 * @param {boolean} [showLegend]
 */
export default function AlexandriaParkingGrid({
  slots,
  selectedSlotNo,
  onSlotClick,
  showLegend = true,
}) {
  const ordered = sortSlotsForAlexandriaGrid(slots);
  const availableCount = slots.filter((s) => Number(s.state) === 0).length;
  const takenCount = slots.length - availableCount;

  return (
    <>
      <p className="parking-slots-stats">
        <span className="parking-slots-stat available">
          <strong>{availableCount}</strong> available
        </span>
        <span className="parking-slots-stat occupied">
          <strong>{takenCount}</strong> occupied / reserved
        </span>
      </p>

      {showLegend && (
        <div className="parking-slots-legend" role="list">
          <span className="parking-slots-legend-item">
            <span className="parking-slots-swatch available" /> Available
          </span>
          <span className="parking-slots-legend-item">
            <span className="parking-slots-swatch occupied" /> Occupied
          </span>
          <span className="parking-slots-legend-item">
            <span className="parking-slots-swatch reserved" /> Reserved
          </span>
          <span className="parking-slots-legend-item">
            <span className="parking-slots-swatch selected" /> Selected
          </span>
        </div>
      )}

      <section className="parking-slots-grid-wrap" aria-label="Parking slots">
        <div className="parking-slots-grid">
          {ordered.map((slot) => {
            const cls = stateToClass(slot.state);
            const canClick = onSlotClick && isSelectable(slot.state);
            const isSelected = selectedSlotNo === slot.slot_no;
            return (
              <button
                key={slot.slot_no}
                type="button"
                className={`parking-slot ${cls} ${isSelected ? 'selected' : ''}`}
                disabled={!canClick}
                onClick={() => canClick && onSlotClick(slot.slot_no)}
                aria-pressed={isSelected}
                aria-label={`Slot ${slot.slot_no}, ${cls}`}
              >
                {slot.slot_no}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
