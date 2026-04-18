import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function UsersPage() {
  const [data, setData] = useState({ users: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const load = useCallback(async (p = 1, s = '') => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/users?page=${p}&limit=15&search=${s}`);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(1, search), 350);
    setPage(1);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { load(page, search); }, [page]);

  const doAction = async (userid, action) => {
    setActionLoading((prev) => ({ ...prev, [userid]: action }));
    try {
      if (action === 'ban') await api.put(`/admin/users/${userid}/ban`, { ban: true });
      else if (action === 'unban') await api.put(`/admin/users/${userid}/ban`, { ban: false });
      else if (action === 'warn') await api.put(`/admin/users/${userid}/warn`, { reason: 'Admin warning' });
      else if (action === 'suspend') await api.put(`/admin/users/${userid}/suspend`, { suspend: true });
      load(page, search);
    } finally {
      setActionLoading((prev) => ({ ...prev, [userid]: null }));
    }
  };

  return (
    <>
      <h1 className="page-title">User Management</h1>
      <p className="page-subtitle">View, manage, and moderate user accounts</p>
      <div className="table-card">
        <div className="table-header">
          <span className="table-title">All Users ({data.total})</span>
          <input
            className="search-input"
            placeholder="🔍  Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Warnings</th>
              <th>Joined</th>
              <th>Account</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'rgba(230,237,243,0.3)' }}>Loading...</td></tr>
            ) : data.users.length === 0 ? (
              <tr><td colSpan={6} className="empty-state"><div className="empty-icon">👥</div><div>No users found</div></td></tr>
            ) : data.users.map((u) => (
              <tr key={u._id}>
                <td>
                  <div className="avatar-cell">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="avatar-img" />
                    ) : (
                      <div className="avatar-fallback">{getInitials(u.name)}</div>
                    )}
                    <div>
                      <div className="user-name">{u.name}</div>
                      <div className="user-email">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {u.isBlocked ? (
                    <span className="badge badge-banned">Banned</span>
                  ) : u.isSuspended ? (
                    <span className="badge badge-suspended">Suspended</span>
                  ) : (
                    <span className="badge badge-active">Active</span>
                  )}
                </td>
                <td>{u.warnings > 0 ? <span style={{ color: '#ff9500', fontWeight: 700 }}>{u.warnings} warn{u.warnings > 1 ? 's' : ''}</span> : '—'}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  {u.isOnline ? <span className="badge badge-online">Online</span> : <span className="badge badge-offline">Offline</span>}
                </td>
                <td>
                  <div className="actions">
                    <button className="btn btn-warn" onClick={() => doAction(u._id, 'warn')}>⚠️ Warn</button>
                    {!u.isSuspended && <button className="btn btn-ban" onClick={() => doAction(u._id, 'suspend')}>⏸ Suspend</button>}
                    {u.isBlocked ? (
                      <button className="btn btn-unban" onClick={() => doAction(u._id, 'unban')}>✓ Unban</button>
                    ) : (
                      <button className="btn btn-ban" onClick={() => doAction(u._id, 'ban')}>🚫 Ban</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Pagination */}
        <div className="pagination">
          <button className="page-btn" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>‹ Prev</button>
          {Array.from({ length: Math.min(data.totalPages, 5) }, (_, i) => i + 1).map((p) => (
            <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
          ))}
          <button className="page-btn" onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages}>Next ›</button>
        </div>
      </div>
    </>
  );
}
