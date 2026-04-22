import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import BookParkingMap from '../components/BookParkingMap';
import { ALEXANDRIA_LOT_PATH, LOT_NAME } from '../constants/alexandriaLot';
import './BookParkingPage.css';

const SIDE_CARDS = [
  {
    id: 'anu',
    title: LOT_NAME,
    locations: 0,
  },
];

function IconGrad() {
  return (
    <svg className="book-parking-card-ico" viewBox="0 0 40 40" fill="none" aria-hidden>
      <circle cx="20" cy="20" r="20" fill="#eff6ff" />
      <path
        d="M20 12l8 5v8c0 1.5-1 2.8-2.5 3.2L20 29l-5.5-1.8C13 25.8 12 24.5 12 23v-8l8-5z"
        stroke="#2563eb"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M20 16v6M17 19h6" stroke="#2563eb" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const BookParkingPage = () => {
  const [search, setSearch] = useState('');

  return (
    <div className="book-parking-page">
      <Navbar showAuthLinks />

      <main className="book-parking-main">
        <header className="book-parking-hero">
          <h1 className="book-parking-title">Where do you want to park?</h1>
          <p className="book-parking-subtitle">Choose your location to find available parking spots nearby.</p>
        </header>

        <div className="book-parking-split">
          <aside className="book-parking-panel">
            <div className="book-parking-search-wrap">
              <span className="book-parking-search-icon" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                type="search"
                className="book-parking-search"
                placeholder="Search location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search location"
              />
            </div>

            <label className="book-parking-label" htmlFor="book-parking-cat">
              Location
            </label>
            <select id="book-parking-cat" className="book-parking-select" value="anu" disabled aria-label="Parking location">
              <option value="anu">{LOT_NAME}</option>
            </select>

            <div className="book-parking-list">
              {SIDE_CARDS.map((card) => (
                <Link
                  key={card.id}
                  to={ALEXANDRIA_LOT_PATH}
                  className="book-parking-mini-card book-parking-mini-card--link"
                >
                  <IconGrad />
                  <div className="book-parking-mini-body">
                    <h3 className="book-parking-mini-title">{card.title}</h3>
                    <p className="book-parking-mini-meta">{card.locations} locations available</p>
                  </div>
                  <span className="book-parking-select-btn">Select</span>
                </Link>
              ))}
            </div>
          </aside>

          <section className="book-parking-map-section" aria-label="Map">
            <div className="book-parking-map-toolbar">
              <button type="button" className="book-parking-map-filters">
                Filters
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <div className="book-parking-map-tools">
                <button type="button" className="book-parking-map-tool" aria-label="Map settings">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                      stroke="currentColor"
                      strokeWidth="1.75"
                    />
                    <path
                      d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
                      stroke="currentColor"
                      strokeWidth="1.25"
                    />
                  </svg>
                </button>
                <button type="button" className="book-parking-map-tool" aria-label="Layers">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="book-parking-map">
              <BookParkingMap />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default BookParkingPage;
