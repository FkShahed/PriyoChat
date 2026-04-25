import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAdminAuth } from '../context/AuthContext';

export default function BugReportsPage() {
  const { token } = useAdminAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchBugReports = async () => {
    setLoading(true);
    try {
      const url = `${import.meta.env.VITE_API_URL}/admin/bug-reports${statusFilter ? `?status=${statusFilter}` : ''}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReports(res.data.reports || []);
    } catch (err) {
      console.error(err);
      alert('Failed to fetch bug reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBugReports();
  }, [statusFilter]);

  const updateStatus = async (id, newStatus) => {
    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/admin/bug-reports/${id}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Update local state
      setReports(reports.map((r) => (r._id === id ? { ...r, status: newStatus } : r)));
    } catch (err) {
      console.error(err);
      alert('Failed to update status');
    }
  };

  return (
    <div>
      <h1 className="page-title">Bug Reports</h1>
      <p className="page-subtitle">Manage system and app bug reports from users.</p>

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">Recent Reports</span>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="search-input" 
            style={{ width: '150px' }}
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>Loading...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Reporter</th>
                <th>Title & Description</th>
                <th>Device Info</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>
                    No bug reports found.
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <div className="user-name">{r.reportedBy?.name || 'Unknown User'}</div>
                      <div className="user-email">{r.reportedBy?.email || ''}</div>
                    </td>
                    <td style={{ maxWidth: '300px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px', fontSize: '13px' }}>{r.title}</div>
                      <div style={{ color: 'rgba(230,237,243,0.7)', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                        {r.description}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '11px', color: 'rgba(230,237,243,0.5)', fontFamily: 'monospace' }}>
                        {r.deviceInfo || 'N/A'}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${r.status === 'open' ? 'pending' : r.status === 'resolved' ? 'resolved' : r.status === 'closed' ? 'dismissed' : 'active'}`}>
                        {r.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <select 
                        value={r.status}
                        onChange={(e) => updateStatus(r._id, e.target.value)}
                        className="search-input"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
