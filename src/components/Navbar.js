import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const Navbar = ({ showAuthLinks = false, variant = 'default' }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    setMobileOpen(false);
    logout();
    navigate('/');
  };

  useEffect(() => {
    const handleResize = () => { if (window.innerWidth >= 992) setMobileOpen(false); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navLinks = (
    <>
      <Link to="/lot-designer" className="nav-link parkgo-nav-link" onClick={() => setMobileOpen(false)}>
        Lot designer
      </Link>
      {showAuthLinks && !user && (
        <>
          <Link to="/login" className="nav-link parkgo-nav-link" onClick={() => setMobileOpen(false)}>Login</Link>
          <Link to="/signup" className="btn btn-primary parkgo-btn-signup" onClick={() => setMobileOpen(false)}>Sign up</Link>
        </>
      )}
      {user && (
        <button type="button" onClick={handleLogout} className="btn btn-outline-light parkgo-btn-logout">Logout</button>
      )}
    </>
  );

  if (variant === 'landing') {
    const landingLinks = (
      <>
        {showAuthLinks && !user && (
          <>
            <Link to="/login" className="parkgo-landing-login" onClick={() => setMobileOpen(false)}>
              {'Login >'}
            </Link>
            <Link to="/signup" className="parkgo-landing-signup" onClick={() => setMobileOpen(false)}>
              Sign Up
            </Link>
          </>
        )}
      </>
    );

    return (
      <nav className="parkgo-navbar parkgo-navbar--landing">
        <div className="parkgo-navbar-landing-inner">
          <Link to="/" className="parkgo-landing-brand parkgo-landing-brand-logo-only" onClick={() => setMobileOpen(false)} aria-label="ParkGO home">
            <img
              src={`${process.env.PUBLIC_URL || ''}/parkgo-logo.png`}
              alt=""
              className="parkgo-landing-logo-img"
              onError={(e) => {
                e.target.style.display = 'none';
                const fb = e.target.nextElementSibling;
                if (fb) fb.style.display = 'flex';
              }}
            />
            <span className="parkgo-landing-logo-fallback" style={{ display: 'none' }} aria-hidden>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M5 17h14v-5l-2-5H7L5 12v5z"
                  stroke="#2563eb"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
                <path d="M7 17v2M17 17v2" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </span>
          </Link>
          <button
            type="button"
            className="parkgo-navbar-toggler parkgo-navbar-toggler--landing d-lg-none"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <span className={mobileOpen ? 'open' : ''} />
            <span className={mobileOpen ? 'open' : ''} />
            <span className={mobileOpen ? 'open' : ''} />
          </button>
          <div className="parkgo-landing-desktop d-none d-lg-flex">{landingLinks}</div>
        </div>
        <div className={`parkgo-landing-mobile d-lg-none ${mobileOpen ? 'show' : ''}`}>{landingLinks}</div>
      </nav>
    );
  }

  return (
    <nav className="navbar parkgo-navbar navbar-expand-lg navbar-dark">
      <div className="container-fluid parkgo-navbar-container">
        <div className="navbar-left d-flex align-items-center">
          {user && (
            <span className="navbar-role-badge badge rounded-pill d-none d-lg-inline-block">{user.role}</span>
          )}
          <button
            type="button"
            className="parkgo-navbar-toggler d-lg-none"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <span className={mobileOpen ? 'open' : ''} />
            <span className={mobileOpen ? 'open' : ''} />
            <span className={mobileOpen ? 'open' : ''} />
          </button>
        </div>
        <Link to="/" className="navbar-brand navbar-brand-center mx-auto" onClick={() => setMobileOpen(false)}>
          <img
            src={`${process.env.PUBLIC_URL || ''}/parkgo-logo.png`}
            alt="ParkGO"
            className="navbar-logo"
            onError={(e) => {
              e.target.style.display = 'none';
              const fallback = e.target.nextElementSibling;
              if (fallback) fallback.style.display = 'inline';
            }}
          />
          <span className="navbar-logo-fallback" style={{ display: 'none' }}>ParkGO</span>
        </Link>
        <div className="navbar-right d-flex align-items-center gap-2 d-none d-lg-flex">
          {navLinks}
        </div>
        <div className="parkgo-navbar-mobile d-lg-none">
          <div className={`parkgo-navbar-collapse ${mobileOpen ? 'show' : ''}`}>
            {user && (
              <span className="navbar-role-badge badge rounded-pill parkgo-mobile-role">{(user.role || '').toLowerCase()}</span>
            )}
            {navLinks}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
