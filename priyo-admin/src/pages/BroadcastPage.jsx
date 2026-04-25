import React, { useState } from 'react';
import axios from 'axios';
import { useAdminAuth } from '../context/AuthContext';

export default function BroadcastPage() {
  const { token } = useAdminAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      alert('Please enter both a title and a message.');
      return;
    }

    const confirmed = window.confirm(`Send this notification to ALL users?\n\nTitle: ${title}\nMessage: ${body}`);
    if (!confirmed) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/admin/broadcast`,
        { title, body },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResult({ success: true, message: res.data.message });
      setTitle('');
      setBody('');
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.message || err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">📢 Broadcast Notification</h1>
      <p className="page-subtitle">Send a push notification to all users simultaneously.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Compose Form */}
        <div style={{
          background: 'rgba(22,33,62,0.4)',
          border: '1px solid rgba(99,110,123,0.15)',
          borderRadius: '16px',
          padding: '28px',
          backdropFilter: 'blur(10px)',
        }}>
          <h2 style={{ color: '#e6edf3', fontSize: '16px', fontWeight: '700', marginBottom: '24px' }}>
            Compose Message
          </h2>
          <form onSubmit={handleBroadcast}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'rgba(230,237,243,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                Notification Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 🎉 New Feature Available!"
                maxLength={60}
                className="search-input"
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: '14px' }}
              />
              <div style={{ fontSize: '11px', color: 'rgba(230,237,243,0.3)', marginTop: '4px', textAlign: 'right' }}>
                {title.length}/60
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'rgba(230,237,243,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                Message Body
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="e.g. We've launched voice messages! Update now to try it."
                maxLength={200}
                rows={5}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,110,123,0.2)',
                  color: '#e6edf3', borderRadius: '8px', padding: '12px 14px',
                  fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                }}
              />
              <div style={{ fontSize: '11px', color: 'rgba(230,237,243,0.3)', marginTop: '4px', textAlign: 'right' }}>
                {body.length}/200
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !title.trim() || !body.trim()}
              style={{
                width: '100%',
                background: loading || !title.trim() || !body.trim()
                  ? 'rgba(0,132,255,0.3)'
                  : 'linear-gradient(135deg, #0084FF, #0060CC)',
                color: '#fff', border: 'none', borderRadius: '12px',
                padding: '14px', fontSize: '15px', fontWeight: '700',
                cursor: loading || !title.trim() || !body.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {loading ? '⏳ Sending...' : '📤 Send to All Users'}
            </button>
          </form>
        </div>

        {/* Preview & Result Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Preview */}
          <div style={{
            background: 'rgba(22,33,62,0.4)',
            border: '1px solid rgba(99,110,123,0.15)',
            borderRadius: '16px',
            padding: '28px',
          }}>
            <h2 style={{ color: '#e6edf3', fontSize: '16px', fontWeight: '700', marginBottom: '20px' }}>
              📱 Preview
            </h2>
            <div style={{
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '14px',
              padding: '16px',
              display: 'flex',
              gap: '14px',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                background: 'linear-gradient(135deg,#0084FF,#7C00FF)',
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px',
              }}>
                💬
              </div>
              <div>
                <div style={{ color: '#e6edf3', fontWeight: '700', fontSize: '14px', marginBottom: '4px' }}>
                  {title || 'Notification Title'}
                </div>
                <div style={{ color: 'rgba(230,237,243,0.6)', fontSize: '13px', lineHeight: '1.5' }}>
                  {body || 'Your message will appear here...'}
                </div>
                <div style={{ color: 'rgba(230,237,243,0.3)', fontSize: '11px', marginTop: '6px' }}>
                  PriyoChat • now
                </div>
              </div>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div style={{
              background: result.success ? 'rgba(37,211,102,0.1)' : 'rgba(255,59,48,0.1)',
              border: `1px solid ${result.success ? 'rgba(37,211,102,0.25)' : 'rgba(255,59,48,0.25)'}`,
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <span style={{ fontSize: '24px' }}>{result.success ? '✅' : '❌'}</span>
              <div>
                <div style={{ color: result.success ? '#25d366' : '#ff453a', fontWeight: '700', fontSize: '14px' }}>
                  {result.success ? 'Broadcast Sent!' : 'Send Failed'}
                </div>
                <div style={{ color: 'rgba(230,237,243,0.7)', fontSize: '13px', marginTop: '4px' }}>
                  {result.message}
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div style={{
            background: 'rgba(0,132,255,0.08)',
            border: '1px solid rgba(0,132,255,0.15)',
            borderRadius: '14px',
            padding: '16px 20px',
          }}>
            <div style={{ color: '#58a6ff', fontWeight: '700', fontSize: '13px', marginBottom: '8px' }}>
              ℹ️ How it works
            </div>
            <ul style={{ color: 'rgba(230,237,243,0.6)', fontSize: '12px', lineHeight: '1.8', paddingLeft: '16px', margin: 0 }}>
              <li>Notification is sent to every registered device.</li>
              <li>Only users with push notifications enabled will receive it.</li>
              <li>This action is logged in Audit Logs.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
