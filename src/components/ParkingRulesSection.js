import React from 'react';
import './ParkingRulesSection.css';

const RULES = [
  'No double parking',
  'Keep QR ready',
  'Follow time limits',
];

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
          <div className="parking-rules-modal-box__rules" role="list">
            {RULES.map((text) => (
              <div key={text} className="parking-rules-modal-box__rule" role="listitem">
                <span aria-hidden className="parking-rules-modal-box__rule-marker">
                  •
                </span>
                <span className="parking-rules-modal-box__rule-text">{text}</span>
              </div>
            ))}
          </div>
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
      <div className="parking-rules-section__rules" role="list">
        {RULES.map((text) => (
          <div key={text} className="parking-rules-section__rule" role="listitem">
            <span aria-hidden className="parking-rules-section__rule-marker">
              •
            </span>
            <span className="parking-rules-section__rule-text">{text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
