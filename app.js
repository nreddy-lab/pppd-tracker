/* ═══════════════════════════════════════════
   PPPD Tracker — app.js
   All logic: storage, navigation, log form,
   history, insights, charts, export.
   Vanilla JS, no dependencies.
   ═══════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const STORAGE_KEY = 'pppd_logs';

const TRIGGER_LABELS = {
  screens:  '📱 Screens',
  movement: '🔄 Movement',
  crowds:   '👥 Crowds',
  fatigue:  '😴 Fatigue',
  stress:   '😰 Stress',
  noise:    '🔊 Noise',
  light:    '💡 Bright Light',
  other:    '➕ Other',
};

const VIEW_TITLES = {
  log:      'Daily Log',
  history:  'History',
  insights: 'Insights',
  export:   'Export',
};

// ─────────────────────────────────────────────
// App State
// ─────────────────────────────────────────────
const state = {
  currentView:      'log',
  calMonth:         new Date().getMonth(),
  calYear:          new Date().getFullYear(),
  chartDays:        14,
  sleepQuality:     3,
  selectedTriggers: new Set(),
};

// ─────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────
function getLogs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLogs(logs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

function getLog(iso) {
  return getLogs().find(l => l.date === iso) || null;
}

function upsertLog(entry) {
  const logs = getLogs();
  const idx  = logs.findIndex(l => l.date === entry.date);
  if (idx >= 0) logs[idx] = entry;
  else          logs.push(entry);
  logs.sort((a, b) => a.date.localeCompare(b.date));
  saveLogs(logs);
}

function getLogsInRange(days) {
  const all = getLogs();
  if (days === 0) return all;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = localISO(cutoff);
  return all.filter(l => l.date >= cutoffISO);
}

function getThisMonthLogs() {
  const now    = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return getLogs().filter(l => l.date.startsWith(prefix));
}

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

/** Date → 'YYYY-MM-DD' in local time */
function localISO(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

function todayISO() {
  return localISO(new Date());
}

/** 'YYYY-MM-DD' → Date (local midnight) */
function isoToDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatLong(d) {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatShort(iso) {
  return isoToDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────
function mean(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function r1(n) { return Math.round(n * 10) / 10; }

function dizClass(val) {
  if (!val) return '';
  if (val <= 3)  return 'diz-low';
  if (val <= 6)  return 'diz-mid';
  if (val <= 9)  return 'diz-high';
  return 'diz-max';
}

function dizColor(val) {
  if (val <= 3)  return '#7cc47c';
  if (val <= 6)  return '#d4c84a';
  if (val <= 9)  return '#e07030';
  return '#c0392b';
}

// ─────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(name) {
  state.currentView = name;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });

  document.getElementById('header-title').textContent = VIEW_TITLES[name] || 'PPPD Tracker';

  // Lazy-render on first visit and re-render on return
  if (name === 'history')  renderHistory();
  if (name === 'insights') renderInsights();
  if (name === 'export')   renderExportStats();
}

// ─────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────
function initHeader() {
  document.getElementById('header-date').textContent = formatLong(new Date());
}

// ─────────────────────────────────────────────
// Daily Log — form
// ─────────────────────────────────────────────
function initLog() {
  // ── Dizziness slider
  const dizSlider = document.getElementById('dizziness-slider');
  const dizBadge  = document.getElementById('dizziness-value');
  dizSlider.addEventListener('input', () => {
    const v = +dizSlider.value;
    dizBadge.textContent       = v;
    dizBadge.style.background  = dizColor(v);
  });
  dizBadge.style.background = dizColor(+dizSlider.value);

  // ── Stress slider
  const stressSlider = document.getElementById('stress-slider');
  const stressBadge  = document.getElementById('stress-value');
  stressSlider.addEventListener('input', () => {
    stressBadge.textContent = stressSlider.value;
  });

  // ── Trigger chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const t = chip.dataset.trigger;
      if (state.selectedTriggers.has(t)) {
        state.selectedTriggers.delete(t);
        chip.classList.remove('selected');
      } else {
        state.selectedTriggers.add(t);
        chip.classList.add('selected');
      }
    });
  });

  // ── Sleep quality stars
  document.querySelectorAll('.star').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sleepQuality = +btn.dataset.value;
      renderStars();
    });
  });
  renderStars();

  // ── Save / Update
  document.getElementById('save-btn').addEventListener('click', saveLog);

  // Pre-fill if today already logged
  prefillToday();
}

