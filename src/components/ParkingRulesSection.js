import React from 'react';
import './ParkingRulesSection.css';

const RULES = ['No double parking', 'Follow time limits', 'Keep QR ready'];

/**
 * @param {{ variant?: 'dashboard' | 'modal' }} props
 */
export default function ParkingRulesSection({ variant = 'dashboard' }) {
  const headingId = variant === 'modal' ? 'parking-rules-heading-modal' : 'parking-rules-heading';

  if (variant === 'modal') {
    return (
      <div
        className="parking-rules-modal-box"
        role="region"
        aria-labelledby={headingId}
      >
        <div className="parking-rules-modal-box__accent" aria-hidden />
        <div className="parking-rules-modal-box__inner">
          <h3 id={headingId} className="parking-rules-modal-box__title">
            Parking Rules
          </h3>
          <ul className="parking-rules-modal-box__list">
            {RULES.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <section
      className="dashboard-section parking-rules-section"
      aria-labelledby={headingId}
    >
      <h2 id={headingId}>Parking Rules</h2>
      <ul className="parking-rules-section__list">
        {RULES.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </section>
  );
}
