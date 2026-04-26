import React, { useState, useEffect } from 'react';
import api from '../api/client';

export default function ApkControlPage() {
  const [version, setVersion] = useState('');
  const [apkUrl, setApkUrl] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function fetchInfo() {
      try {
        const res = await api.get('/admin/app-update');
        if (!isMounted) return;
        setVersion(res.data.version || '');
        setApkUrl(res.data.apkUrl || '');
        setReleaseNotes(res.data.releaseNotes || '');
      } catch (err) {
        if (!isMounted) return;
        setMessage('No update information found. Add APK details below.');
      }
    }
    fetchInfo();
    return () => { isMounted = false; };
  }, []);

  const handleSave = async () => {
    if (!version.trim() || !apkUrl.trim()) {
      setMessage('Version and APK URL are required.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      await api.put('/admin/app-update', {
        version: version.trim(),
        apkUrl: apkUrl.trim(),
        releaseNotes: releaseNotes.trim(),
      });
      setMessage('APK update information saved successfully.');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to save APK update info.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>APK Control</h1>
        <p>Manage the latest Android APK version, download link, and release notes.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Side: Current Status */}
        <div className="card" style={{ background: 'rgba(22,33,62,0.4)', borderColor: 'rgba(0,132,255,0.2)' }}>
          <h3 style={{ marginBottom: '20px', color: '#58a6ff', fontSize: '16px' }}>Current Live Configuration</h3>
          
          <div style={{ marginBottom: '18px' }}>
            <label className="form-label" style={{ opacity: 0.5 }}>Live Version</label>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>{version || '---'}</div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label className="form-label" style={{ opacity: 0.5 }}>APK URL</label>
            <div style={{ 
              fontSize: '12px', 
              color: '#a5d6ff', 
              wordBreak: 'break-all', 
              background: 'rgba(0,0,0,0.2)', 
              padding: '8px', 
              borderRadius: '6px',
              marginTop: '4px'
            }}>
              {apkUrl || 'Not configured'}
            </div>
          </div>

          <div>
            <label className="form-label" style={{ opacity: 0.5 }}>Release Notes</label>
            <div style={{ fontSize: '13px', color: 'rgba(230,237,243,0.7)', lineHeight: '1.5', marginTop: '4px' }}>
              {releaseNotes || 'No notes provided.'}
            </div>
          </div>
        </div>

        {/* Right Side: Update Form */}
        <div className="card">
          <h3 style={{ marginBottom: '20px', fontSize: '16px' }}>Update APK Details</h3>
          
          <div className="form-group">
            <label className="form-label">New Version String</label>
            <input
              className="form-input"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 1.2.5"
            />
          </div>

          <div className="form-group">
            <label className="form-label">New APK Download URL</label>
            <input
              className="form-input"
              value={apkUrl}
              onChange={(e) => setApkUrl(e.target.value)}
              placeholder="https://example.com/priyochat-latest.apk"
            />
          </div>

          <div className="form-group">
            <label className="form-label">New Release Notes</label>
            <textarea
              className="form-textarea"
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              placeholder="Describe what's new in this update..."
              rows={4}
            />
          </div>

          {message ? (
            <div className="form-message" style={{ 
              background: message.includes('success') ? 'rgba(37,211,102,0.1)' : 'rgba(255,69,58,0.1)',
              color: message.includes('success') ? '#25d366' : '#ff453a',
              padding: '10px',
              borderRadius: '8px',
              border: `1px solid ${message.includes('success') ? 'rgba(37,211,102,0.2)' : 'rgba(255,69,58,0.2)'}`
            }}>
              {message}
            </div>
          ) : null}

          <button className="primary-btn" onClick={handleSave} disabled={loading} style={{ 
            background: 'linear-gradient(135deg, #0084FF, #7C00FF)',
            boxShadow: '0 4px 15px rgba(0,132,255,0.3)'
          }}>
            {loading ? 'Saving Changes…' : 'Publish Update Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
