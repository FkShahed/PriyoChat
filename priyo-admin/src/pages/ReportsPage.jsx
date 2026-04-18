import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const STATUS_FILTERS = ['pending', 'resolved', 'dismissed', 'all'];
const REASON_LABELS = {
  spam: '🗑️ Spam',
  harassment: '😡 Harassment',
  inappropriate_content: '🔞 Inappropriate',
  hate_speech: '💢 Hate Speech',
  other: '❓ Other',
};

export default function ReportsPage() {
  const [data, setData] = useState({ reports: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = 1, s = 'pending') => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/reports?page=${p}&limit=15&status=${s}`);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, statusFilter); }, [page, statusFilter]);

  const resolve = async (id, action) => {
    await api.post(`/admin/reports/${id}/resolve`, { action, resolution: `Admin action: ${action}` });
    load(page, statusFilter);
  };

  const badgeClass = { pending: 'badge-pending', resolved: 'badge-resolved', dismissed: 'badge-dismissed', reviewed: 'badge-active' };

  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="page-subtitle">Review flagged messages and user reports</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">{data.total} Report{data.total !== 1 ? 's' : ''}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Reported By</th>
              <th>Reported User</th>
              <th>Reason</th>
              <th>Message Preview</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'rgba(230,237,243,0.3)' }}>Loading...</td></tr>
            ) : data.reports.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                <div className="empty-icon">🚩</div>
                <div style={{ color: 'rgba(230,237,243,0.3)' }}>No reports found</div>
              </td></tr>
            ) : data.reports.map((r) => (
              <tr key={r._id}>
                <td><div className="user-name">{r.reportedBy?.name}</div><div className="user-email">{r.reportedBy?.email}</div></td>
                <td><div className="user-name">{r.reportedUser?.name || '—'}</div></td>
                <td><span className="badge badge-pending">{REASON_LABELS[r.reason] || r.reason}</span></td>
                <td style={{ maxWidth: 200 }}>
                  <span style={{ color: 'rgba(230,237,243,0.5)', fontSize: 12 }} title={r.message?.text}>
                    {r.message?.text ? `"${r.message.text.slice(0, 50)}${r.message.text.length > 50 ? '...' : ''}"` : r.message?.images?.length ? '📷 Image' : '—'}
                  </span>
                </td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td><span className={`badge ${badgeClass[r.status] || 'badge-active'}`}>{r.status}</span></td>
                <td>
                  {r.status === 'pending' && (
                    <div className="actions">
                      <button className="btn btn-primary" onClick={() => resolve(r._id, 'resolve')}>✓ Resolve</button>
                      <button className="btn btn-ghost" onClick={() => resolve(r._id, 'dismiss')}>✕ Dismiss</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pagination">
          <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
          <span style={{ padding: '6px 12px', color: 'rgba(230,237,243,0.4)', fontSize: 13 }}>Page {page} of {data.totalPages}</span>
          <button className="page-btn" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
        </div>
      </div>
    </>
  );
}
