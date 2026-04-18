import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import api from '../api/client';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/analytics').then((r) => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const chartData = {
    labels: data?.dailyMessages?.map((d) => d._id) || [],
    datasets: [
      {
        label: 'Messages per Day',
        data: data?.dailyMessages?.map((d) => d.count) || [],
        borderColor: '#0084FF',
        backgroundColor: 'rgba(0,132,255,0.08)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#0084FF',
        pointRadius: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { labels: { color: 'rgba(230,237,243,0.7)', font: { size: 12 } } } },
    scales: {
      x: { ticks: { color: 'rgba(230,237,243,0.4)' }, grid: { color: 'rgba(99,110,123,0.1)' } },
      y: { ticks: { color: 'rgba(230,237,243,0.4)' }, grid: { color: 'rgba(99,110,123,0.1)' }, beginAtZero: true },
    },
  };

  const stats = [
    { icon: '👥', label: 'Total Users', value: data?.totalUsers ?? '—' },
    { icon: '🟢', label: 'Active (24h)', value: data?.activeUsers24h ?? '—' },
    { icon: '🆕', label: 'New This Week', value: data?.newUsers7d ?? '—' },
    { icon: '💬', label: 'Total Messages', value: data?.totalMessages?.toLocaleString() ?? '—' },
    { icon: '📨', label: 'Messages (24h)', value: data?.messages24h ?? '—' },
    { icon: '🚩', label: 'Pending Reports', value: data?.pendingReports ?? '—' },
  ];

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">System overview and real-time metrics</p>
      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{loading ? '...' : s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="chart-container">
        <div className="chart-title">📈 Messages Sent — Last 7 Days</div>
        {!loading && <Line data={chartData} options={chartOptions} />}
        {loading && <div className="empty-state"><p>Loading chart...</p></div>}
      </div>
    </>
  );
}
