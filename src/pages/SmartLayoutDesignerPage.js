import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './SmartLayoutDesignerPage.css';

const STATIC_HTML = `${process.env.PUBLIC_URL || ''}/lot-designer-3d.html`;

const SmartLayoutDesignerPage = () => (
  <div className="smart-layout-page smart-layout-page--embed">
    <Navbar />
    <div className="smart-layout-toolbar">
      <Link to="/" className="btn btn-outline-light btn-sm smart-layout-home-link">
        Back to home
      </Link>
    </div>
    <main className="smart-layout-embed-main">
      <iframe
        title="ParkGo — lot designer"
        className="smart-layout-embed-frame"
        src={STATIC_HTML}
      />
    </main>
  </div>
);

export default SmartLayoutDesignerPage;
