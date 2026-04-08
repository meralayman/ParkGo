import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import WelcomeHeroIllustration from '../components/WelcomeHeroIllustration';
import './WelcomePage.css';

const LANDING_FEATURES = [
  {
    title: 'Effortless Parking',
    desc: 'Quickly find and book parking, pay seamlessly, and receive navigation assistance.',
    icon: (
      <span className="welcome-feature-icon-wrap" aria-hidden>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="#eff6ff" />
          <circle cx="27" cy="13" r="6" fill="#2563eb" />
          <text
            x="27"
            y="16"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="7"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            P
          </text>
          <path
            d="M11 25h18v-4.5l-1.8-4.5H12.8L11 20.5V25z"
            stroke="#2563eb"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M13 25v2M27 25v2" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    ),
  },
  {
    title: 'Smart Parking Layout',
    desc: 'Use our AI-powered tool to generate optimal parking layouts for your lot.',
    icon: (
      <span className="welcome-feature-icon-wrap" aria-hidden>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="#eff6ff" />
          <path
            d="M12 14h6v6h-6v-6zm10 0h6v6h-6v-6zm-10 10h6v6h-6v-6zm10 0h6v6h-6v-6z"
            stroke="#2563eb"
            strokeWidth="1.25"
          />
        </svg>
      </span>
    ),
  },
];

const WelcomePage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user) {
      const roleRoutes = { admin: '/admin', user: '/user', gatekeeper: '/gatekeeper' };
      navigate(roleRoutes[user.role] || '/user', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || user) return null;

  return (
    <div className="welcome-page">
      <Navbar showAuthLinks />
      <main className="welcome-main">
        <section className="welcome-hero">
          <div className="welcome-hero-copy">
            <h1 className="welcome-headline">Find and Manage Parking Effortlessly</h1>
            <p className="welcome-subhead">
              Book, pay, and navigate to your perfect parking spot, or design your own efficient parking layout in minutes.
            </p>
            <div className="welcome-actions">
              <Link to="/book-parking" className="welcome-btn welcome-btn-primary">
                <span className="welcome-btn-ico" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M5 17h14v-5l-2-5H7L5 12v5z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path d="M7 17v2M17 17v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                Book Parking
              </Link>
              <Link to="/lot-designer" className="welcome-btn welcome-btn-secondary">
                <span className="welcome-btn-ico" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M4 6h6v6H4V6zm10 0h6v6h-6V6zM4 16h6v6H4v-6zm10 0h6v6h-6v-6z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </span>
                Turn your space into parking
              </Link>
            </div>
            <p className="welcome-caption">For parking owners &amp; businesses</p>
          </div>
          <div className="welcome-hero-visual">
            <WelcomeHeroIllustration />
          </div>
        </section>

        <section className="welcome-features" id="features">
          <div className="welcome-features-grid">
            {LANDING_FEATURES.map((f, i) => (
              <div key={i} className="welcome-feature-card">
                {f.icon}
                <h3 className="welcome-feature-title">{f.title}</h3>
                <p className="welcome-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="welcome-video-section" aria-labelledby="welcome-video-heading">
          <h2 id="welcome-video-heading" className="welcome-video-title">
            See ParkGO in action
          </h2>
          <div className="welcome-video-frame">
            <video
              className="welcome-video"
              src={`${process.env.PUBLIC_URL || ''}/parkgo-demo.mp4`}
              controls
              playsInline
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </section>
      </main>
    </div>
  );
};

export default WelcomePage;
