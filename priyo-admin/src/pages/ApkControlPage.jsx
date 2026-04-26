import React, { useState, useEffect } from 'react';
import api from '../api/client';

export default function ApkControlPage() {
  const [version, setVersion] = useState('');
  const [apkUrl, setApkUrl] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fetchInfo = async () => {
    try {
      const [infoRes, historyRes] = await Promise.all([
        api.get('/admin/app-update'),
        api.get('/admin/app-update/history')
      ]);
      setVersion(infoRes.data.version || '');
      setApkUrl(infoRes.data.apkUrl || '');
      setReleaseNotes(infoRes.data.releaseNotes || '');
      setHistory(historyRes.data || []);
    } catch (err) {
      console.error('Fetch error:', err);
      // It's fine if no update exists yet
    }
  };

  useEffect(() => {
    fetchInfo();
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
      setMessage('New APK version published successfully.');
      fetchInfo(); // Refresh history
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to save APK update info.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '1200px' }}>
      <div className="page-header">
        <h1>APK Control & History</h1>
        <p>Manage the latest Android APK version and view historical release logs.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '32px', alignItems: 'start', marginBottom: '40px' }}>
        {/* Left Side: Current Status */}
        <div className="card" style={{ background: 'rgba(22,33,62,0.4)', borderColor: 'rgba(0,132,255,0.2)' }}>
          <h3 style={{ marginBottom: '20px', color: '#58a6ff', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🚀</span> Current Live Configuration
          </h3>
          
          <div style={{ marginBottom: '18px' }}>
            <label className="form-label" style={{ opacity: 0.5 }}>Live Version</label>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#fff' }}>{history[0]?.version || '---'}</div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label className="form-label" style={{ opacity: 0.5 }}>APK URL</label>
            <div style={{ 
              fontSize: '12px', 
              color: '#a5d6ff', 
              wordBreak: 'break-all', 
              background: 'rgba(0,0,0,0.2)', 
              padding: '10px', 
              borderRadius: '8px',
              marginTop: '4px',
              border: '1px solid rgba(0,132,255,0.1)'
            }}>
              {history[0]?.apkUrl || 'Not configured'}
            </div>
          </div>

          <div>
            <label className="form-label" style={{ opacity: 0.5 }}>Release Notes</label>
            <div style={{ fontSize: '13px', color: 'rgba(230,237,243,0.7)', lineHeight: '1.6', marginTop: '4px' }}>
              {history[0]?.releaseNotes || 'No notes provided.'}
            </div>
          </div>
        </div>

        {/* Right Side: Update Form */}
        <div className="card">
          <h3 style={{ marginBottom: '20px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>➕</span> Publish New Version
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Version String</label>
              <input
                className="form-input"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. 1.2.6"
              />
            </div>
            <div className="form-group">
              <label className="form-label">APK Download URL</label>
              <input
                className="form-input"
                value={apkUrl}
                onChange={(e) => setApkUrl(e.target.value)}
                placeholder="https://example.com/priyochat-v1.2.6.apk"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Release Notes</label>
            <textarea
              className="form-textarea"
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              placeholder="Describe what's new in this update..."
              rows={3}
            />
          </div>

          {message ? (
            <div className="form-message" style={{ 
              background: message.includes('success') ? 'rgba(37,211,102,0.1)' : 'rgba(255,69,58,0.1)',
              color: message.includes('success') ? '#25d366' : '#ff453a',
              padding: '12px',
              borderRadius: '10px',
              marginBottom: '16px',
              border: `1px solid ${message.includes('success') ? 'rgba(37,211,102,0.2)' : 'rgba(255,69,58,0.2)'}`
            }}>
              {message}
            </div>
          ) : null}

          <button className="primary-btn" onClick={handleSave} disabled={loading} style={{ 
            background: 'linear-gradient(135deg, #0084FF, #7C00FF)',
            boxShadow: '0 4px 15px rgba(0,132,255,0.3)',
            marginTop: '0'
          }}>
            {loading ? 'Publishing…' : 'Publish New Update'}
          </button>
        </div>
      </div>

      {/* History Table */}
      <div className="table-card">
        <div className="table-header">
          <div className="table-title">APK Release History</div>
        </div>
        <table style={{ borderCollapse: 'separate', borderSpacing: '0' }}>
          <thead>
            <tr>
              <th style={{ paddingLeft: '24px' }}>Version</th>
              <th>Release Date</th>
              <th>Release Notes</th>
              <th>APK URL</th>
              <th style={{ paddingRight: '24px' }}>Published By</th>
            </tr>
          </thead>
          <tbody>
            {history.length > 0 ? (
              history.map((item) => (
                <tr key={item._id}>
                  <td style={{ paddingLeft: '24px' }}>
                    <span className="badge badge-active" style={{ fontSize: '13px' }}>{item.version}</span>
                  </td>
                  <td>
                    <div style={{ fontSize: '13px', color: '#e6edf3' }}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.5 }}>
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </div>
                  </td>
                  <td style={{ maxWidth: '300px' }}>
                    <div style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.releaseNotes || '-'}
                    </div>
                  </td>
                  <td>
                    <a 
                      href={item.apkUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: '#58a6ff', fontSize: '12px', textDecoration: 'none' }}
                    >
                      Download APK
                    </a>
                  </td>
                  <td style={{ paddingRight: '24px' }}>
                    <div style={{ fontSize: '13px' }}>{item.updatedBy?.name || 'Admin'}</div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="empty-state">
                  <div className="empty-icon">📂</div>
                  <div>No release history found.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
