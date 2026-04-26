import React, { useState, useEffect } from 'react';
import api from '../api/client';

export default function ApkControlPage() {
  const [version, setVersion] = useState('');
  const [apkUrl, setApkUrl] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [globalRingtoneUrl, setGlobalRingtoneUrl] = useState('');
  const [availableRingtones, setAvailableRingtones] = useState([]);
  const [newRingtoneName, setNewRingtoneName] = useState('');

  const fetchInfo = async () => {
    try {
      const [infoRes, historyRes, configRes] = await Promise.all([
        api.get('/admin/app-update'),
        api.get('/admin/app-update/history'),
        api.get('/admin/config')
      ]);
      setVersion(infoRes.data.version || '');
      setApkUrl(infoRes.data.apkUrl || '');
      setReleaseNotes(infoRes.data.releaseNotes || '');
      setHistory(historyRes.data || []);
      setGlobalRingtoneUrl(configRes.data.defaultRingtoneUrl || '');
      setAvailableRingtones(configRes.data.availableRingtones || []);
    } catch (err) {
      console.error('Fetch error:', err);
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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this APK version history?')) {
      return;
    }
    
    setLoading(true);
    setMessage('');
    try {
      await api.delete(`/admin/app-update/${id}`);
      setMessage('APK version history deleted successfully.');
      fetchInfo();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to delete APK update info.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadRingtone = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('files', file);

      // 1. Upload file to Cloudinary via media route
      const uploadRes = await api.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const newUrl = uploadRes.data[0]?.url;
      if (!newUrl) throw new Error('Upload failed');

      // 2. Save config
      await api.put('/admin/config', { defaultRingtoneUrl: newUrl });
      setGlobalRingtoneUrl(newUrl);
      setMessage('Global default ringtone updated successfully.');
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.message || 'Failed to update global ringtone.');
    } finally {
      setLoading(false);
      e.target.value = ''; // reset file input
    }
  };

  const handleAddCuratedRingtone = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!newRingtoneName.trim()) {
      alert('Please enter a name for the ringtone before uploading.');
      e.target.value = '';
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('files', file);

      // 1. Upload to Cloudinary
      const uploadRes = await api.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const newUrl = uploadRes.data[0]?.url;
      if (!newUrl) throw new Error('Upload failed');

      // 2. Add to array and save
      const updatedRingtones = [...availableRingtones, { name: newRingtoneName.trim(), url: newUrl }];
      await api.put('/admin/config', { availableRingtones: updatedRingtones });
      setAvailableRingtones(updatedRingtones);
      setNewRingtoneName('');
      setMessage('Ringtone added to library successfully.');
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.message || 'Failed to add ringtone to library.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleDeleteCuratedRingtone = async (indexToDelete) => {
    if (!window.confirm('Are you sure you want to remove this ringtone from the library?')) return;
    
    setLoading(true);
    try {
      const updatedRingtones = availableRingtones.filter((_, idx) => idx !== indexToDelete);
      await api.put('/admin/config', { availableRingtones: updatedRingtones });
      setAvailableRingtones(updatedRingtones);
      setMessage('Ringtone removed successfully.');
    } catch (err) {
      console.error(err);
      setMessage('Failed to remove ringtone.');
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

      {/* Global App Settings Section */}
      <div className="card" style={{ marginBottom: '40px' }}>
        <h3 style={{ marginBottom: '20px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>⚙️</span> Global App Settings
        </h3>
        <p style={{ opacity: 0.7, fontSize: '14px', marginBottom: '16px' }}>
          Upload an audio file (MP3/WAV) to be used as the default incoming call ringtone for all users globally. Users can still override this locally.
        </p>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <label className="form-label" style={{ opacity: 0.5 }}>Current Global Ringtone URL</label>
            <div style={{ 
              fontSize: '12px', color: '#a5d6ff', wordBreak: 'break-all', 
              background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', 
              border: '1px solid rgba(0,132,255,0.1)', minHeight: '38px'
            }}>
              {globalRingtoneUrl ? (
                <a href={globalRingtoneUrl} target="_blank" rel="noreferrer" style={{ color: '#a5d6ff' }}>{globalRingtoneUrl}</a>
              ) : 'No custom global ringtone configured (using app default).'}
            </div>
          </div>
          
          <div style={{ marginTop: '22px' }}>
            <label htmlFor="ringtone-upload" className="primary-btn" style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #34C759, #28a745)',
              boxShadow: '0 4px 15px rgba(40,167,69,0.3)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              padding: '10px 20px',
              textAlign: 'center'
            }}>
              {loading ? 'Uploading...' : 'Upload Ringtone'}
            </label>
            <input 
              type="file" 
              id="ringtone-upload" 
              accept="audio/*" 
              style={{ display: 'none' }} 
              onChange={handleUploadRingtone} 
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {/* Admin Curated Ringtones Library Section */}
      <div className="card" style={{ marginBottom: '40px' }}>
        <h3 style={{ marginBottom: '20px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🎵</span> Curated Ringtone Library
        </h3>
        <p style={{ opacity: 0.7, fontSize: '14px', marginBottom: '16px' }}>
          Upload ringtones that users can select from inside the mobile app.
        </p>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
          <input
            className="form-input"
            value={newRingtoneName}
            onChange={(e) => setNewRingtoneName(e.target.value)}
            placeholder="Ringtone Name (e.g., Classical Piano)"
            style={{ flex: 1 }}
          />
          <label htmlFor="curated-upload" className="primary-btn" 
            onClick={(e) => {
              if (!newRingtoneName.trim() && !loading) {
                e.preventDefault();
                alert('Please enter a name for the ringtone before uploading.');
              }
            }}
            style={{
              background: 'linear-gradient(135deg, #0084FF, #7C00FF)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              margin: 0
            }}
          >
            {loading ? 'Uploading...' : 'Upload MP3'}
          </label>
          <input 
            type="file" 
            id="curated-upload" 
            accept="audio/*" 
            style={{ display: 'none' }} 
            onChange={handleAddCuratedRingtone} 
            disabled={loading}
          />
        </div>

        {availableRingtones.length > 0 ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {availableRingtones.map((ringtone, idx) => (
              <div key={idx} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontWeight: '600', color: '#e6edf3', fontSize: '14px' }}>{ringtone.name}</div>
                  <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>{ringtone.url}</div>
                </div>
                <button 
                  onClick={() => handleDeleteCuratedRingtone(idx)}
                  disabled={loading}
                  style={{
                    background: 'rgba(255,69,58,0.1)', color: '#ff453a', border: '1px solid rgba(255,69,58,0.2)',
                    padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '20px' }}>
            <div style={{ opacity: 0.5 }}>No curated ringtones added yet.</div>
          </div>
        )}
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
              <th>Published By</th>
              <th style={{ paddingRight: '24px', textAlign: 'right' }}>Actions</th>
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
                  <td>
                    <div style={{ fontSize: '13px' }}>{item.updatedBy?.name || 'Admin'}</div>
                  </td>
                  <td style={{ paddingRight: '24px', textAlign: 'right' }}>
                    <button 
                      onClick={() => handleDelete(item._id)}
                      disabled={loading}
                      style={{
                        background: 'rgba(255,69,58,0.1)',
                        color: '#ff453a',
                        border: '1px solid rgba(255,69,58,0.2)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="empty-state">
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
