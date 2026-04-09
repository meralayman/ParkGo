import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifier } from '../context/NotifierContext';
import Navbar from '../components/Navbar';
import { apiUrl } from '../config/apiBase';
import './Dashboard.css';

const ReportIncidentGatekeeperPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useNotifier();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const first = user.first_name || user.firstName || '';
    const last = user.last_name || user.lastName || '';
    const combined = `${first} ${last}`.trim();
    setFullName((prev) => (prev.trim() ? prev : combined));
    if (user.email) setEmail((prev) => (prev.trim() ? prev : user.email));
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = fullName.trim();
    const mail = email.trim();
    const text = description.trim();

    if (!name || !mail || !text) {
      toast('Please fill in full name, email, and what happened.', { variant: 'error' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      toast('Please enter a valid email address.', { variant: 'error' });
      return;
    }

    if (!user?.id) {
      toast('You must be logged in to submit a report.', { variant: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('fullName', name);
      formData.append('email', mail);
      formData.append('description', text);
      formData.append('gatekeeperUserId', String(user.id));
      if (photo) formData.append('photo', photo);

      const res = await fetch(apiUrl('/incidents/gatekeeper'), {
        method: 'POST',
        body: formData,
      });
      const responseBody = await res.text();
      let data = {};
      try {
        data = responseBody ? JSON.parse(responseBody) : {};
      } catch {
        data = {};
      }

      if (!res.ok || !data.ok) {
        const trimmed = (responseBody || '').trim();
        const looksHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<');
        const hint = looksHtml
          ? 'The API returned a webpage instead of JSON. Restart the backend from the project backend folder (node server.js) so POST /incidents/gatekeeper is registered.'
          : null;
        toast(data.error || hint || trimmed.slice(0, 200) || 'Could not submit your report. Please try again.', {
          variant: 'error',
        });
        return;
      }

      toast('Incident report submitted. Thank you.', { variant: 'success' });
      navigate('/gatekeeper');
    } catch (err) {
      toast(err.message || 'Cannot reach server', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard report-incident-page">
      <Navbar />
      <header className="dashboard-header">
        <div>
          <h1>Report an incident</h1>
          <p>Record what happened at the gate. Photo is optional.</p>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="modal-content">
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="gk-incident-full-name">Full name</label>
              <input
                id="gk-incident-full-name"
                name="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="gk-incident-email">Email</label>
              <input
                id="gk-incident-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="gk-incident-description">What happened?</label>
              <textarea
                id="gk-incident-description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the incident."
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="gk-incident-photo">Photo (optional)</label>
              <input
                id="gk-incident-photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => setPhoto(e.target.files?.[0] || null)}
              />
              <p className="form-hint" style={{ marginBottom: 0, marginTop: 8 }}>
                JPEG, PNG, GIF, or WebP. Max 5 MB.
              </p>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/gatekeeper')} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ReportIncidentGatekeeperPage;
