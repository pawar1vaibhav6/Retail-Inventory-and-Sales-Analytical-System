import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { notificationsAPI } from '../services/api';

export default function NotificationPreferences() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    expiry_alert_threshold_days: 30,
    auto_markdown_trigger_days: 15,
    notification_channels: 'app,email',
    daily_job_auto_run_enabled: true
  });
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningJob, setRunningJob] = useState(false);
  const [jobResult, setJobResult] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, notifsRes] = await Promise.all([
        notificationsAPI.getSettings(),
        notificationsAPI.getNotifications()
      ]);
      if (settingsRes && settingsRes.settings) {
        setSettings(settingsRes.settings);
      }
      if (notifsRes && notifsRes.notifications) {
        setNotifications(notifsRes.notifications);
        setUnreadCount(notifsRes.unread_count || 0);
      }
    } catch (err) {
      console.warn('[NotificationPreferences] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await notificationsAPI.updateSettings(settings);
      if (res.success) {
        setFeedback({ type: 'success', text: 'Notification preferences updated successfully.' });
      } else {
        setFeedback({ type: 'danger', text: res.message || 'Failed to update preferences.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message || 'Network error saving preferences.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerJob = async () => {
    setRunningJob(true);
    setJobResult(null);
    try {
      const res = await notificationsAPI.triggerExpiryJob();
      if (res.success) {
        setJobResult(res.result);
        await loadData();
      }
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message || 'Job trigger failed.' });
    } finally {
      setRunningJob(false);
    }
  };

  const handleMarkRead = async (notifId) => {
    try {
      await notificationsAPI.markAsRead(notifId);
      setNotifications(prev => prev.map(n => n.notification_id === notifId ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('[NotificationPreferences] Mark read error:', err);
    }
  };

  return (
    <div className="container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 700 }}>
            <i className="fa-solid fa-bell text-warning me-2" /> Expiry Notification &amp; Policy Settings
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>
            Multi-Echelon Scheduled Alert Scanning, Near-Expiry Thresholds &amp; Targeted Push Notifications
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleTriggerJob}
          disabled={runningJob}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {runningJob ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-bolt" />}
          <span>{runningJob ? 'Scanning Chain...' : 'Trigger Expiry Scan Now'}</span>
        </button>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4`} style={{ borderRadius: '8px' }}>
          {feedback.text}
        </div>
      )}

      {jobResult && (
        <div className="alert alert-info mb-4" style={{ borderRadius: '8px', borderLeft: '4px solid #0284c7' }}>
          <h5 style={{ margin: '0 0 0.5rem' }}>
            <i className="fa-solid fa-check-circle text-success me-2" /> Daily Expiry Job Execution Complete
          </h5>
          <p style={{ margin: 0 }}>
            Generated <strong>{jobResult.alerts_generated}</strong> targeted alerts across stores and headquarters.
            Total near-expiry value scanned: <strong>₹{jobResult.total_chain_cost_value?.toLocaleString('en-IN') || 0}</strong> ({jobResult.total_chain_batches || 0} batches).
          </p>
        </div>
      )}

      <div className="row g-4">
        {/* Left Column: Settings Form */}
        <div className="col-lg-5">
          <div className="card shadow-sm border-0" style={{ borderRadius: '12px' }}>
            <div className="card-header bg-transparent py-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              <h5 style={{ margin: 0, fontWeight: 600 }}>
                <i className="fa-solid fa-sliders text-primary me-2" /> Alert Configuration
              </h5>
            </div>
            <div className="card-body">
              <form onSubmit={handleSaveSettings}>
                <div className="mb-3">
                  <label className="form-label font-bold">Urgent Expiry Alert Window (Days)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={settings.expiry_alert_threshold_days}
                    onChange={(e) => setSettings({ ...settings, expiry_alert_threshold_days: Number(e.target.value) })}
                    min="1"
                    max="90"
                    required
                  />
                  <small className="text-muted">
                    Batches expiring within this window trigger URGENT alerts to Store Supervisors.
                  </small>
                </div>

                <div className="mb-3">
                  <label className="form-label font-bold">Auto-Markdown Suggestion Trigger (Days)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={settings.auto_markdown_trigger_days}
                    onChange={(e) => setSettings({ ...settings, auto_markdown_trigger_days: Number(e.target.value) })}
                    min="1"
                    max="60"
                    required
                  />
                  <small className="text-muted">
                    Threshold where automated tiered markdown discounts are suggested for floor display.
                  </small>
                </div>

                <div className="mb-3">
                  <label className="form-label font-bold">Notification Channels</label>
                  <input
                    type="text"
                    className="form-control"
                    value={settings.notification_channels}
                    onChange={(e) => setSettings({ ...settings, notification_channels: e.target.value })}
                    placeholder="app,email,sms"
                  />
                  <small className="text-muted">Comma-separated delivery channels (e.g. app, email, sms).</small>
                </div>

                <div className="mb-4 form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="autoJobSwitch"
                    checked={settings.daily_job_auto_run_enabled}
                    onChange={(e) => setSettings({ ...settings, daily_job_auto_run_enabled: e.target.checked })}
                  />
                  <label className="form-check-label font-bold" htmlFor="autoJobSwitch">
                    Automatic 24-Hour Expiry Scanner Job
                  </label>
                  <div>
                    <small className="text-muted">
                      When active, cron scans all inventory every morning at 06:00 AM IST.
                    </small>
                  </div>
                </div>

                <button type="submit" className="btn btn-success w-100" disabled={saving}>
                  {saving ? 'Saving Preferences...' : 'Save Alert Preferences'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Notification Feed */}
        <div className="col-lg-7">
          <div className="card shadow-sm border-0" style={{ borderRadius: '12px' }}>
            <div className="card-header bg-transparent py-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              <h5 style={{ margin: 0, fontWeight: 600 }}>
                <i className="fa-solid fa-inbox text-warning me-2" /> Recent Alert Notifications
              </h5>
              <span className="badge bg-warning text-dark px-3 py-2" style={{ borderRadius: '20px' }}>
                {unreadCount} Unread
              </span>
            </div>
            <div className="card-body p-0">
              {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <i className="fa-solid fa-spinner fa-spin fa-2x text-muted" />
                </div>
              ) : notifications.length > 0 ? (
                <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
                  {notifications.map((n) => (
                    <div
                      key={n.notification_id}
                      style={{
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                        backgroundColor: n.is_read ? 'transparent' : 'rgba(255, 186, 8, 0.07)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '1rem'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span
                            className={`badge bg-${n.severity === 'URGENT' ? 'danger' : n.severity === 'WARNING' ? 'warning text-dark' : 'info'}`}
                            style={{ fontSize: '11px', textTransform: 'uppercase' }}
                          >
                            {n.severity}
                          </span>
                          <span className="badge bg-secondary" style={{ fontSize: '11px' }}>
                            {n.category}
                          </span>
                          <strong style={{ fontSize: '15px' }}>{n.title}</strong>
                        </div>
                        <p style={{ margin: '0 0 0.25rem', fontSize: '13.5px', color: '#4b5563' }}>
                          {n.message}
                        </p>
                        <small className="text-muted" style={{ fontSize: '12px' }}>
                          <i className="fa-regular fa-clock me-1" />
                          {n.created_at ? new Date(n.created_at).toLocaleString() : 'Recent'}
                        </small>
                      </div>

                      {!n.is_read && (
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => handleMarkRead(n.notification_id)}
                          title="Mark as read"
                          style={{ whiteSpace: 'nowrap', fontSize: '12px' }}
                        >
                          <i className="fa-solid fa-check me-1" /> Mark Read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#6b7280' }}>
                  <i className="fa-solid fa-bell-slash fa-3x mb-3 text-muted" />
                  <h5>No Alerts Pending</h5>
                  <p style={{ margin: 0 }}>All inventory items are healthy and within standard shelf-life thresholds.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

