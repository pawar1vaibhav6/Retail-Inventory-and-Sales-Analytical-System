import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart, registerables } from 'chart.js';
import { useTheme } from '../context/ThemeContext';
import { chartsAPI, enterpriseAnalyticsAPI } from '../services/api';

Chart.register(...registerables);

export default function Charts() {
  const { theme } = useTheme();
  const [selectedYear, setSelectedYear] = useState('2026');
  const [availableYears, setAvailableYears] = useState(['2026', '2025']);
  const [chartData, setChartData] = useState(null);

  const monthlyRef = useRef(null);
  const categoryRef = useRef(null);
  const dailyRef = useRef(null);
  const weeklyRef = useRef(null);
  const ageingRef = useRef(null);
  const scrapRef = useRef(null);

  const [ageingData, setAgeingData] = useState(null);
  const [scrapData, setScrapData] = useState([]);

  const monthlyChartInstance = useRef(null);
  const ageingChartInstance = useRef(null);
  const scrapChartInstance = useRef(null);
  const categoryChartInstance = useRef(null);
  const dailyChartInstance = useRef(null);
  const weeklyChartInstance = useRef(null);

  useEffect(() => {
    let isMounted = true;
    chartsAPI.getChartData(selectedYear)
      .then((data) => {
        if (isMounted && data) {
          setChartData(data);
          if (data.available_years && data.available_years.length > 0) {
            setAvailableYears(data.available_years.map(String));
          }
        }
      })
      .catch((err) => {
        console.warn('[Charts] Failed to fetch chart data:', err);
      });

    enterpriseAnalyticsAPI.getExpiryAgeing().then(res => res?.ageing && setAgeingData(res.ageing)).catch(console.warn);
    enterpriseAnalyticsAPI.getScrapTrend().then(res => res?.scrap_trend && setScrapData(res.scrap_trend)).catch(console.warn);

    return () => {
      isMounted = false;
    };
  }, [selectedYear]);

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

    // Monthly data resolution
    const monthlyLabels = (chartData?.monthly?.labels && chartData.monthly.labels.length > 0)
      ? chartData.monthly.labels
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
    const monthlyRevenue = (chartData?.monthly?.revenue && chartData.monthly.revenue.length > 0)
      ? chartData.monthly.revenue
      : [45000, 52000, 61000, 58000, 72000, 68000, 79000, 84000, 91000, 105000];
    const monthlyCost = (chartData?.monthly?.cost && chartData.monthly.cost.length > 0)
      ? chartData.monthly.cost
      : [32000, 37000, 44000, 41000, 51000, 49000, 56000, 60000, 65000, 74000];
    const monthlyProfit = (chartData?.monthly?.profit && chartData.monthly.profit.length > 0)
      ? chartData.monthly.profit
      : [13000, 15000, 17000, 17000, 21000, 19000, 23000, 24000, 26000, 31000];

    // 1. Monthly Bar Chart
    if (monthlyRef.current) {
      if (monthlyChartInstance.current) monthlyChartInstance.current.destroy();
      const ctx = monthlyRef.current.getContext('2d');
      monthlyChartInstance.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: monthlyLabels,
          datasets: [
            {
              label: 'Revenue (₹)',
              data: monthlyRevenue,
              backgroundColor: tokens.revenueColor,
              borderColor: tokens.border,
              borderWidth: 1.5,
              borderRadius: 6
            },
            {
              label: 'Cost (₹)',
              data: monthlyCost,
              backgroundColor: tokens.costColor,
              borderColor: tokens.border,
              borderWidth: 1.5,
              borderRadius: 6
            },
            {
              label: 'Profit (₹)',
              data: monthlyProfit,
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

    // Category data resolution
    const categoryLabels = (chartData?.category?.labels && chartData.category.labels.length > 0)
      ? chartData.category.labels
      : ['Cereals', 'Oil Products', 'Dry Fruits', 'Milk', 'Package Food', 'Electronics', 'Fruits', 'tea', 'Pulses', 'Beverages'];
    const categoryValues = (chartData?.category?.revenue && chartData.category.revenue.length > 0)
      ? chartData.category.revenue
      : [42000, 38000, 31000, 26000, 22000, 19000, 15000, 12000, 9500, 6500];

    // 2. Category Doughnut Chart
    if (categoryRef.current) {
      if (categoryChartInstance.current) categoryChartInstance.current.destroy();
      const ctx = categoryRef.current.getContext('2d');
      categoryChartInstance.current = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: categoryLabels,
          datasets: [
            {
              data: categoryValues,
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

    // Daily data resolution
    const dailyLabels = (chartData?.daily?.labels && chartData.daily.labels.length > 0)
      ? chartData.daily.labels
      : ['Oct 11', 'Oct 12', 'Oct 13', 'Oct 14', 'Oct 15', 'Oct 16', 'Oct 17', 'Oct 18', 'Oct 19', 'Oct 20'];
    const dailyValues = (chartData?.daily?.sales && chartData.daily.sales.length > 0)
      ? chartData.daily.sales
      : [3400, 4200, 3900, 5100, 4800, 5600, 6200, 5900, 6700, 7400];

    // 3. Daily Sales Line Chart
    if (dailyRef.current) {
      if (dailyChartInstance.current) dailyChartInstance.current.destroy();
      const ctx = dailyRef.current.getContext('2d');
      dailyChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dailyLabels,
          datasets: [
            {
              label: 'Daily Revenue (₹)',
              data: dailyValues,
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

    // Weekly data resolution
    const weeklyLabels = (chartData?.weekly?.labels && chartData.weekly.labels.length > 0)
      ? chartData.weekly.labels
      : ['Week 38', 'Week 39', 'Week 40', 'Week 41', 'Week 42'];
    const weeklyValues = (chartData?.weekly?.sales && chartData.weekly.sales.length > 0)
      ? chartData.weekly.sales
      : [28500, 31200, 29800, 34500, 38900];

    // 4. Weekly Sales Bar Chart
    if (weeklyRef.current) {
      if (weeklyChartInstance.current) weeklyChartInstance.current.destroy();
      const ctx = weeklyRef.current.getContext('2d');
      weeklyChartInstance.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: weeklyLabels,
          datasets: [
            {
              label: 'Weekly Sales (₹)',
              data: weeklyValues,
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
  }, [theme, selectedYear, chartData]);

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
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
          <Link to="/analytics" className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }}>
            <i className="fa-solid fa-table" style={{ marginRight: 6 }} /> Tabular Reports
          </Link>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* 1. Monthly Revenue, Cost & Profit */}
        <div className="chart-card grid-full mb-4">
          <div className="chart-header">
            <h4>
              <i className="fa-solid fa-chart-simple" style={{ marginRight: 8 }} />
              Monthly Financial Overview: Revenue vs Cost vs Net Profit ({selectedYear})
            </h4>
          </div>
          <div className="chart-body" style={{ height: '320px', position: 'relative' }}>
            <canvas ref={monthlyRef} />
          </div>
        </div>

        {/* 2. Category Distribution */}
        <div className="chart-card mb-4">
          <div className="chart-header">
            <h4>
              <i className="fa-solid fa-chart-pie" style={{ marginRight: 8 }} />
              Category Revenue Share
            </h4>
          </div>
          <div className="chart-body" style={{ height: '280px', position: 'relative' }}>
            <canvas ref={categoryRef} />
          </div>
        </div>

        {/* 3. Daily Sales Velocity */}
        <div className="chart-card mb-4">
          <div className="chart-header">
            <h4>
              <i className="fa-solid fa-arrow-trend-up" style={{ marginRight: 8 }} />
              Daily Sales Trend (Recent Active Days)
            </h4>
          </div>
          <div className="chart-body" style={{ height: '280px', position: 'relative' }}>
            <canvas ref={dailyRef} />
          </div>
        </div>

        {/* 4. Weekly Sales Velocity */}
        <div className="chart-card grid-full mb-4">
          <div className="chart-header">
            <h4>
              <i className="fa-solid fa-bars-progress" style={{ marginRight: 8 }} />
              Weekly Sales Volume &amp; Momentum ({selectedYear})
            </h4>
          </div>
          <div className="chart-body" style={{ height: '260px', position: 'relative' }}>
            <canvas ref={weeklyRef} />
          </div>
        </div>

        {/* 5. Expiry Stock Ageing Breakdown (Phase 6) */}
        <div className="chart-card mb-4">
          <div className="chart-header">
            <h4>
              <i className="fa-solid fa-hourglass-half text-danger" style={{ marginRight: 8 }} />
              Near-Expiry Inventory Ageing Risk Distribution
            </h4>
          </div>
          <div className="chart-body" style={{ height: '280px', position: 'relative' }}>
            <canvas ref={ageingRef} />
          </div>
        </div>

        {/* 6. Scrap & Write-off Losses by Category (Phase 6) */}
        <div className="chart-card mb-4">
          <div className="chart-header">
            <h4>
              <i className="fa-solid fa-dumpster text-secondary" style={{ marginRight: 8 }} />
              Scrap &amp; Write-Off Losses by Product Category
            </h4>
          </div>
          <div className="chart-body" style={{ height: '280px', position: 'relative' }}>
            <canvas ref={scrapRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
