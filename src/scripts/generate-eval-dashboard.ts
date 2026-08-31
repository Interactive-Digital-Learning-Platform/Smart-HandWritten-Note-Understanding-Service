import fs from "fs";
import path from "path";
import { exec } from "child_process";

// ═══════════════════════════════════════════════════════════════════════════
// Research Evaluation Visual HTML Dashboard Generator (Clean Light Theme)
// ═══════════════════════════════════════════════════════════════════════════
//
// Reads data/benchmarks/benchmark_results.json and ground_truth.json to generate
// a publication-quality light theme HTML dashboard with SVG icons, clean
// typography, Chart.js visualizations, and no emojis.
// ═══════════════════════════════════════════════════════════════════════════

const resultsPath = path.resolve(__dirname, "../../data/benchmarks/benchmark_results.json");
const groundTruthPath = path.resolve(__dirname, "../../data/benchmarks/ground_truth.json");
const outputHtmlPath = path.resolve(__dirname, "../../data/benchmarks/evaluation_dashboard.html");

// ─── Inline SVG Icons ───────────────────────────────────────────────────────
const ICONS = {
  chart: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
  checkCircle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
  shieldCheck: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>`,
  alertTriangle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  xCircle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  fileText: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
  layers: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`,
  trendingUp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`,
  cpu: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
};

export const generateDashboard = () => {
  if (!fs.existsSync(resultsPath)) {
    console.error(`Benchmark results file not found at: ${resultsPath}. Please run "npm run eval:benchmarks" first.`);
    return;
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
  const { keyword, semantic, hybrid } = results.aggregates;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Evaluation Dashboard - Smart Handwritten Note Understanding Service</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-body: #f8fafc;
      --bg-card: #ffffff;
      --border-subtle: #e2e8f0;
      --border-focus: #cbd5e1;
      
      --color-primary: #3b82f6;
      --color-primary-dark: #1d4ed8;
      --color-primary-light: #eff6ff;
      
      --color-success: #10b981;
      --color-success-light: #ecfdf5;
      --color-success-dark: #047857;
      
      --color-warning: #f59e0b;
      --color-warning-light: #fffbeb;
      --color-warning-dark: #b45309;
      
      --color-danger: #ef4444;
      --color-danger-light: #fef2f2;
      --color-danger-dark: #b91c1c;

      --color-indigo: #6366f1;
      --color-indigo-light: #eef2ff;
      
      --text-heading: #0f172a;
      --text-body: #334155;
      --text-secondary: #64748b;
      --text-muted: #94a3b8;
      
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.06), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-body);
      color: var(--text-body);
      min-height: 100vh;
      padding: 2.5rem 2rem;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
    }

    /* Top Navigation Bar */
    .top-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1.75rem;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .system-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      width: fit-content;
      background-color: var(--color-primary-light);
      color: var(--color-primary-dark);
      border: 1px solid #bfdbfe;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    h1 {
      font-size: 1.85rem;
      font-weight: 800;
      color: var(--text-heading);
      letter-spacing: -0.025em;
    }

    .subtitle {
      font-size: 0.95rem;
      color: var(--text-secondary);
    }

    .timestamp-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: var(--text-secondary);
      background: #ffffff;
      padding: 0.5rem 0.85rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
      box-shadow: var(--shadow-sm);
    }

    /* Metric Summary Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .metric-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 1.4rem 1.5rem;
      box-shadow: var(--shadow-sm);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .metric-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: var(--color-primary);
    }

    .metric-card.success::before { background: var(--color-success); }
    .metric-card.indigo::before { background: var(--color-indigo); }
    .metric-card.warning::before { background: var(--color-warning); }

    .metric-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .metric-label {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .metric-icon-box {
      color: var(--text-muted);
      display: flex;
      align-items: center;
    }

    .metric-value {
      font-size: 2.25rem;
      font-weight: 800;
      color: var(--text-heading);
      letter-spacing: -0.03em;
      line-height: 1.1;
      margin-bottom: 0.4rem;
    }

    .metric-subtext {
      font-size: 0.8rem;
      color: var(--color-success-dark);
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    /* Main Chart and Matrix Layout */
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 992px) {
      .dashboard-grid { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 1.5rem;
      box-shadow: var(--shadow-sm);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .card-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text-heading);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .matrix-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .matrix-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 1rem;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      border: 1px solid transparent;
    }

    .matrix-item.tp {
      background: var(--color-success-light);
      border-color: #a7f3d0;
      color: var(--color-success-dark);
    }

    .matrix-item.tn {
      background: var(--color-primary-light);
      border-color: #bfdbfe;
      color: var(--color-primary-dark);
    }

    .matrix-item.fp {
      background: var(--color-warning-light);
      border-color: #fde68a;
      color: var(--color-warning-dark);
    }

    .matrix-item.fn {
      background: var(--color-danger-light);
      border-color: #fecaca;
      color: var(--color-danger-dark);
    }

    .matrix-item-left {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-weight: 600;
    }

    .matrix-count {
      font-size: 1.15rem;
      font-weight: 800;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Comparison Table */
    .table-container {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.875rem;
    }

    th {
      background: #f1f5f9;
      padding: 0.85rem 1rem;
      color: var(--text-secondary);
      font-weight: 700;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border-subtle);
    }

    td {
      padding: 1rem;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-body);
    }

    tr:last-child td { border-bottom: none; }

    tr.proposed-row {
      background: #f8faff;
      font-weight: 600;
    }

    tr.proposed-row td:first-child {
      border-left: 3px solid var(--color-primary);
      color: var(--color-primary-dark);
    }

    .score-badge {
      display: inline-block;
      padding: 0.25rem 0.6rem;
      border-radius: var(--radius-sm);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.825rem;
      font-weight: 600;
    }

    .score-badge.lead {
      background: var(--color-primary-light);
      color: var(--color-primary-dark);
      border: 1px solid #bfdbfe;
    }

    .score-badge.standard {
      background: #f1f5f9;
      color: var(--text-secondary);
      border: 1px solid var(--border-subtle);
    }

    /* Diagnostic Note Cards */
    .diagnostic-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.85rem;
    }

    .diagnostic-card {
      background: #ffffff;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 1rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background 0.15s ease;
    }

    .diagnostic-card:hover {
      background: #f8fafc;
    }

    .diagnostic-left {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .diagnostic-title {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-heading);
    }

    .diagnostic-meta {
      font-size: 0.8rem;
      color: var(--text-secondary);
      display: flex;
      gap: 1rem;
    }

    .diagnostic-right {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
    }

    .conf-chip {
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
    }

    .conf-chip.tp { background: var(--color-success-light); color: var(--color-success-dark); }
    .conf-chip.tn { background: var(--color-primary-light); color: var(--color-primary-dark); }
    .conf-chip.fp { background: var(--color-warning-light); color: var(--color-warning-dark); }
    .conf-chip.fn { background: var(--color-danger-light); color: var(--color-danger-dark); }

    /* Code Box */
    .code-wrapper {
      background: #0f172a;
      border-radius: var(--radius-md);
      padding: 1.25rem;
      overflow-x: auto;
    }

    pre {
      color: #e2e8f0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.825rem;
      line-height: 1.6;
    }
  </style>
</head>
<body>

  <div class="container">

    <!-- Header -->
    <header class="top-header">
      <div class="header-left">
        <div class="system-badge">
          ${ICONS.cpu}
          <span>Evaluation Benchmark Suite</span>
        </div>
        <h1>Model Performance & Baseline Evaluation</h1>
        <p class="subtitle">Empirical evaluation of the curriculum-grounded note analysis framework against standard baselines.</p>
      </div>
      <div class="timestamp-badge">
        ${ICONS.fileText}
        <span>Evaluated: ${new Date(results.evaluatedAt).toLocaleDateString()} ${new Date(results.evaluatedAt).toLocaleTimeString()}</span>
      </div>
    </header>

    <!-- Top Key Metrics Cards -->
    <section class="metrics-grid">
      <div class="metric-card success">
        <div class="metric-header">
          <span class="metric-label">Proposed Pipeline F1-Score</span>
          <span class="metric-icon-box">${ICONS.trendingUp}</span>
        </div>
        <div class="metric-value">${hybrid.f1.toFixed(1)}%</div>
        <div class="metric-subtext">
          <span>+${(hybrid.f1 - keyword.f1).toFixed(1)}% vs. Keyword Baseline</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">Precision Rate</span>
          <span class="metric-icon-box">${ICONS.shieldCheck}</span>
        </div>
        <div class="metric-value">${hybrid.precision.toFixed(1)}%</div>
        <div class="metric-subtext" style="color: var(--text-secondary);">
          <span>Hallucination-resistant verification</span>
        </div>
      </div>

      <div class="metric-card indigo">
        <div class="metric-header">
          <span class="metric-label">Weighted Gap Accuracy</span>
          <span class="metric-icon-box">${ICONS.layers}</span>
        </div>
        <div class="metric-value">${hybrid.weightedGapAccuracy.toFixed(1)}%</div>
        <div class="metric-subtext" style="color: var(--text-secondary);">
          <span>Prioritizes syllabus-critical concepts</span>
        </div>
      </div>

      <div class="metric-card warning">
        <div class="metric-header">
          <span class="metric-label">Overall Accuracy</span>
          <span class="metric-icon-box">${ICONS.checkCircle}</span>
        </div>
        <div class="metric-value">${hybrid.accuracy.toFixed(1)}%</div>
        <div class="metric-subtext" style="color: var(--text-secondary);">
          <span>Evaluated across ${results.totalNotes} syllabus note units</span>
        </div>
      </div>
    </section>

    <!-- Chart and Confusion Matrix -->
    <section class="dashboard-grid">
      <!-- Comparative Performance Bar Chart -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            ${ICONS.chart}
            <span>Comparative Performance across Baselines</span>
          </h2>
        </div>
        <div style="position: relative; height: 260px;">
          <canvas id="comparisonChart"></canvas>
        </div>
      </div>

      <!-- Confusion Matrix Breakdown -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            ${ICONS.layers}
            <span>Confusion Matrix (Proposed Hybrid)</span>
          </h2>
        </div>
        <div class="matrix-list">
          <div class="matrix-item tp">
            <div class="matrix-item-left">
              ${ICONS.checkCircle}
              <span>True Positives (Concepts Correctly Found)</span>
            </div>
            <span class="matrix-count">${hybrid.confusion.tp}</span>
          </div>

          <div class="matrix-item tn">
            <div class="matrix-item-left">
              ${ICONS.shieldCheck}
              <span>True Negatives (Gaps Correctly Identified)</span>
            </div>
            <span class="matrix-count">${hybrid.confusion.tn}</span>
          </div>

          <div class="matrix-item fp">
            <div class="matrix-item-left">
              ${ICONS.alertTriangle}
              <span>False Positives (Hallucinations)</span>
            </div>
            <span class="matrix-count">${hybrid.confusion.fp}</span>
          </div>

          <div class="matrix-item fn">
            <div class="matrix-item-left">
              ${ICONS.xCircle}
              <span>False Negatives (Missed Concepts)</span>
            </div>
            <span class="matrix-count">${hybrid.confusion.fn}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Comparative Table -->
    <section class="card" style="margin-bottom: 2rem;">
      <div class="card-header">
        <h2 class="card-title">
          ${ICONS.fileText}
          <span>Architectural Comparison Table</span>
        </h2>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Architecture / Pipeline Method</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>F1-Score</th>
              <th>Overall Accuracy</th>
              <th>Weighted Gap Accuracy</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${keyword.methodName}</strong></td>
              <td><span class="score-badge standard">${keyword.precision.toFixed(1)}%</span></td>
              <td><span class="score-badge standard">${keyword.recall.toFixed(1)}%</span></td>
              <td><span class="score-badge standard">${keyword.f1.toFixed(1)}%</span></td>
              <td><span class="score-badge standard">${keyword.accuracy.toFixed(1)}%</span></td>
              <td><span class="score-badge standard">${keyword.weightedGapAccuracy.toFixed(1)}%</span></td>
            </tr>
            <tr>
              <td><strong>${semantic.methodName}</strong></td>
              <td><span class="score-badge standard">${semantic.precision.toFixed(1)}%</span></td>
              <td><span class="score-badge standard">${semantic.recall.toFixed(1)}%</span></td>
              <td><span class="score-badge standard">${semantic.f1.toFixed(1)}%</span></td>
              <td><span class="score-badge standard">${semantic.accuracy.toFixed(1)}%</span></td>
              <td><span class="score-badge standard">${semantic.weightedGapAccuracy.toFixed(1)}%</span></td>
            </tr>
            <tr class="proposed-row">
              <td><strong>${hybrid.methodName} (Ours)</strong></td>
              <td><span class="score-badge lead">${hybrid.precision.toFixed(1)}%</span></td>
              <td><span class="score-badge lead">${hybrid.recall.toFixed(1)}%</span></td>
              <td><span class="score-badge lead">${hybrid.f1.toFixed(1)}%</span></td>
              <td><span class="score-badge lead">${hybrid.accuracy.toFixed(1)}%</span></td>
              <td><span class="score-badge lead">${hybrid.weightedGapAccuracy.toFixed(1)}%</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Per-Note Diagnostic Reports -->
    <section class="card" style="margin-bottom: 2rem;">
      <div class="card-header">
        <h2 class="card-title">
          ${ICONS.cpu}
          <span>Per-Note Diagnostic Reports</span>
        </h2>
      </div>
      <div class="diagnostic-grid">
        ${results.noteReports.map((r: any) => `
          <div class="diagnostic-card">
            <div class="diagnostic-left">
              <span class="diagnostic-title">${r.noteTitle}</span>
              <div class="diagnostic-meta">
                <span>Keyword F1: <strong>${r.keyword.f1.toFixed(1)}%</strong></span>
                <span>Semantic F1: <strong>${r.semantic.f1.toFixed(1)}%</strong></span>
                <span style="color: var(--color-primary-dark); font-weight: 600;">Proposed Hybrid F1: <strong>${r.hybrid.f1.toFixed(1)}%</strong> (Weighted: ${r.hybrid.weightedGapAccuracy.toFixed(1)}%)</span>
              </div>
            </div>
            <div class="diagnostic-right">
              <span class="conf-chip tp">TP: ${r.hybrid.confusion.tp}</span>
              <span class="conf-chip tn">TN: ${r.hybrid.confusion.tn}</span>
              <span class="conf-chip fp">FP: ${r.hybrid.confusion.fp}</span>
              <span class="conf-chip fn">FN: ${r.hybrid.confusion.fn}</span>
            </div>
          </div>
        `).join("")}
      </div>
    </section>

    <!-- LaTeX Table Box -->
    <section class="card">
      <div class="card-header">
        <h2 class="card-title">
          ${ICONS.fileText}
          <span>LaTeX Output for Academic Documentation</span>
        </h2>
      </div>
      <div class="code-wrapper">
        <pre><code>${results.latexTable.trim()}</code></pre>
      </div>
    </section>

  </div>

  <script>
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Precision', 'Recall', 'F1-Score', 'Accuracy', 'Weighted Acc'],
        datasets: [
          {
            label: 'Keyword Baseline',
            data: [${keyword.precision}, ${keyword.recall}, ${keyword.f1}, ${keyword.accuracy}, ${keyword.weightedGapAccuracy}],
            backgroundColor: '#94a3b8',
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.8
          },
          {
            label: 'Semantic Baseline',
            data: [${semantic.precision}, ${semantic.recall}, ${semantic.f1}, ${semantic.accuracy}, ${semantic.weightedGapAccuracy}],
            backgroundColor: '#f59e0b',
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.8
          },
          {
            label: 'Proposed Hybrid Pipeline',
            data: [${hybrid.precision}, ${hybrid.recall}, ${hybrid.f1}, ${hybrid.accuracy}, ${hybrid.weightedGapAccuracy}],
            backgroundColor: '#3b82f6',
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              padding: 16,
              color: '#334155',
              font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' }
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleFont: { family: 'Plus Jakarta Sans', size: 12 },
            bodyFont: { family: 'JetBrains Mono', size: 12 },
            padding: 10,
            cornerRadius: 6
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: '#f1f5f9' },
            ticks: {
              callback: value => value + '%',
              color: '#64748b',
              font: { family: 'JetBrains Mono', size: 11 }
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: '#334155',
              font: { family: 'Plus Jakarta Sans', size: 12, weight: '500' }
            }
          }
        }
      }
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(outputHtmlPath, html);
  console.log(`Interactive Light Theme Dashboard generated: ${outputHtmlPath}`);

  // Automatically launch browser on Windows
  exec(`start "" "${outputHtmlPath}"`);
};

if (require.main === module) {
  generateDashboard();
}
