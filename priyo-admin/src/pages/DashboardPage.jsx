import React, { useEffect, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import api from '../api/client';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const pct = (a, b) => (b ? Math.min(100, Math.round(((a || 0) / b) * 100)) : 0);

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/admin/analytics')
      .then((r) => { setData(r.data); setUpdated(new Date()); })
      .catch((e) => setError(e.response?.data?.message || 'Could not load analytics'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const daily = data?.dailyMessages || [];
  const total7 = daily.reduce((s, d) => s + d.count, 0);
  const avg7 = daily.length ? Math.round(total7 / daily.length) : 0;
  const peak = daily.reduce((m, d) => (d.count > (m?.count || 0) ? d : m), null);

  const chartData = {
    labels: daily.map((d) => d._id),
    datasets: [{
      label: 'Messages per Day',
      data: daily.map((d) => d.count),
      borderColor: '#0084FF',
      backgroundColor: 'rgba(0,132,255,0.10)',
      tension: 0.4,
      fill: true,
      pointBackgroundColor: '#0084FF',
      pointRadius: 4,
    }],
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: 'rgba(230,237,243,0.4)' }, grid: { color: 'rgba(99,110,123,0.1)' } },
      y: { ticks: { color: 'rgba(230,237,243,0.4)', precision: 0 }, grid: { color: 'rgba(99,110,123,0.1)' }, beginAtZero: true },
    },
  };

  const stats = [
    { icon: '👥', label: 'Total Users', value: data?.totalUsers, color: '#58a6ff' },
    { icon: '🟢', label: 'Active (24h)', value: data?.activeUsers24h, color: '#25d366', hint: data ? `${pct(data.activeUsers24h, data.totalUsers)}% of users` : '' },
    { icon: '🆕', label: 'New This Week', value: data?.newUsers7d, color: '#a78bfa' },
    { icon: '💬', label: 'Total Messages', value: data?.totalMessages?.toLocaleString(), color: '#58a6ff' },
    { icon: '📨', label: 'Messages (24h)', value: data?.messages24h, color: '#22d3ee' },
    { icon: '🚩', label: 'Pending Reports', value: data?.pendingReports, color: data?.pendingReports > 0 ? '#ff9500' : '#25d366', hint: data ? (data.pendingReports > 0 ? 'Needs review' : 'All clear') : '' },
  ];

  const firstLoad = loading && !data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">System overview and real-time metrics</p>
        </div>
        <div className="head-actions">
          {updated && <span className="updated-at">Updated {updated.toLocaleTimeString()}</span>}
          <button className="refresh-btn" onClick={load} disabled={loading}>
            <span className={loading ? 'spin' : ''}>⟳</span> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label} style={{ '--accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{firstLoad ? <span className="skeleton" /> : (s.value ?? '—')}</div>
            <div className="stat-label">{s.label}</div>
            {s.hint ? <div className="stat-hint">{s.hint}</div> : null}
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div className="chart-container">
          <div className="chart-title">📈 Messages Sent — Last 7 Days</div>
          {firstLoad ? <div className="empty-state"><p>Loading chart...</p></div>
            : daily.length ? <Line data={chartData} options={chartOptions} />
            : <div className="empty-state"><p>No message data yet</p></div>}
        </div>
        <div className="chart-container">
          <div className="chart-title">⚡ Quick Insights</div>
          <div className="mini-list">
            <div className="mini-row">
              <div className="mini-row-top"><span>Active users (24h)</span><b>{pct(data?.activeUsers24h, data?.totalUsers)}%</b></div>
              <div className="bar"><span style={{ width: `${pct(data?.activeUsers24h, data?.totalUsers)}%` }} /></div>
            </div>
            <div className="mini-row">
              <div className="mini-row-top"><span>New users this week</span><b>{pct(data?.newUsers7d, data?.totalUsers)}%</b></div>
              <div className="bar"><span style={{ width: `${pct(data?.newUsers7d, data?.totalUsers)}%` }} /></div>
            </div>
            <div className="mini-row">
              <div className="mini-row-top"><span>Messages in last 7 days</span><b>{total7.toLocaleString()}</b></div>
            </div>
            <div className="mini-row">
              <div className="mini-row-top"><span>Daily average</span><b>{avg7.toLocaleString()}</b></div>
            </div>
            <div className="mini-row">
              <div className="mini-row-top"><span>Busiest day</span><b>{peak ? `${peak._id} (${peak.count})` : '—'}</b></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
