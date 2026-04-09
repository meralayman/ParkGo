import React from 'react';
import Navbar from '../components/Navbar';
import './SmartLayoutDesignerPage.css';

const STATIC_HTML = `${process.env.PUBLIC_URL || ''}/lot-designer-3d.html`;

const SmartLayoutDesignerPage = () => (
  <div className="smart-layout-page smart-layout-page--embed">
    <Navbar />
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
