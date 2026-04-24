import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifier } from '../context/NotifierContext';
import Navbar from '../components/Navbar';
import { apiUrl } from '../config/apiBase';
import { fetchWithAuth } from '../utils/authFetch';
import './Dashboard.css';

const ReportIncidentPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useNotifier();

  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [reservationId, setReservationId] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const first = user.first_name || user.firstName || '';
    const last = user.last_name || user.lastName || '';
    const combined = `${first} ${last}`.trim();
    setFullName((prev) => (prev.trim() ? prev : combined));
    const phone = user.phone_number || user.phoneNumber || '';
    setMobile((prev) => (prev.trim() ? prev : phone));
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = fullName.trim();
    const phone = mobile.trim();
    const text = description.trim();
    const bookingIdRaw = reservationId.trim();

    if (!name || !phone || !bookingIdRaw || !text) {
      toast(
        'Please fill in your full name, mobile number, reservation ID, and a description of what happened.',
        { variant: 'error' }
      );
      return;
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const trimmedBooking = bookingIdRaw.trim();
    if (!uuidRe.test(trimmedBooking)) {
      toast('Reservation ID must be the booking UUID shown on your dashboard or QR.', { variant: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('fullName', name);
      formData.append('mobile', phone);
      formData.append('reservationId', trimmedBooking);
      formData.append('description', text);
      if (user != null && user.id != null) {
        formData.append('userId', String(user.id));
      }
      if (photo) formData.append('photo', photo);

      const res = await fetchWithAuth(apiUrl('/incidents'), {
        method: 'POST',
        body: formData,
      });
      const rawText = await res.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { error: rawText?.slice(0, 200) || `Server error (${res.status})` };
      }

      if (!res.ok || !data.ok) {
        toast(data.error || 'Could not submit your report. Please try again.', { variant: 'error' });
        return;
      }

      toast('Your incident report has been submitted. Thank you.', { variant: 'success' });
      navigate('/user');
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
          <p>Tell us what happened. Include the booking ID from your reservation or QR. Optional photo helps us review.</p>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="modal-content">
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="incident-full-name">Full name</label>
              <input
                id="incident-full-name"
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
              <label htmlFor="incident-mobile">Mobile number</label>
              <input
                id="incident-mobile"
                name="mobile"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="e.g. 01xxxxxxxxx"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="incident-reservation-id">Reservation ID</label>
              <input
                id="incident-reservation-id"
                name="reservationId"
                type="text"
                autoComplete="off"
                value={reservationId}
                onChange={(e) => setReservationId(e.target.value)}
                placeholder="Booking ID from your dashboard or QR"
                required
              />
              <p className="form-hint" style={{ marginBottom: 0, marginTop: 8 }}>
                Required — paste the booking UUID shown on your reservation or QR.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="incident-description">What happened?</label>
              <textarea
                id="incident-description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the incident in as much detail as you can."
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="incident-photo">Photo (optional)</label>
              <input
                id="incident-photo"
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
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/user')} disabled={submitting}>
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

export default ReportIncidentPage;