function renderStars() {
  document.querySelectorAll('.star').forEach(s => {
    s.classList.toggle('lit', +s.dataset.value <= state.sleepQuality);
  });
}

function prefillToday() {
  const log = getLog(todayISO());
  if (!log) return;

  const dizSlider = document.getElementById('dizziness-slider');
  const dizBadge  = document.getElementById('dizziness-value');
  dizSlider.value            = log.dizziness;
  dizBadge.textContent       = log.dizziness;
  dizBadge.style.background  = dizColor(log.dizziness);

  state.selectedTriggers = new Set(log.triggers || []);
  document.querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('selected', state.selectedTriggers.has(chip.dataset.trigger));
  });

  document.getElementById('sleep-hours').value     = log.sleepHours ?? 7;
  state.sleepQuality                               = log.sleepQuality ?? 3;
  renderStars();

  const stressSlider = document.getElementById('stress-slider');
  stressSlider.value                               = log.stress ?? 5;
  document.getElementById('stress-value').textContent = log.stress ?? 5;

  document.getElementById('notes-input').value = log.notes || '';
  document.getElementById('save-btn').textContent = "Update Today's Log";
  showFeedback("Today's log loaded — you can edit and update it.", false);
}

function saveLog() {
  const entry = {
    date:         todayISO(),
    dizziness:    +document.getElementById('dizziness-slider').value,
    triggers:     [...state.selectedTriggers],
    sleepHours:   +document.getElementById('sleep-hours').value,
    sleepQuality: state.sleepQuality,
    stress:       +document.getElementById('stress-slider').value,
    notes:        document.getElementById('notes-input').value.trim(),
    timestamp:    Date.now(),
  };

  upsertLog(entry);
  document.getElementById('save-btn').textContent = "Update Today's Log";
  showFeedback('✓ Saved!', true);
}

function showFeedback(msg, success) {
  const el = document.getElementById('save-feedback');
  el.textContent  = msg;
  el.style.color  = success ? 'var(--clr-accent)' : 'var(--clr-text-muted)';
  if (success) setTimeout(() => { el.textContent = ''; }, 3000);
}

// ─────────────────────────────────────────────
// History — calendar
// ─────────────────────────────────────────────
function renderHistory() {
  renderCalendar();
  renderWeeklySummary();
  renderTrendChart();
}

function initCalNav() {
  document.getElementById('cal-prev').addEventListener('click', () => {
    state.calMonth--;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    state.calMonth++;
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    renderCalendar();
  });
}

function renderCalendar() {
  const { calYear, calMonth } = state;
  const logMap  = {};
  getLogs().forEach(l => { logMap[l.date] = l; });

  const monthLabel = new Date(calYear, calMonth, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  document.getElementById('cal-month-label').textContent = monthLabel;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // Day-of-week headers (Mon-first)
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(label => {
    const el = document.createElement('div');
    el.className   = 'cal-day-header';
    el.textContent = label;
    grid.appendChild(el);
  });

  // Leading empty cells so day 1 lands on the right column
  const firstDOW   = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const offset     = (firstDOW + 6) % 7;                      // 0=Mon
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today       = todayISO();

  for (let i = 0; i < offset; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const log = logMap[iso];
    const el  = document.createElement('div');

    el.className   = 'cal-day';
    el.textContent = day;
    if (iso === today) el.classList.add('today');

    if (log) {
      el.classList.add('has-log', dizClass(log.dizziness));
      el.title = `Dizziness: ${log.dizziness}${log.triggers?.length ? ' · ' + log.triggers.map(t => TRIGGER_LABELS[t] || t).join(', ') : ''}`;
    } else {
      el.classList.add('no-log');
    }

    grid.appendChild(el);
  }
}

// ─────────────────────────────────────────────
// History — weekly summary
// ─────────────────────────────────────────────
function renderWeeklySummary() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  const logs = getLogs().filter(l => l.date >= localISO(cutoff));
  const el   = document.getElementById('weekly-summary');

  if (!logs.length) {
    el.innerHTML = '<p class="empty-state">No logs in the last 7 days.</p>';
    return;
  }

  const avgDiz    = r1(mean(logs.map(l => l.dizziness)));
  const avgSleep  = r1(mean(logs.map(l => l.sleepHours)));
  const avgStress = r1(mean(logs.map(l => l.stress)));

  const trigCount = {};
  logs.forEach(l => (l.triggers || []).forEach(t => { trigCount[t] = (trigCount[t] || 0) + 1; }));
  const topTrigEntry = Object.entries(trigCount).sort((a, b) => b[1] - a[1])[0];
  const topTrig      = topTrigEntry ? TRIGGER_LABELS[topTrigEntry[0]] || topTrigEntry[0] : '—';

  el.innerHTML = `
    <div class="summary-stat">
      <span class="stat-value">${avgDiz}</span>
      <span class="stat-label">Avg dizziness</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">${avgSleep}h</span>
      <span class="stat-label">Avg sleep</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">${avgStress}</span>
      <span class="stat-label">Avg stress</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">${logs.length}/7</span>
      <span class="stat-label">Days logged</span>
    </div>
    <div class="summary-stat full-width">
      <span class="stat-value" style="font-size:1rem">${topTrig}</span>
      <span class="stat-label">Top trigger this week</span>
    </div>
  `;
}

