import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart, registerables } from 'chart.js';
import { useTheme } from '../context/ThemeContext';

Chart.register(...registerables);

export default function Charts() {
  const { theme } = useTheme();
  const [selectedYear, setSelectedYear] = useState('2026');

  const monthlyRef = useRef(null);
  const categoryRef = useRef(null);
  const dailyRef = useRef(null);
  const weeklyRef = useRef(null);

  const monthlyChartInstance = useRef(null);
  const categoryChartInstance = useRef(null);
  const dailyChartInstance = useRef(null);
  const weeklyChartInstance = useRef(null);

  function getThemeTokens() {
    const style = getComputedStyle(document.documentElement);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || theme === 'dark';

    const ember1 = style.getPropertyValue('--ember-1').trim() || '#03071e';
    const ember2 = style.getPropertyValue('--ember-2').trim() || '#370617';
    const ember3 = style.getPropertyValue('--ember-3').trim() || '#6a040f';
    const ember4 = style.getPropertyValue('--ember-4').trim() || '#9d0208';
    const ember5 = style.getPropertyValue('--ember-5').trim() || '#d00000';
    const ember6 = style.getPropertyValue('--ember-6').trim() || '#dc2f02';
    const ember7 = style.getPropertyValue('--ember-7').trim() || '#e85d04';
    const ember8 = style.getPropertyValue('--ember-8').trim() || '#f48c06';
    const ember9 = style.getPropertyValue('--ember-9').trim() || '#faa307';
    const ember10 = style.getPropertyValue('--ember-10').trim() || '#ffba08';

    const lightCategoryPalette = [
      ember5, ember8, ember3, ember10, ember6, ember2, ember7, ember4, ember9, ember1
    ];

    const darkCategoryPalette = [
      ember10, ember8, ember6, ember9, ember5, ember7, ember4, '#fca5a5', '#fdba74', ember3
    ];

    return {
      isDark,
      text: isDark ? '#f1f5f9' : ember1,
      textMuted: isDark ? '#94a3b8' : ember3,
      border: isDark ? '#232d3d' : 'rgba(55, 6, 23, 0.14)',
      surface: isDark ? '#141a23' : '#ffffff',
      accent: isDark ? ember8 : ember5,
      categoryPalette: isDark ? darkCategoryPalette : lightCategoryPalette,
      categoryBorder: isDark ? '#141a23' : '#ffffff',
      revenueColor: isDark ? ember8 : ember6,
      costColor: isDark ? '#ef4444' : ember3,
      profitColor: ember10,
      lineColor: isDark ? ember10 : ember5,
      lineFill: isDark ? 'rgba(255, 186, 8, 0.18)' : 'rgba(220, 47, 2, 0.18)',
      weeklyColor: isDark ? ember8 : ember6
    };
  }

  useEffect(() => {
    const tokens = getThemeTokens();
    Chart.defaults.color = tokens.textMuted;
    Chart.defaults.borderColor = tokens.border;

    // 1. Monthly Bar Chart
    if (monthlyRef.current) {
      if (monthlyChartInstance.current) monthlyChartInstance.current.destroy();
      const ctx = monthlyRef.current.getContext('2d');
      monthlyChartInstance.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
          datasets: [
            {
              label: 'Revenue (₹)',
              data: [45000, 52000, 61000, 58000, 72000, 68000, 79000, 84000, 91000, 105000],
              backgroundColor: tokens.revenueColor,
              borderColor: tokens.border,
              borderWidth: 1.5,
              borderRadius: 6
            },
            {
              label: 'Cost (₹)',
              data: [32000, 37000, 44000, 41000, 51000, 49000, 56000, 60000, 65000, 74000],
              backgroundColor: tokens.costColor,
              borderColor: tokens.border,
              borderWidth: 1.5,
              borderRadius: 6
            },
            {
              label: 'Profit (₹)',
              data: [13000, 15000, 17000, 17000, 21000, 19000, 23000, 24000, 26000, 31000],
              backgroundColor: tokens.profitColor,
              borderColor: tokens.border,
              borderWidth: 1.5,
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: tokens.text } }
          },
          scales: {
            x: { ticks: { color: tokens.textMuted }, grid: { color: tokens.border } },
            y: { beginAtZero: true, ticks: { color: tokens.textMuted }, grid: { color: tokens.border } }
          }
        }
      });
    }

    // 2. Category Doughnut Chart
    if (categoryRef.current) {
      if (categoryChartInstance.current) categoryChartInstance.current.destroy();
      const ctx = categoryRef.current.getContext('2d');
      categoryChartInstance.current = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Cereals', 'Oil Products', 'Dry Fruits', 'Milk', 'Package Food', 'Electronics', 'Fruits', 'tea', 'Pulses', 'Beverages'],
          datasets: [
            {
              data: [42000, 38000, 31000, 26000, 22000, 19000, 15000, 12000, 9500, 6500],
              backgroundColor: tokens.categoryPalette,
              borderWidth: 2,
              borderColor: tokens.categoryBorder
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: tokens.text } }
          }
        }
      });
    }

    // 3. Daily Sales Line Chart
    if (dailyRef.current) {
      if (dailyChartInstance.current) dailyChartInstance.current.destroy();
      const ctx = dailyRef.current.getContext('2d');
      dailyChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Oct 11', 'Oct 12', 'Oct 13', 'Oct 14', 'Oct 15', 'Oct 16', 'Oct 17', 'Oct 18', 'Oct 19', 'Oct 20'],
          datasets: [
            {
              label: 'Daily Revenue (₹)',
              data: [3400, 4200, 3900, 5100, 4800, 5600, 6200, 5900, 6700, 7400],
              borderColor: tokens.lineColor,
              backgroundColor: tokens.lineFill,
              fill: true,
              tension: 0.35,
              borderWidth: 2.5,
              pointBackgroundColor: tokens.lineColor,
              pointRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { ticks: { color: tokens.textMuted }, grid: { color: tokens.border } },
            y: { beginAtZero: true, ticks: { color: tokens.textMuted }, grid: { color: tokens.border } }
          }
        }
      });
    }

    // 4. Weekly Sales Bar Chart
    if (weeklyRef.current) {
      if (weeklyChartInstance.current) weeklyChartInstance.current.destroy();
      const ctx = weeklyRef.current.getContext('2d');
      weeklyChartInstance.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Week 38', 'Week 39', 'Week 40', 'Week 41', 'Week 42'],
          datasets: [
            {
              label: 'Weekly Sales (₹)',
              data: [28500, 31200, 29800, 34500, 38900],
              backgroundColor: tokens.weeklyColor,
              borderColor: tokens.border,
              borderWidth: 1.5,
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { ticks: { color: tokens.textMuted }, grid: { color: tokens.border } },
            y: { beginAtZero: true, ticks: { color: tokens.textMuted }, grid: { color: tokens.border } }
          }
        }
      });
    }

    return () => {
      if (monthlyChartInstance.current) monthlyChartInstance.current.destroy();
      if (categoryChartInstance.current) categoryChartInstance.current.destroy();
      if (dailyChartInstance.current) dailyChartInstance.current.destroy();
      if (weeklyChartInstance.current) weeklyChartInstance.current.destroy();
    };
  }, [theme, selectedYear]);

  return (
    <div className="charts-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4">
        <div>
          <h2>
            <i className="fa-solid fa-chart-column" style={{ marginRight: 8 }} />
            Interactive Visual Analytics
          </h2>
          <p className="subtitle">
            Live responsive charts powered by Chart.js: trends, category distributions, and profitability curves.
          </p>
        </div>
        <div className="header-actions">
          <div className="year-filter-form" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="chartYearSelect" className="year-label">
              <i className="fa-regular fa-calendar" style={{ marginRight: 4 }} /> Select Year:
            </label>
            <select
              id="chartYearSelect"
              className="form-control form-control-sm"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
          </div>
          <Link to="/analytics" className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }}>
            <i className="fa-solid fa-table" style={{ marginRight: 6 }} /> Tabular Reports
          </Link>
        </div>
      </div>

      {/* Charts Grid (2x2) */}
      <div className="charts-grid">
        {/* 1. Monthly Revenue & Profit */}
        <div className="chart-card">
          <div className="chart-header">
            <h4>
              <i className="fa-solid fa-chart-bar" style={{ marginRight: 6 }} />
              Monthly Revenue, Cost &amp; Profit
            </h4>
            <span className="badge badge-primary">Bar Chart</span>
          </div>
          <div className="chart-body" style={{ height: 320 }}>
            <canvas ref={monthlyRef} />
          </div>
        </div>

        {/* 2. Category Distribution */}
        <div className="chart-card">
          <div className="chart-header">
            <h4>
              <i className="fa-solid fa-chart-pie" style={{ marginRight: 6 }} />
              Revenue by Category
            </h4>
            <span className="badge badge-success">Doughnut</span>
          </div>
          <div className="chart-body" style={{ height: 320 }}>
            <canvas ref={categoryRef} />
          </div>
        </div>

        {/* 3. Daily Sales Trend */}
        <div className="chart-card">
          <div className="chart-header">
            <h4>
              <i className="fa-solid fa-chart-line" style={{ marginRight: 6 }} />
              Daily Sales Trend (Recent 10 Days)
            </h4>
            <span className="badge badge-info">Line Trend</span>
          </div>
          <div className="chart-body" style={{ height: 320 }}>
            <canvas ref={dailyRef} />
          </div>
        </div>

        {/* 4. Weekly Sales Comparison */}
        <div className="chart-card">
          <div className="chart-header">
            <h4>
              <i className="fa-solid fa-calendar-week" style={{ marginRight: 6 }} />
              Weekly Sales Volume
            </h4>
            <span className="badge badge-warning">Weekly</span>
          </div>
          <div className="chart-body" style={{ height: 320 }}>
            <canvas ref={weeklyRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
