import React, { useEffect, useState } from 'react';
import api from '../api/client';

export default function AuditLogsPage() {
  const [data, setData] = useState({ logs: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/audit-logs?page=${page}&limit=25`)
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const actionColor = {
    BAN_USER: '#ff453a', UNBAN_USER: '#4ade80', SUSPEND_USER: '#ff9500',
    WARN_USER: '#f59e0b', RESOLVE_REPORT: '#4ade80', LOGIN: '#58a6ff',
    UNSUSPEND_USER: '#4ade80', DISMISS_REPORT: '#8e8e93',
  };

  return (
    <>
      <h1 className="page-title">Audit Logs</h1>
      <p className="page-subtitle">Transparent record of all admin actions</p>
      <div className="table-card">
        <div className="table-header">
          <span className="table-title">{data.total} Log Entr{data.total !== 1 ? 'ies' : 'y'}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target Type</th>
              <th>Details</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'rgba(230,237,243,0.3)' }}>Loading...</td></tr>
            ) : data.logs.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 60 }}>
                <div className="empty-icon">📋</div>
                <div style={{ color: 'rgba(230,237,243,0.3)' }}>No audit logs yet</div>
              </td></tr>
            ) : data.logs.map((log) => (
              <tr key={log._id}>
                <td style={{ fontSize: 12, color: 'rgba(230,237,243,0.5)' }}>
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td>
                  <div className="user-name">{log.admin?.name}</div>
                  <div className="user-email">{log.admin?.email}</div>
                </td>
                <td>
                  <span className="log-action" style={{ color: actionColor[log.action] || '#58a6ff', background: `${actionColor[log.action] || '#58a6ff'}18` }}>
                    {log.action}
                  </span>
                </td>
                <td style={{ color: 'rgba(230,237,243,0.5)', fontSize: 12 }}>{log.targetType}</td>
                <td style={{ fontSize: 12, color: 'rgba(230,237,243,0.5)', maxWidth: 200 }}>
                  {log.details?.targetName && <span>User: <strong style={{ color: '#e6edf3' }}>{log.details.targetName}</strong></span>}
                  {log.details?.reason && <div>Reason: {log.details.reason}</div>}
                </td>
                <td style={{ fontSize: 12, color: 'rgba(230,237,243,0.3)', fontFamily: 'monospace' }}>{log.ipAddress || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pagination">
          <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
          <span style={{ padding: '6px 12px', color: 'rgba(230,237,243,0.4)', fontSize: 13 }}>Page {page} / {data.totalPages}</span>
          <button className="page-btn" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
        </div>
      </div>
    </>
  );
}