// ─────────────────────────────────────────────
// History — trend line chart (canvas, no deps)
// ─────────────────────────────────────────────
function renderTrendChart() {
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;

  const ctx  = canvas.getContext('2d');
  const days = state.chartDays;

  // Build ordered date list
  const now   = new Date();
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(localISO(d));
  }

  const logMap = {};
  getLogs().forEach(l => { logMap[l.date] = l; });

  const points = dates.map(iso => ({
    iso,
    val: logMap[iso] ? logMap[iso].dizziness : null,
  }));

  // Canvas sizing (DPR-aware)
  const dpr  = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W    = wrap.clientWidth  || 300;
  const H    = wrap.clientHeight || 180;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const P = { t: 14, r: 14, b: 36, l: 30 };
  const cW = W - P.l - P.r;
  const cH = H - P.t - P.b;
  const n  = points.length;

  const toX = i => P.l + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const toY = v => P.t + cH - ((v - 1) / 9) * cH;

  // ── Gridlines + Y labels
  ctx.strokeStyle = '#dce8eb';
  ctx.lineWidth   = 1;
  ctx.font        = `${10}px -apple-system, sans-serif`;
  ctx.fillStyle   = '#9ab4ba';
  ctx.textAlign   = 'right';

  [2, 4, 6, 8, 10].forEach(v => {
    const y = toY(v);
    ctx.beginPath();
    ctx.moveTo(P.l, y);
    ctx.lineTo(P.l + cW, y);
    ctx.stroke();
    ctx.fillText(v, P.l - 5, y + 4);
  });

  // ── Filled area
  const withVal = points.map((p, i) => ({ ...p, i })).filter(p => p.val !== null);
  if (withVal.length > 1) {
    ctx.beginPath();
    withVal.forEach(({ i, val }, idx) => {
      const x = toX(i), y = toY(val);
      idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(toX(withVal[withVal.length - 1].i), P.t + cH);
    ctx.lineTo(toX(withVal[0].i), P.t + cH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, P.t, 0, P.t + cH);
    grad.addColorStop(0,   'rgba(95,158,168,0.28)');
    grad.addColorStop(1,   'rgba(95,158,168,0.02)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // ── Line
  if (withVal.length > 0) {
    ctx.strokeStyle = '#5f9ea8';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    let started = false;
    points.forEach(({ val }, i) => {
      if (val === null) { started = false; return; }
      const x = toX(i), y = toY(val);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else           ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // ── Dots
  points.forEach(({ val }, i) => {
    if (val === null) return;
    ctx.beginPath();
    ctx.arc(toX(i), toY(val), 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#fff';
    ctx.strokeStyle = '#5f9ea8';
    ctx.lineWidth   = 2;
    ctx.fill();
    ctx.stroke();
  });

  // ── X labels (sparse — ~5 labels max)
  ctx.fillStyle  = '#9ab4ba';
  ctx.textAlign  = 'center';
  const step = Math.max(1, Math.ceil(n / 5));
  points.forEach(({ iso }, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    ctx.fillText(formatShort(iso), toX(i), H - P.b + 18);
  });
}

function initChartRangeButtons() {
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.chartDays = +btn.dataset.days;
      renderTrendChart();
    });
  });
}

// ─────────────────────────────────────────────
// Insights
// ─────────────────────────────────────────────
function renderInsights() {
  renderInsightCards();
  renderTriggerBars();
  renderSleepChart();
}

function renderInsightCards() {
  const container = document.getElementById('insights-list');
  const allLogs   = getLogs();

  if (allLogs.length < 7) {
    container.innerHTML = '<p class="empty-state">Log at least 7 days to unlock insights.</p>';
    return;
  }

  const cards = [];

  // ── 1. Sleep < 6 hrs vs ≥ 6 hrs
  const poorSleep = allLogs.filter(l => l.sleepHours < 6);
  const goodSleep = allLogs.filter(l => l.sleepHours >= 6);
  if (poorSleep.length >= 2 && goodSleep.length >= 2) {
    const pAvg = r1(mean(poorSleep.map(l => l.dizziness)));
    const gAvg = r1(mean(goodSleep.map(l => l.dizziness)));
    const diff = r1(Math.abs(pAvg - gAvg));
    if (diff >= 0.5) {
      const worse = pAvg > gAvg;
      cards.push({
        label: 'Sleep & Dizziness',
        html: `After fewer than 6 hours of sleep, your average dizziness is <strong>${pAvg}</strong> —
               ${diff} points ${worse ? 'higher' : 'lower'} than on days with more sleep (avg&nbsp;${gAvg}).`,
      });
    }
  }

  // ── 2. High stress (≥7) vs low stress (≤4)
  const highStress = allLogs.filter(l => l.stress >= 7);
  const lowStress  = allLogs.filter(l => l.stress <= 4);
  if (highStress.length >= 2 && lowStress.length >= 2) {
    const hAvg = r1(mean(highStress.map(l => l.dizziness)));
    const lAvg = r1(mean(lowStress.map(l => l.dizziness)));
    const diff = r1(Math.abs(hAvg - lAvg));
    if (diff >= 0.5) {
      cards.push({
        label: 'Stress & Dizziness',
        html: `On high-stress days (7–10), your average dizziness is <strong>${hAvg}</strong>
               vs <strong>${lAvg}</strong> on calmer days — a gap of ${diff} points.`,
      });
    }
  }

  // ── 3. Best / hardest day of the week
  const byDow = {};
  allLogs.forEach(l => {
    const label = isoToDate(l.date).toLocaleDateString('en-GB', { weekday: 'long' });
    if (!byDow[label]) byDow[label] = [];
    byDow[label].push(l.dizziness);
  });
  const dowRanked = Object.entries(byDow)
    .filter(([, v]) => v.length >= 2)
    .map(([day, vals]) => ({ day, avg: r1(mean(vals)) }))
    .sort((a, b) => a.avg - b.avg);
  if (dowRanked.length >= 2) {
    const best  = dowRanked[0];
    const worst = dowRanked[dowRanked.length - 1];
    cards.push({
      label: 'Best Day of the Week',
      html: `Your easiest days tend to be <strong>${best.day}</strong> (avg ${best.avg})
             and hardest on <strong>${worst.day}</strong> (avg ${worst.avg}).`,
    });
  }

  // ── 4. Current logging streak
  const loggedDates = new Set(allLogs.map(l => l.date));
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (loggedDates.has(localISO(d))) streak++;
    else break;
  }
  if (streak >= 3) {
    cards.push({
      label: 'Logging Streak',
      html: `You've logged <strong>${streak} day${streak > 1 ? 's' : ''} in a row</strong> —
             great consistency. Regular tracking helps uncover your personal patterns.`,
    });
  }

  // ── 5. Recent trend (last 7 vs previous 7)
  if (allLogs.length >= 14) {
    const recent = allLogs.slice(-7).map(l => l.dizziness);
    const prior  = allLogs.slice(-14, -7).map(l => l.dizziness);
    const rAvg   = r1(mean(recent));
    const pAvg   = r1(mean(prior));
    const diff   = r1(pAvg - rAvg);
    if (Math.abs(diff) >= 0.5) {
      cards.push({
        label: 'Recent Trend',
        html: diff > 0
          ? `Your dizziness has <strong>improved by ${diff} points</strong> over the last 7 days
             compared to the 7 days before (${pAvg} → ${rAvg}).`
          : `Your dizziness has <strong>increased by ${Math.abs(diff)} points</strong> recently
             (${pAvg} → ${rAvg}). Consider what may have changed.`,
      });
    }
  }

  if (!cards.length) {
    container.innerHTML = '<p class="empty-state">Keep logging — patterns will appear here once there\'s enough variety in your data.</p>';
    return;
  }

  container.innerHTML = cards.map(c => `
    <div class="insight-card">
      <strong>${c.label}</strong>
      ${c.html}
    </div>
  `).join('');
}

function renderTriggerBars() {
  const container = document.getElementById('top-triggers');
  const logs      = getThisMonthLogs();

  if (!logs.length) {
    container.innerHTML = '<p class="empty-state">No logs this month yet.</p>';
    return;
  }

  const counts = {};
  logs.forEach(l => (l.triggers || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    container.innerHTML = '<p class="empty-state">No triggers logged this month.</p>';
    return;
  }

  const max = sorted[0][1];
  container.innerHTML = sorted.map(([trigger, count]) => `
    <div class="trigger-bar-row">
      <span class="trigger-bar-label">${TRIGGER_LABELS[trigger] || trigger}</span>
      <div class="trigger-bar-track">
        <div class="trigger-bar-fill" style="width:${(count / max) * 100}%"></div>
      </div>
      <span class="trigger-bar-count">${count}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// Insights — sleep vs dizziness scatter chart
// ─────────────────────────────────────────────
function renderSleepChart() {
  const canvas = document.getElementById('sleep-chart');
  if (!canvas) return;

  const ctx  = canvas.getContext('2d');
  const logs = getLogs().filter(l => l.sleepHours != null && l.dizziness != null);

  const dpr  = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W    = wrap.clientWidth  || 300;
  const H    = wrap.clientHeight || 180;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (logs.length < 3) {
    ctx.fillStyle = '#9ab4ba';
    ctx.font      = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Log at least 3 days to see this chart.', W / 2, H / 2);
    return;
  }

  const P    = { t: 14, r: 14, b: 36, l: 34 };
  const cW   = W - P.l - P.r;
  const cH   = H - P.t - P.b;
  const maxH = 12;

  const toX = h => P.l + (Math.min(h, maxH) / maxH) * cW;
  const toY = v => P.t + cH - ((v - 1) / 9) * cH;

  // Gridlines
  ctx.strokeStyle = '#dce8eb';
  ctx.lineWidth   = 1;
  ctx.font        = '10px -apple-system, sans-serif';
  ctx.fillStyle   = '#9ab4ba';
  ctx.textAlign   = 'right';
  [2, 4, 6, 8, 10].forEach(v => {
    const y = toY(v);
    ctx.beginPath();
    ctx.moveTo(P.l, y);
    ctx.lineTo(P.l + cW, y);
    ctx.stroke();
    ctx.fillText(v, P.l - 5, y + 4);
  });

  // X axis labels
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9ab4ba';
  [0, 3, 6, 9, 12].forEach(h => {
    ctx.fillText(`${h}h`, toX(h), H - P.b + 16);
  });

  // Axis titles
  ctx.fillStyle = '#9ab4ba';
  ctx.font      = '10px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Sleep hours', P.l + cW / 2, H - 2);

  ctx.save();
  ctx.translate(11, P.t + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Dizziness', 0, 0);
  ctx.restore();

  // Scatter dots (colour = dizziness intensity)
  logs.forEach(l => {
    const x = toX(l.sleepHours);
    const y = toY(l.dizziness);

    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.globalAlpha  = 0.72;
    ctx.fillStyle    = dizColor(l.dizziness);
    ctx.fill();
    ctx.globalAlpha  = 1;
    ctx.strokeStyle  = 'rgba(255,255,255,0.8)';
    ctx.lineWidth    = 1.5;
    ctx.stroke();
  });

  // Simple linear regression line
  if (logs.length >= 5) {
    const xs = logs.map(l => Math.min(l.sleepHours, maxH));
    const ys = logs.map(l => l.dizziness);
    const n  = xs.length;
    const sx = xs.reduce((a, b) => a + b, 0);
    const sy = ys.reduce((a, b) => a + b, 0);
    const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sxx = xs.reduce((a, x) => a + x * x, 0);
    const denom = n * sxx - sx * sx;
    if (Math.abs(denom) > 0.001) {
      const slope = (n * sxy - sx * sy) / denom;
      const intercept = (sy - slope * sx) / n;
      const x0 = 0, x1 = maxH;
      const y0 = slope * x0 + intercept;
      const y1 = slope * x1 + intercept;

      ctx.beginPath();
      ctx.moveTo(toX(x0), toY(Math.max(1, Math.min(10, y0))));
      ctx.lineTo(toX(x1), toY(Math.max(1, Math.min(10, y1))));
      ctx.strokeStyle = 'rgba(95,158,168,0.5)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ─────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────
function initExport() {
  document.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', () => exportCSV(+btn.dataset.days));
  });

  document.getElementById('clear-data-btn').addEventListener('click', () => {
    showModal(
      'Clear All Data?',
      'This will permanently delete every log entry from this device. This cannot be undone.',
      () => {
        localStorage.removeItem(STORAGE_KEY);
        renderExportStats();
        showModal('Done', 'All data has been cleared.', null, true);
      }
    );
  });
}

function renderExportStats() {
  const logs = getLogs();
  const el   = document.getElementById('data-stats');

  if (!logs.length) {
    el.textContent = 'No data logged yet.';
    return;
  }

  const first = logs[0].date;
  const last  = logs[logs.length - 1].date;
  el.innerHTML = `
    <strong>${logs.length}</strong> entr${logs.length === 1 ? 'y' : 'ies'} logged<br>
    From <strong>${formatShort(first)}</strong> to <strong>${formatShort(last)}</strong>
  `;
}

function exportCSV(days) {
  const logs = getLogsInRange(days);
  if (!logs.length) {
    showModal('Nothing to Export', `No entries found for this time period.`, null, true);
    return;
  }

  const header = [
    'Date',
    'Dizziness (1-10)',
    'Triggers',
    'Sleep Hours',
    'Sleep Quality (1-5)',
    'Stress (1-10)',
    'Notes',
  ];

  const rows = logs.map(l => [
    l.date,
    l.dizziness,
    (l.triggers || []).map(t => TRIGGER_LABELS[t] || t).join('; '),
    l.sleepHours,
    l.sleepQuality,
    l.stress,
    `"${(l.notes || '').replace(/"/g, '""')}"`,
  ]);

  const csv  = [header, ...rows].map(r => r.join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const label = days === 0 ? 'all-time' : `${days}d`;

  a.href     = url;
  a.download = `pppd-log-${label}-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// Modal (bottom sheet)
// ─────────────────────────────────────────────
function showModal(title, body, onConfirm, infoOnly = false) {
  const overlay    = document.getElementById('modal-overlay');
  const titleEl    = document.getElementById('modal-title');
  const bodyEl     = document.getElementById('modal-body');
  const cancelBtn  = document.getElementById('modal-cancel');
  const confirmBtn = document.getElementById('modal-confirm');

  titleEl.textContent = title;
  bodyEl.textContent  = body;

  if (infoOnly) {
    cancelBtn.style.display = 'none';
    confirmBtn.textContent  = 'OK';
    confirmBtn.className    = 'btn-secondary';
  } else {
    cancelBtn.style.display = '';
    confirmBtn.textContent  = 'Confirm';
    confirmBtn.className    = 'btn-danger';
  }

  overlay.classList.remove('hidden');

  const close = () => overlay.classList.add('hidden');

  // Replace handlers each time (avoid stacking listeners)
  confirmBtn.onclick = () => { close(); onConfirm?.(); };
  cancelBtn.onclick  = close;

  const bgClose = e => { if (e.target === overlay) { close(); overlay.removeEventListener('click', bgClose); } };
  overlay.addEventListener('click', bgClose);
}

// ─────────────────────────────────────────────
// Service Worker registration
// ─────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

// ─────────────────────────────────────────────
// Resize — redraw charts on orientation change
// ─────────────────────────────────────────────
function initResizeObserver() {
  const ro = new ResizeObserver(() => {
    if (state.currentView === 'history')  renderTrendChart();
    if (state.currentView === 'insights') renderSleepChart();
  });
  ro.observe(document.getElementById('main-content'));
}

// ─────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────
function init() {
  initHeader();
  initNav();
  initLog();
  initCalNav();
  initChartRangeButtons();
  initExport();
  initResizeObserver();
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
