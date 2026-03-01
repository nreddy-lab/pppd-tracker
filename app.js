/* ═══════════════════════════════════════════
   PPPD Tracker — app.js
   Multi-episode logging model.
   Storage key: pppd_entries
   Vanilla JS, no dependencies.
   ═══════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const STORAGE_KEY = 'pppd_entries';

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

const ACTIVITY_LABELS = {
  computer: '💻 Computer',
  reading:  '📖 Reading',
  walking:  '🚶 Walking',
  shopping: '🛒 Shopping',
  driving:  '🚗 Driving',
  tv:       '📺 TV',
  cooking:  '🍳 Cooking',
  resting:  '🛋️ Resting',
  phone:    '📱 Phone',
  outside:  '🌳 Outside',
  exercise: '🏃 Exercise',
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
  currentView:        'log',
  calMonth:           new Date().getMonth(),
  calYear:            new Date().getFullYear(),
  chartDays:          14,
  selectedActivity:   null,
  selectedEpTriggers: new Set(),
  sleepType:          'night',
  slQuality:          3,
  activeSheet:        null,
};

// ─────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────
function getEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function addEntry(entry) {
  const entries = getEntries();
  entries.push(entry);
  entries.sort((a, b) => a.timestamp - b.timestamp);
  saveEntries(entries);
}

function deleteEntry(id) {
  saveEntries(getEntries().filter(e => e.id !== id));
}

function getEntriesInRange(days) {
  const all = getEntries();
  if (days === 0) return all;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return all.filter(e => e.date >= localISO(cutoff));
}

function getDayEntries(iso) {
  return getEntries().filter(e => e.date === iso);
}

function getDayDizzyEntries(iso) {
  return getDayEntries(iso).filter(e => e.type === 'dizziness');
}

function getDaySleepEntries(iso) {
  return getDayEntries(iso).filter(e => e.type === 'sleep');
}

function getDayStats(iso) {
  const dizzy = getDayDizzyEntries(iso);
  const sleep = getDaySleepEntries(iso);
  const intensities = dizzy.map(e => e.intensity);
  const totalSleep  = sleep.reduce((s, e) => s + (e.hours || 0), 0);
  const nightSleep  = sleep.filter(e => e.sleepType === 'night').reduce((s, e) => s + (e.hours || 0), 0);
  const napSleep    = sleep.filter(e => e.sleepType === 'nap').reduce((s, e) => s + (e.hours || 0), 0);
  return {
    episodeCount: dizzy.length,
    avgIntensity: intensities.length ? r1(mean(intensities)) : null,
    maxIntensity: intensities.length ? Math.max(...intensities) : null,
    totalSleep,
    nightSleep,
    napSleep,
  };
}

function getThisMonthEntries() {
  const now    = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return getEntries().filter(e => e.date.startsWith(prefix));
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

function nowTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
// Daily Log — main view
// ─────────────────────────────────────────────
function initLog() {
  document.getElementById('btn-log-dizziness').addEventListener('click', () => openSheet('sheet-dizziness'));
  document.getElementById('btn-log-sleep').addEventListener('click', () => openSheet('sheet-sleep'));
  renderTodaySummary();
  renderTimeline();
}

function renderTodaySummary() {
  const stats = getDayStats(todayISO());
  document.getElementById('summary-episodes').textContent = stats.episodeCount;

  if (stats.avgIntensity !== null) {
    document.getElementById('summary-avg-max').textContent = `${stats.avgIntensity} · ${stats.maxIntensity}`;
  } else {
    document.getElementById('summary-avg-max').textContent = '—';
  }

  if (stats.totalSleep > 0) {
    document.getElementById('summary-sleep').textContent = `${r1(stats.totalSleep)}h`;
  } else {
    document.getElementById('summary-sleep').textContent = '—';
  }
}

function renderTimeline() {
  // newest first within the day
  const entries   = getDayEntries(todayISO()).slice().reverse();
  const container = document.getElementById('today-timeline');

  if (!entries.length) {
    container.innerHTML = '<p class="empty-state">No entries yet today. Tap a button above to log.</p>';
    return;
  }

  container.innerHTML = entries.map(e => {
    if (e.type === 'dizziness') {
      const actLabel   = e.activity ? (ACTIVITY_LABELS[e.activity] || e.activity) : '';
      const triggersHtml = e.triggers?.length
        ? `<div class="entry-triggers">${e.triggers.map(t => TRIGGER_LABELS[t] || t).join(' · ')}</div>`
        : '';
      return `
        <div class="timeline-entry">
          <span class="entry-icon">💫</span>
          <div class="entry-body">
            <div class="entry-main">Dizziness ${e.intensity}/10${actLabel ? ' · ' + actLabel : ''}</div>
            ${triggersHtml}
          </div>
          <div class="entry-meta">
            <span class="entry-time">${e.time}</span>
            <button class="entry-delete" data-id="${e.id}" type="button" aria-label="Delete entry">✕</button>
          </div>
        </div>`;
    } else {
      const typeLabel = e.sleepType === 'night' ? 'Night sleep' : 'Nap';
      const stars     = e.quality ? '★'.repeat(e.quality) + '☆'.repeat(5 - e.quality) : '';
      return `
        <div class="timeline-entry">
          <span class="entry-icon">${e.sleepType === 'night' ? '🌙' : '😴'}</span>
          <div class="entry-body">
            <div class="entry-main">${typeLabel} · ${e.hours}h${stars ? ' · ' + stars : ''}</div>
          </div>
          <div class="entry-meta">
            <span class="entry-time">${e.time || ''}</span>
            <button class="entry-delete" data-id="${e.id}" type="button" aria-label="Delete entry">✕</button>
          </div>
        </div>`;
    }
  }).join('');

  container.querySelectorAll('.entry-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteEntry(btn.dataset.id);
      renderTimeline();
      renderTodaySummary();
    });
  });
}

// ─────────────────────────────────────────────
// Form sheets — open / close
// ─────────────────────────────────────────────
function openSheet(id) {
  state.activeSheet = id;
  document.getElementById('sheet-overlay').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');

  if (id === 'sheet-dizziness') resetDizzySheet();
  if (id === 'sheet-sleep')     resetSleepSheet();
}

function closeSheet() {
  if (state.activeSheet) {
    document.getElementById(state.activeSheet).classList.add('hidden');
    state.activeSheet = null;
  }
  document.getElementById('sheet-overlay').classList.add('hidden');
}

function resetDizzySheet() {
  document.getElementById('ep-time').value              = nowTimeString();
  document.getElementById('ep-intensity').value         = 5;
  document.getElementById('ep-intensity-badge').textContent   = 5;
  document.getElementById('ep-intensity-badge').style.background = dizColor(5);
  document.getElementById('ep-stress').value            = 5;
  document.getElementById('ep-stress-badge').textContent      = 5;
  document.getElementById('ep-notes').value             = '';
  document.getElementById('ep-activity-detail').value   = '';
  document.getElementById('activity-detail-wrap').style.display = 'none';
  document.querySelectorAll('#activity-chips .chip').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('#ep-triggers-grid .chip').forEach(c => c.classList.remove('selected'));
  state.selectedActivity   = null;
  state.selectedEpTriggers = new Set();
}

function resetSleepSheet() {
  document.getElementById('sl-hours').value = 7;
  document.getElementById('sl-notes').value = '';
  state.sleepType = 'night';
  state.slQuality = 3;
  document.querySelectorAll('.sleep-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === 'night');
  });
  renderSlStars();
}

// ─────────────────────────────────────────────
// Dizziness sheet — wiring
// ─────────────────────────────────────────────
function initDizzySheet() {
  // Intensity slider
  const intensitySlider = document.getElementById('ep-intensity');
  const intensityBadge  = document.getElementById('ep-intensity-badge');
  intensitySlider.addEventListener('input', () => {
    const v = +intensitySlider.value;
    intensityBadge.textContent       = v;
    intensityBadge.style.background  = dizColor(v);
  });

  // Stress slider
  const stressSlider = document.getElementById('ep-stress');
  const stressBadge  = document.getElementById('ep-stress-badge');
  stressSlider.addEventListener('input', () => {
    stressBadge.textContent = stressSlider.value;
  });

  // Activity chips (single-select)
  document.querySelectorAll('#activity-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const act = chip.dataset.activity;
      if (state.selectedActivity === act) {
        // Deselect
        chip.classList.remove('selected');
        state.selectedActivity = null;
        document.getElementById('activity-detail-wrap').style.display = 'none';
      } else {
        document.querySelectorAll('#activity-chips .chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        state.selectedActivity = act;
        document.getElementById('activity-detail-wrap').style.display = '';
      }
    });
  });

  // Trigger chips (multi-select)
  document.querySelectorAll('#ep-triggers-grid .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const t = chip.dataset.trigger;
      if (state.selectedEpTriggers.has(t)) {
        state.selectedEpTriggers.delete(t);
        chip.classList.remove('selected');
      } else {
        state.selectedEpTriggers.add(t);
        chip.classList.add('selected');
      }
    });
  });

  document.getElementById('ep-save').addEventListener('click', saveDizzyEntry);
  document.getElementById('ep-cancel').addEventListener('click', closeSheet);
}

function saveDizzyEntry() {
  const timeVal = document.getElementById('ep-time').value || nowTimeString();
  const entry = {
    id:             genId('ep'),
    type:           'dizziness',
    date:           todayISO(),
    timestamp:      Date.now(),
    time:           timeVal,
    intensity:      +document.getElementById('ep-intensity').value,
    activity:       state.selectedActivity || '',
    activityDetail: document.getElementById('ep-activity-detail').value.trim(),
    triggers:       [...state.selectedEpTriggers],
    stress:         +document.getElementById('ep-stress').value,
    notes:          document.getElementById('ep-notes').value.trim(),
  };

  addEntry(entry);
  closeSheet();
  renderTimeline();
  renderTodaySummary();
}

// ─────────────────────────────────────────────
// Sleep sheet — wiring
// ─────────────────────────────────────────────
function initSleepSheet() {
  // Sleep type toggle
  document.querySelectorAll('.sleep-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sleepType = btn.dataset.type;
      document.querySelectorAll('.sleep-type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === state.sleepType);
      });
    });
  });

  // Quality stars
  document.querySelectorAll('#sl-quality .star').forEach(btn => {
    btn.addEventListener('click', () => {
      state.slQuality = +btn.dataset.value;
      renderSlStars();
    });
  });
  renderSlStars();

  document.getElementById('sl-save').addEventListener('click', saveSleepEntry);
  document.getElementById('sl-cancel').addEventListener('click', closeSheet);
}

function renderSlStars() {
  document.querySelectorAll('#sl-quality .star').forEach(s => {
    s.classList.toggle('lit', +s.dataset.value <= state.slQuality);
  });
}

function saveSleepEntry() {
  const entry = {
    id:        genId('sl'),
    type:      'sleep',
    date:      todayISO(),
    timestamp: Date.now(),
    time:      nowTimeString(),
    sleepType: state.sleepType,
    hours:     +document.getElementById('sl-hours').value,
    quality:   state.slQuality,
    notes:     document.getElementById('sl-notes').value.trim(),
  };

  addEntry(entry);
  closeSheet();
  renderTimeline();
  renderTodaySummary();
}

// ─────────────────────────────────────────────
// History
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

  // Build per-day stats map
  const dayMap = {};
  getEntries().forEach(e => {
    if (!dayMap[e.date]) dayMap[e.date] = { dizzy: [], hasSleep: false };
    if (e.type === 'dizziness') dayMap[e.date].dizzy.push(e.intensity);
    if (e.type === 'sleep')     dayMap[e.date].hasSleep = true;
  });

  const monthLabel = new Date(calYear, calMonth, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  document.getElementById('cal-month-label').textContent = monthLabel;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(label => {
    const el = document.createElement('div');
    el.className   = 'cal-day-header';
    el.textContent = label;
    grid.appendChild(el);
  });

  const firstDOW   = new Date(calYear, calMonth, 1).getDay();
  const offset     = (firstDOW + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today       = todayISO();

  for (let i = 0; i < offset; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso     = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const data    = dayMap[iso];
    const el      = document.createElement('div');

    el.className   = 'cal-day';
    el.textContent = day;
    if (iso === today) el.classList.add('today');

    if (data && data.dizzy.length > 0) {
      const maxI = Math.max(...data.dizzy);
      el.classList.add('has-log', dizClass(maxI));
      el.title = `${data.dizzy.length} episode(s) · max intensity ${maxI}`;
    } else if (data && data.hasSleep) {
      el.classList.add('no-log');
      el.title = 'Sleep logged';
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
  const cutoffISO = localISO(cutoff);

  const weekEntries = getEntries().filter(e => e.date >= cutoffISO);
  const el          = document.getElementById('weekly-summary');

  if (!weekEntries.length) {
    el.innerHTML = '<p class="empty-state">No entries in the last 7 days.</p>';
    return;
  }

  const dizzyEps = weekEntries.filter(e => e.type === 'dizziness');
  const sleepEps = weekEntries.filter(e => e.type === 'sleep');

  // Episodes per day
  const daysWithEps = new Set(dizzyEps.map(e => e.date)).size;
  const epsPerDay   = daysWithEps ? r1(dizzyEps.length / 7) : 0;

  const avgDiz    = dizzyEps.length ? r1(mean(dizzyEps.map(e => e.intensity))) : '—';
  const avgStress = dizzyEps.length ? r1(mean(dizzyEps.map(e => e.stress))) : '—';

  const nightH = r1(sleepEps.filter(e => e.sleepType === 'night').reduce((s, e) => s + (e.hours || 0), 0) / 7);
  const napH   = r1(sleepEps.filter(e => e.sleepType === 'nap').reduce((s, e) => s + (e.hours || 0), 0) / 7);

  // Top trigger
  const trigCount = {};
  dizzyEps.forEach(e => (e.triggers || []).forEach(t => { trigCount[t] = (trigCount[t] || 0) + 1; }));
  const topTrigEntry = Object.entries(trigCount).sort((a, b) => b[1] - a[1])[0];
  const topTrig      = topTrigEntry ? (TRIGGER_LABELS[topTrigEntry[0]] || topTrigEntry[0]) : '—';

  el.innerHTML = `
    <div class="summary-stat">
      <span class="stat-value">${avgDiz}</span>
      <span class="stat-label">Avg intensity</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">${epsPerDay}</span>
      <span class="stat-label">Episodes/day</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">${nightH}h</span>
      <span class="stat-label">Avg night sleep/day</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">${napH}h</span>
      <span class="stat-label">Avg naps/day</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">${avgStress}</span>
      <span class="stat-label">Avg stress</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">${dizzyEps.length}</span>
      <span class="stat-label">Total episodes</span>
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

  // Per-day avg intensity from dizziness episodes
  const dayAvgMap = {};
  getEntries().filter(e => e.type === 'dizziness').forEach(e => {
    if (!dayAvgMap[e.date]) dayAvgMap[e.date] = [];
    dayAvgMap[e.date].push(e.intensity);
  });

  const points = dates.map(iso => ({
    iso,
    val: dayAvgMap[iso] ? r1(mean(dayAvgMap[iso])) : null,
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

  // Gridlines + Y labels
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

  // Filled area
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
    grad.addColorStop(0, 'rgba(95,158,168,0.28)');
    grad.addColorStop(1, 'rgba(95,158,168,0.02)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Line
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

  // Dots
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

  // X labels (sparse — ~5 labels max)
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
  renderActivityCorrelation();
  renderTimeOfDay();
  renderSleepChart();
}

function renderInsightCards() {
  const container   = document.getElementById('insights-list');
  const allDizzy    = getEntries().filter(e => e.type === 'dizziness');
  const allSleep    = getEntries().filter(e => e.type === 'sleep');

  if (allDizzy.length < 7) {
    container.innerHTML = '<p class="empty-state">Log at least 7 episodes to unlock insights.</p>';
    return;
  }

  const cards = [];

  // ── 1. Night sleep < 6h vs ≥ 6h
  // Pair days: night sleep hours → avg episode intensity that day
  const dayPairs = {};
  allDizzy.forEach(e => {
    if (!dayPairs[e.date]) dayPairs[e.date] = { dizzy: [], sleep: 0 };
    dayPairs[e.date].dizzy.push(e.intensity);
  });
  allSleep.filter(e => e.sleepType === 'night').forEach(e => {
    if (!dayPairs[e.date]) dayPairs[e.date] = { dizzy: [], sleep: 0 };
    dayPairs[e.date].sleep += e.hours || 0;
  });

  const paired     = Object.values(dayPairs).filter(d => d.dizzy.length > 0 && d.sleep > 0);
  const poorSleep  = paired.filter(d => d.sleep < 6);
  const goodSleep  = paired.filter(d => d.sleep >= 6);

  if (poorSleep.length >= 2 && goodSleep.length >= 2) {
    const pAvg = r1(mean(poorSleep.map(d => mean(d.dizzy))));
    const gAvg = r1(mean(goodSleep.map(d => mean(d.dizzy))));
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
  const highStress = allDizzy.filter(e => e.stress >= 7);
  const lowStress  = allDizzy.filter(e => e.stress <= 4);
  if (highStress.length >= 2 && lowStress.length >= 2) {
    const hAvg = r1(mean(highStress.map(e => e.intensity)));
    const lAvg = r1(mean(lowStress.map(e => e.intensity)));
    const diff = r1(Math.abs(hAvg - lAvg));
    if (diff >= 0.5) {
      cards.push({
        label: 'Stress & Dizziness',
        html: `On high-stress episodes (stress 7–10), your average dizziness is <strong>${hAvg}</strong>
               vs <strong>${lAvg}</strong> on calmer ones — a gap of ${diff} points.`,
      });
    }
  }

  // ── 3. Best / hardest day of the week
  const byDow = {};
  allDizzy.forEach(e => {
    const label = isoToDate(e.date).toLocaleDateString('en-GB', { weekday: 'long' });
    if (!byDow[label]) byDow[label] = [];
    byDow[label].push(e.intensity);
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

  // ── 4. Logging streak (days with at least one episode)
  const episodeDates = new Set(allDizzy.map(e => e.date));
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (episodeDates.has(localISO(d))) streak++;
    else break;
  }
  if (streak >= 3) {
    cards.push({
      label: 'Logging Streak',
      html: `You've logged episodes for <strong>${streak} day${streak > 1 ? 's' : ''} in a row</strong> —
             great consistency. Regular tracking helps uncover your personal patterns.`,
    });
  }

  // ── 5. Recent trend (last 7 days vs previous 7 days by avg daily intensity)
  const allDates = [...new Set(allDizzy.map(e => e.date))].sort();
  if (allDates.length >= 14) {
    const dayAvg = date => r1(mean(allDizzy.filter(e => e.date === date).map(e => e.intensity)));
    const recent = allDates.slice(-7).map(dayAvg);
    const prior  = allDates.slice(-14, -7).map(dayAvg);
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
  const entries   = getThisMonthEntries().filter(e => e.type === 'dizziness');

  if (!entries.length) {
    container.innerHTML = '<p class="empty-state">No episodes this month yet.</p>';
    return;
  }

  const counts = {};
  entries.forEach(e => (e.triggers || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));

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
      <span class="trigger-bar-count">${count}×</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// Insights — activity vs dizziness
// ─────────────────────────────────────────────
function renderActivityCorrelation() {
  const container = document.getElementById('activity-correlation');
  const entries   = getThisMonthEntries().filter(e => e.type === 'dizziness' && e.activity);

  if (!entries.length) {
    container.innerHTML = '<p class="empty-state">Log dizziness episodes with activities to see this chart.</p>';
    return;
  }

  const byActivity = {};
  entries.forEach(e => {
    if (!byActivity[e.activity]) byActivity[e.activity] = [];
    byActivity[e.activity].push(e.intensity);
  });

  const sorted = Object.entries(byActivity)
    .map(([act, vals]) => ({ act, avg: r1(mean(vals)), count: vals.length }))
    .sort((a, b) => b.avg - a.avg);

  container.innerHTML = sorted.map(({ act, avg, count }) => `
    <div class="trigger-bar-row">
      <span class="trigger-bar-label">${ACTIVITY_LABELS[act] || act}</span>
      <div class="trigger-bar-track">
        <div class="trigger-bar-fill" style="width:${(avg / 10) * 100}%"></div>
      </div>
      <span class="trigger-bar-count">${avg}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// Insights — time of day
// ─────────────────────────────────────────────
function renderTimeOfDay() {
  const container = document.getElementById('time-of-day');
  const entries   = getThisMonthEntries().filter(e => e.type === 'dizziness' && e.time);

  if (entries.length < 3) {
    container.innerHTML = '<p class="empty-state">Log more episodes to see time-of-day patterns.</p>';
    return;
  }

  const buckets = { Morning: [], Afternoon: [], Evening: [], Night: [] };
  entries.forEach(e => {
    const hour = parseInt(e.time.split(':')[0], 10);
    if      (hour >= 6  && hour < 12) buckets.Morning.push(e.intensity);
    else if (hour >= 12 && hour < 18) buckets.Afternoon.push(e.intensity);
    else if (hour >= 18 && hour < 24) buckets.Evening.push(e.intensity);
    else                              buckets.Night.push(e.intensity);
  });

  const icons   = { Morning: '🌅', Afternoon: '☀️', Evening: '🌆', Night: '🌙' };
  const results = Object.entries(buckets)
    .filter(([, vals]) => vals.length > 0)
    .map(([period, vals]) => ({ period, avg: r1(mean(vals)), count: vals.length }))
    .sort((a, b) => b.avg - a.avg);

  if (!results.length) {
    container.innerHTML = '<p class="empty-state">Not enough data yet.</p>';
    return;
  }

  container.innerHTML = results.map(({ period, avg, count }) => `
    <div class="trigger-bar-row">
      <span class="trigger-bar-label">${icons[period] || ''} ${period}</span>
      <div class="trigger-bar-track">
        <div class="trigger-bar-fill" style="width:${(avg / 10) * 100}%"></div>
      </div>
      <span class="trigger-bar-count">${avg}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// Insights — sleep vs dizziness scatter chart
// ─────────────────────────────────────────────
function renderSleepChart() {
  const canvas = document.getElementById('sleep-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Pair per day: night sleep hours → avg episode intensity
  const byDate = {};
  getEntries().forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = { dizzy: [], sleep: 0 };
    if (e.type === 'dizziness')                      byDate[e.date].dizzy.push(e.intensity);
    if (e.type === 'sleep' && e.sleepType === 'night') byDate[e.date].sleep += e.hours || 0;
  });

  const logs = Object.values(byDate)
    .filter(d => d.dizzy.length > 0 && d.sleep > 0)
    .map(d => ({ sleepHours: d.sleep, dizziness: r1(mean(d.dizzy)) }));

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
    ctx.fillText('Log sleep + episodes on the same day to see this chart.', W / 2, H / 2);
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

  ctx.textAlign = 'center';
  ctx.fillStyle = '#9ab4ba';
  [0, 3, 6, 9, 12].forEach(h => {
    ctx.fillText(`${h}h`, toX(h), H - P.b + 16);
  });

  ctx.fillStyle = '#9ab4ba';
  ctx.font      = '10px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Sleep hours', P.l + cW / 2, H - 2);

  ctx.save();
  ctx.translate(11, P.t + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Dizziness', 0, 0);
  ctx.restore();

  // Scatter dots
  logs.forEach(l => {
    ctx.beginPath();
    ctx.arc(toX(l.sleepHours), toY(l.dizziness), 6, 0, Math.PI * 2);
    ctx.globalAlpha  = 0.72;
    ctx.fillStyle    = dizColor(l.dizziness);
    ctx.fill();
    ctx.globalAlpha  = 1;
    ctx.strokeStyle  = 'rgba(255,255,255,0.8)';
    ctx.lineWidth    = 1.5;
    ctx.stroke();
  });

  // Regression line
  if (logs.length >= 5) {
    const xs  = logs.map(l => Math.min(l.sleepHours, maxH));
    const ys  = logs.map(l => l.dizziness);
    const n   = xs.length;
    const sx  = xs.reduce((a, b) => a + b, 0);
    const sy  = ys.reduce((a, b) => a + b, 0);
    const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sxx = xs.reduce((a, x) => a + x * x, 0);
    const den = n * sxx - sx * sx;
    if (Math.abs(den) > 0.001) {
      const slope     = (n * sxy - sx * sy) / den;
      const intercept = (sy - slope * sx) / n;
      ctx.beginPath();
      ctx.moveTo(toX(0),    toY(Math.max(1, Math.min(10, intercept))));
      ctx.lineTo(toX(maxH), toY(Math.max(1, Math.min(10, slope * maxH + intercept))));
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
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const days = +btn.dataset.days;
      if (type === 'episodes') exportEpisodesCSV(days);
      else if (type === 'sleep') exportSleepCSV(days);
    });
  });

  document.getElementById('clear-data-btn').addEventListener('click', () => {
    showModal(
      'Clear All Data?',
      'This will permanently delete every entry from this device. This cannot be undone.',
      () => {
        localStorage.removeItem(STORAGE_KEY);
        renderTimeline();
        renderTodaySummary();
        renderExportStats();
        showModal('Done', 'All data has been cleared.', null, true);
      }
    );
  });
}

function renderExportStats() {
  const entries = getEntries();
  const el      = document.getElementById('data-stats');

  if (!entries.length) {
    el.textContent = 'No data logged yet.';
    return;
  }

  const dizzy = entries.filter(e => e.type === 'dizziness');
  const sleep = entries.filter(e => e.type === 'sleep');
  const first = entries[0].date;
  const last  = entries[entries.length - 1].date;

  el.innerHTML = `
    <strong>${dizzy.length}</strong> dizziness episode${dizzy.length !== 1 ? 's' : ''},
    <strong>${sleep.length}</strong> sleep entr${sleep.length !== 1 ? 'ies' : 'y'}<br>
    From <strong>${formatShort(first)}</strong> to <strong>${formatShort(last)}</strong>
  `;
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportEpisodesCSV(days) {
  const entries = getEntriesInRange(days).filter(e => e.type === 'dizziness');
  if (!entries.length) {
    showModal('Nothing to Export', 'No dizziness episodes found for this time period.', null, true);
    return;
  }

  const header = [
    'Date',
    'Time',
    'Intensity (1-10)',
    'Activity',
    'Activity Detail',
    'Triggers',
    'Stress (1-10)',
    'Notes',
  ];

  const rows = entries.map(e => [
    e.date,
    e.time,
    e.intensity,
    e.activity ? (ACTIVITY_LABELS[e.activity] || e.activity).replace(/^\S+\s/, '') : '',
    `"${(e.activityDetail || '').replace(/"/g, '""')}"`,
    `"${(e.triggers || []).map(t => TRIGGER_LABELS[t] || t).join('; ').replace(/"/g, '""')}"`,
    e.stress,
    `"${(e.notes || '').replace(/"/g, '""')}"`,
  ]);

  const csv   = [header, ...rows].map(r => r.join(',')).join('\r\n');
  const label = days === 0 ? 'all-time' : `${days}d`;
  downloadCSV(csv, `pppd-episodes-${label}-${todayISO()}.csv`);
}

function exportSleepCSV(days) {
  const entries = getEntriesInRange(days).filter(e => e.type === 'sleep');
  if (!entries.length) {
    showModal('Nothing to Export', 'No sleep entries found for this time period.', null, true);
    return;
  }

  const header = ['Date', 'Type', 'Hours', 'Quality (1-5)', 'Notes'];

  const rows = entries.map(e => [
    e.date,
    e.sleepType === 'night' ? 'Night' : 'Nap',
    e.hours,
    e.quality,
    `"${(e.notes || '').replace(/"/g, '""')}"`,
  ]);

  const csv   = [header, ...rows].map(r => r.join(',')).join('\r\n');
  const label = days === 0 ? 'all-time' : `${days}d`;
  downloadCSV(csv, `pppd-sleep-${label}-${todayISO()}.csv`);
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

  confirmBtn.onclick = () => { close(); onConfirm?.(); };
  cancelBtn.onclick  = close;

  const bgClose = e => {
    if (e.target === overlay) {
      close();
      overlay.removeEventListener('click', bgClose);
    }
  };
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
  initDizzySheet();
  initSleepSheet();
  initCalNav();
  initChartRangeButtons();
  initExport();
  initResizeObserver();

  // Close sheet when overlay is tapped
  document.getElementById('sheet-overlay').addEventListener('click', closeSheet);

  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
