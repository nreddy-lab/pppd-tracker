/* ═══════════════════════════════════════════
   PPPD Tracker — app.js  v3
   Tabs: Daily | Weekly | Log | Insights | Export
   Storage keys:
     pppd_episodes       – continuous log array (migrated from pppd_entries)
     pppd_daily_YYYY-MM-DD – daily log objects
     pppd_weekly_YYYY-Wnn  – weekly exercise scores
     pppd_settings         – app settings
   ═══════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const KEY_EPISODES = 'pppd_episodes';
const KEY_SETTINGS = 'pppd_settings';

// New activity labels per spec
const ACTIVITY_LABELS = {
  tv:               '📺 TV',
  phone:            '📱 Phone',
  computer:         '💻 Computer',
  reading:          '📖 Reading',
  shopping:         '🛒 Shopping',
  cooking:          '🍳 Cooking',
  crowded_outside:  '👥 Crowded outside',
  social_outside:   '🌳 Social outside',
  social_home:      '🏠 Social at home',
  exercise:         '🏃 Exercise',
  walk:             '🚶 Walk',
  driving:          '🚗 Driving',
  public_transport: '🚌 Public transport',
  flight:           '✈️ Flight',
  // Legacy keys preserved for old data
  walking:  '🚶 Walking',
  resting:  '🛋️ Resting',
  outside:  '🌳 Outside',
  other:    '➕ Other',
};

// Activities shown in the episode sheet (new spec)
const NEW_ACTIVITIES = [
  'tv', 'phone', 'computer', 'reading', 'shopping', 'cooking',
  'crowded_outside', 'social_outside', 'social_home',
  'exercise', 'walk', 'driving', 'public_transport', 'flight',
];

const VIEW_TITLES = {
  daily:    'Daily Log',
  weekly:   'Weekly Scores',
  log:      'Episode Log',
  insights: 'Insights',
  export:   'Export',
};

// Colors for per-exercise chart lines (up to 12)
const EXERCISE_COLORS = [
  '#5f9ea8', '#8fbc8f', '#e6a817', '#9b59b6', '#e67e22',
  '#2ecc71', '#3498db', '#e74c3c', '#1abc9c', '#c0392b',
  '#f39c12', '#d35400',
];

// ─────────────────────────────────────────────
// App State
// ─────────────────────────────────────────────
const state = {
  currentView:    'daily',
  // Daily calendar nav
  calMonth:       new Date().getMonth(),
  calYear:        new Date().getFullYear(),
  // Daily sheet
  editingDate:    null,
  dailySleepHours: 7,
  dailySleepQuality: 3,
  dailyNapEnabled: false,
  dailyNapHours:  1,
  // Weekly tab
  weekMonday:     getMondayOfWeek(new Date()),
  weeklySliders:  {},   // exercise num (string) -> current slider value
  // Log tab
  logDate:        todayISO(),
  // Episode sheet
  editingEpisodeId: null,
  episodeType:    'dizziness',
  epSelectedActivity: null,
  epNapHours:     1,
  // Insights
  insightsDays:   30,
  // Exercise line visibility (keyed by exercise number)
  weeklyHiddenExercises:   new Set(),
  insightsHiddenExercises: new Set(),
  // Shared
  activeSheet:    null,
};

// ─────────────────────────────────────────────
// Data Migration
// ─────────────────────────────────────────────
function migrateData() {
  // Rename pppd_entries → pppd_episodes (old schema)
  const old = localStorage.getItem('pppd_entries');
  if (old && !localStorage.getItem(KEY_EPISODES)) {
    localStorage.setItem(KEY_EPISODES, old);
    localStorage.removeItem('pppd_entries');
  }
}

// ─────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────
function getSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY_SETTINGS));
    if (s && Array.isArray(s.activeExercises)) return s;
  } catch { /* ignore */ }
  return { activeExercises: [1, 2, 3, 4, 5, 6] };
}

function saveSettings(s) {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
}

function getActiveExercises() {
  return getSettings().activeExercises;
}

// ─────────────────────────────────────────────
// Episodes storage
// ─────────────────────────────────────────────
function getEpisodes() {
  try { return JSON.parse(localStorage.getItem(KEY_EPISODES)) || []; }
  catch { return []; }
}

function saveEpisodes(arr) {
  localStorage.setItem(KEY_EPISODES, JSON.stringify(arr));
}

function addEpisode(ep) {
  const arr = getEpisodes();
  arr.push(ep);
  arr.sort((a, b) => a.timestamp - b.timestamp);
  saveEpisodes(arr);
}

function updateEpisode(ep) {
  const arr = getEpisodes().map(e => e.id === ep.id ? ep : e);
  saveEpisodes(arr);
}

function deleteEpisode(id) {
  saveEpisodes(getEpisodes().filter(e => e.id !== id));
}

function getDateEpisodes(iso) {
  return getEpisodes().filter(e => e.date === iso);
}

function getDizzyEpisodes(iso) {
  return getDateEpisodes(iso).filter(e => e.type === 'dizziness');
}

function getEpisodesInRange(days) {
  const all = getEpisodes();
  if (days === 0) return all;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = localISO(cutoff);
  return all.filter(e => e.date >= cutoffISO);
}

// ─────────────────────────────────────────────
// Daily log storage
// ─────────────────────────────────────────────
function getDailyKey(iso) { return `pppd_daily_${iso}`; }

function getDailyLog(iso) {
  try { return JSON.parse(localStorage.getItem(getDailyKey(iso))) || null; }
  catch { return null; }
}

function saveDailyLog(iso, data) {
  localStorage.setItem(getDailyKey(iso), JSON.stringify(data));
}

function getAllDailyKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('pppd_daily_')) keys.push(k.replace('pppd_daily_', ''));
  }
  return keys.sort();
}

// ─────────────────────────────────────────────
// Weekly scores storage
// ─────────────────────────────────────────────
function getWeeklyKey(weekKey) { return `pppd_weekly_${weekKey}`; }

function getWeeklyScores(weekKey) {
  try { return JSON.parse(localStorage.getItem(getWeeklyKey(weekKey))) || {}; }
  catch { return {}; }
}

// Returns scores only, stripping internal metadata keys (prefixed with _)
function getWeeklyScoresOnly(weekKey) {
  const s = getWeeklyScores(weekKey);
  return Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith('_')));
}

// Returns the exercises stored with a past week's data, or null if not stored
function getWeeklyExercises(weekKey) {
  const s = getWeeklyScores(weekKey);
  return Array.isArray(s._ex) ? s._ex : null;
}

// All exercise numbers ever tracked across all saved weeks (union)
function getAllTrackedExercises() {
  const nums = new Set(getActiveExercises());
  getAllWeeklyKeys().forEach(wk => {
    const ex = getWeeklyExercises(wk);
    if (ex) {
      ex.forEach(n => nums.add(n));
    } else {
      // Legacy week without _ex: include any exercise with a stored score
      Object.keys(getWeeklyScoresOnly(wk)).forEach(k => nums.add(+k));
    }
  });
  return [...nums].sort((a, b) => a - b);
}

function saveWeeklyScores(weekKey, scores) {
  localStorage.setItem(getWeeklyKey(weekKey), JSON.stringify(scores));
}

function getAllWeeklyKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('pppd_weekly_')) keys.push(k.replace('pppd_weekly_', ''));
  }
  return keys.sort();
}

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────
function localISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

function todayISO() { return localISO(new Date()); }

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

function formatDate(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function nowTimeString() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
}

// ─────────────────────────────────────────────
// ISO Week helpers
// ─────────────────────────────────────────────
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    year: d.getUTCFullYear(),
    week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7),
  };
}

function isoWeekKey(date) {
  const { year, week } = getISOWeek(date);
  return `${year}-W${String(week).padStart(2,'0')}`;
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekLabel(monday) {
  return `Week of ${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// ─────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────
function mean(arr) { return arr.length ? arr.reduce((s,v) => s+v, 0) / arr.length : 0; }
function r1(n) { return Math.round(n * 10) / 10; }

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

  if (name === 'daily')    { renderDailyCalendar(); renderDailyTodaySummary(); }
  if (name === 'weekly')   renderWeeklyTab();
  if (name === 'log')      renderLogTimeline();
  if (name === 'insights') renderInsights();
  if (name === 'export')   renderExportStats();
}

// ─────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────
function initHeader() {
  document.getElementById('header-date').textContent = formatLong(new Date());
  document.getElementById('btn-settings').addEventListener('click', openSettings);
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
// DAILY TAB
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────
function initDailyTab() {
  document.getElementById('daily-cal-prev').addEventListener('click', () => {
    state.calMonth--;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    renderDailyCalendar();
  });
  document.getElementById('daily-cal-next').addEventListener('click', () => {
    state.calMonth++;
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    renderDailyCalendar();
  });
  document.getElementById('btn-log-today').addEventListener('click', () => {
    openDailySheet(todayISO());
  });
  renderDailyCalendar();
  renderDailyTodaySummary();
}

function renderDailyCalendar() {
  const { calYear, calMonth } = state;
  const label = new Date(calYear, calMonth, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  document.getElementById('daily-cal-month-label').textContent = label;

  const grid = document.getElementById('daily-calendar-grid');
  grid.innerHTML = '';

  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(l => {
    const el = document.createElement('div');
    el.className = 'cal-day-header';
    el.textContent = l;
    grid.appendChild(el);
  });

  const firstDOW  = new Date(calYear, calMonth, 1).getDay();
  const offset    = (firstDOW + 6) % 7;
  const daysInMon = new Date(calYear, calMonth + 1, 0).getDate();
  const today     = todayISO();

  for (let i = 0; i < offset; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMon; day++) {
    const iso  = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const log  = getDailyLog(iso);
    const el   = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = day;

    if (iso === today) el.classList.add('today');

    if (log) {
      const exDone  = log.exercisesDone;
      const vidDone = log.videoDone;
      if (exDone && vidDone)       el.classList.add('comply-full');
      else if (exDone || vidDone)  el.classList.add('comply-partial');
      else                         el.classList.add('comply-none');
    } else {
      el.classList.add('no-log');
    }

    // Only past + today are tappable
    if (iso <= today) {
      el.classList.add('tappable');
      el.addEventListener('click', () => openDailySheet(iso));
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `Daily log for ${formatDate(isoToDate(iso))}`);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openDailySheet(iso); });
    }

    grid.appendChild(el);
  }
}

function renderDailyTodaySummary() {
  const container = document.getElementById('daily-today-summary');
  const log = getDailyLog(todayISO());

  if (!log) {
    container.innerHTML = '<p class="empty-state">Tap "Log / Edit" to record today\'s sleep and therapy compliance.</p>';
    return;
  }

  const stars = log.sleepQuality
    ? '★'.repeat(log.sleepQuality) + '☆'.repeat(5 - log.sleepQuality)
    : '';

  const napHtml = log.napHours
    ? `${r1(log.napHours)}h`
    : 'No nap';

  const exBadge = log.exercisesDone
    ? `<span class="comply-badge done">✓ Done</span>`
    : `<span class="comply-badge skip">— Skipped</span>`;

  const vidBadge = log.videoDone
    ? `<span class="comply-badge done">✓ Done</span>`
    : `<span class="comply-badge skip">— Skipped</span>`;

  container.innerHTML = `
    <div class="daily-today-grid">
      <div class="daily-today-item">
        <span class="item-label">Night sleep</span>
        <span class="item-value">${r1(log.sleepHours || 0)}h ${stars}</span>
      </div>
      <div class="daily-today-item">
        <span class="item-label">Afternoon nap</span>
        <span class="item-value">${napHtml}</span>
      </div>
      <div class="daily-today-item">
        <span class="item-label">Exercises</span>
        <span class="item-value">${exBadge}</span>
      </div>
      <div class="daily-today-item">
        <span class="item-label">Therapy video</span>
        <span class="item-value">${vidBadge}</span>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
// DAILY SHEET
// ─────────────────────────────────────────────
function initDailySheet() {
  // Sleep stepper
  document.getElementById('daily-sleep-minus').addEventListener('click', () => {
    state.dailySleepHours = Math.max(0, r1(state.dailySleepHours - 0.5));
    document.getElementById('daily-sleep-display').textContent = `${state.dailySleepHours} h`;
  });
  document.getElementById('daily-sleep-plus').addEventListener('click', () => {
    state.dailySleepHours = Math.min(12, r1(state.dailySleepHours + 0.5));
    document.getElementById('daily-sleep-display').textContent = `${state.dailySleepHours} h`;
  });

  // Sleep quality stars
  document.querySelectorAll('#daily-sleep-quality .star').forEach(btn => {
    btn.addEventListener('click', () => {
      state.dailySleepQuality = +btn.dataset.value;
      renderDailySleepStars();
    });
  });

  // Nap toggle
  document.getElementById('daily-nap-toggle').addEventListener('change', e => {
    state.dailyNapEnabled = e.target.checked;
    document.getElementById('daily-nap-wrap').style.display = state.dailyNapEnabled ? '' : 'none';
  });

  // Nap stepper
  document.getElementById('daily-nap-minus').addEventListener('click', () => {
    state.dailyNapHours = Math.max(0.5, r1(state.dailyNapHours - 0.5));
    document.getElementById('daily-nap-display').textContent = `${state.dailyNapHours} h`;
  });
  document.getElementById('daily-nap-plus').addEventListener('click', () => {
    state.dailyNapHours = Math.min(4, r1(state.dailyNapHours + 0.5));
    document.getElementById('daily-nap-display').textContent = `${state.dailyNapHours} h`;
  });

  // Exercises done checkbox → show/hide checklist
  document.getElementById('daily-exercises-done').addEventListener('change', e => {
    const wrap = document.getElementById('daily-exercise-checklist-wrap');
    wrap.style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('daily-save').addEventListener('click', saveDailySheet);
  document.getElementById('daily-cancel').addEventListener('click', closeSheet);
}

function openDailySheet(iso) {
  state.editingDate = iso;
  const existing = getDailyLog(iso);

  // Pre-fill or defaults
  state.dailySleepHours   = existing ? (existing.sleepHours   ?? 7)   : 7;
  state.dailySleepQuality = existing ? (existing.sleepQuality ?? 3)   : 3;
  state.dailyNapEnabled   = existing ? !!existing.napHours             : false;
  state.dailyNapHours     = existing ? (existing.napHours    ?? 1)    : 1;

  document.getElementById('daily-sheet-title').textContent =
    `Daily Log — ${isoToDate(iso).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}`;

  document.getElementById('daily-sleep-display').textContent = `${state.dailySleepHours} h`;
  renderDailySleepStars();
  document.getElementById('daily-sleep-notes').value = existing?.sleepNotes || '';

  const napToggle = document.getElementById('daily-nap-toggle');
  napToggle.checked = state.dailyNapEnabled;
  document.getElementById('daily-nap-display').textContent = `${state.dailyNapHours} h`;
  document.getElementById('daily-nap-wrap').style.display = state.dailyNapEnabled ? '' : 'none';

  const exDone  = existing?.exercisesDone ?? false;
  const vidDone = existing?.videoDone     ?? false;
  document.getElementById('daily-exercises-done').checked = exDone;
  document.getElementById('daily-video-done').checked     = vidDone;

  // Render exercise checklist
  const active  = getActiveExercises();
  const checked = existing?.exercisesChecked || active;
  const cl      = document.getElementById('daily-exercise-checklist');
  cl.innerHTML  = active.map(n => `
    <label class="exercise-check-item">
      <input type="checkbox" data-ex="${n}" ${checked.includes(n) ? 'checked' : ''} />
      Exercise ${n}
    </label>
  `).join('');
  document.getElementById('daily-exercise-checklist-wrap').style.display = exDone ? '' : 'none';

  openSheet('sheet-daily');
}

function renderDailySleepStars() {
  document.querySelectorAll('#daily-sleep-quality .star').forEach(s => {
    s.classList.toggle('lit', +s.dataset.value <= state.dailySleepQuality);
  });
}

function saveDailySheet() {
  const active   = getActiveExercises();
  const exChecks = [...document.querySelectorAll('#daily-exercise-checklist input[type=checkbox]')]
    .filter(c => c.checked)
    .map(c => +c.dataset.ex);

  const data = {
    sleepHours:       state.dailySleepHours,
    sleepQuality:     state.dailySleepQuality,
    sleepNotes:       document.getElementById('daily-sleep-notes').value.trim(),
    napHours:         state.dailyNapEnabled ? state.dailyNapHours : null,
    exercisesDone:    document.getElementById('daily-exercises-done').checked,
    videoDone:        document.getElementById('daily-video-done').checked,
    exercisesChecked: exChecks,
  };

  saveDailyLog(state.editingDate, data);
  closeSheet();
  renderDailyCalendar();
  if (state.editingDate === todayISO()) renderDailyTodaySummary();
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
// WEEKLY TAB
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────
function initWeeklyTab() {
  document.getElementById('week-prev').addEventListener('click', () => {
    const d = new Date(state.weekMonday);
    d.setDate(d.getDate() - 7);
    state.weekMonday = d;
    renderWeeklyTab();
  });
  document.getElementById('week-next').addEventListener('click', () => {
    const d = new Date(state.weekMonday);
    d.setDate(d.getDate() + 7);
    // Don't go past the current week
    const currentMonday = getMondayOfWeek(new Date());
    if (d <= currentMonday) {
      state.weekMonday = d;
      renderWeeklyTab();
    }
  });
  document.getElementById('btn-save-weekly').addEventListener('click', saveWeeklyTab);
}

function renderWeeklyTab() {
  const monday          = state.weekMonday;
  const weekKey         = isoWeekKey(monday);
  const existing        = getWeeklyScores(weekKey);
  const currentWeekKey  = isoWeekKey(getMondayOfWeek(new Date()));
  const isPastWeek      = weekKey !== currentWeekKey;
  // For past weeks use the exercises stored with that week; for current week use settings
  const storedEx        = existing._ex;
  const active          = (isPastWeek && Array.isArray(storedEx)) ? storedEx : getActiveExercises();

  document.getElementById('weekly-week-label').textContent = weekLabel(monday);

  const list    = document.getElementById('weekly-exercises-list');
  const noExMsg = document.getElementById('weekly-no-exercises');
  const saveBtn = document.getElementById('btn-save-weekly');

  if (!active.length) {
    list.innerHTML = '';
    noExMsg.style.display = '';
    saveBtn.style.display = 'none';
    return;
  }

  noExMsg.style.display = 'none';
  saveBtn.style.display = '';

  state.weeklySliders = {};
  list.innerHTML = active.map(n => {
    const val = existing[String(n)] ?? 0;
    state.weeklySliders[String(n)] = val;
    return `
      <div class="weekly-exercise-item">
        <div class="weekly-exercise-label">Exercise ${n}</div>
        <div class="weekly-score-row">
          <input type="range" class="weekly-score-slider" min="0" max="10" step="1"
            value="${val}" data-ex="${n}"
            aria-label="Exercise ${n} dizziness score" />
          <span class="weekly-score-value" id="weekly-val-${n}">${val}</span>
        </div>
      </div>
    `;
  }).join('');

  // Wire sliders
  list.querySelectorAll('.weekly-score-slider').forEach(sl => {
    sl.addEventListener('input', () => {
      const n   = sl.dataset.ex;
      const val = +sl.value;
      state.weeklySliders[n] = val;
      document.getElementById(`weekly-val-${n}`).textContent = val;
    });
  });

  renderWeeklyTrendChart();
}

function saveWeeklyTab() {
  const monday  = state.weekMonday;
  const weekKey = isoWeekKey(monday);
  saveWeeklyScores(weekKey, { ...state.weeklySliders, _ex: getActiveExercises() });
  renderWeeklyTrendChart();
  showModal('Saved', `Weekly scores saved for ${weekLabel(monday)}.`, null, true);
}

// Build a stable exercise→color map (Exercise N always gets color index N-1, regardless of active set)
function buildExerciseColorMap(active) {
  const map = {};
  active.forEach(n => { map[n] = EXERCISE_COLORS[(n - 1) % EXERCISE_COLORS.length]; });
  return map;
}

// Render clickable toggle pills for each exercise, wired to a hidden Set
function renderExerciseToggles(containerId, active, colorMap, hiddenSet, onRedraw) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!active.length) { el.innerHTML = ''; return; }

  el.innerHTML = active.map(n => {
    const isVisible = !hiddenSet.has(n);
    const color     = colorMap[n] || '#5f9ea8';
    return `
      <button class="ex-toggle-btn${isVisible ? ' active' : ''}"
              data-ex="${n}"
              style="--ex-color:${color}"
              type="button"
              aria-pressed="${isVisible}">
        <span class="ex-toggle-dot"></span>
        Ex ${n}
      </button>
    `;
  }).join('');

  el.querySelectorAll('.ex-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = +btn.dataset.ex;
      hiddenSet.has(n) ? hiddenSet.delete(n) : hiddenSet.add(n);
      onRedraw();
    });
  });
}

function renderWeeklyTrendChart() {
  const canvas   = document.getElementById('weekly-trend-chart');
  const emptyEl  = document.getElementById('weekly-chart-empty');
  const allKeys  = getAllWeeklyKeys();
  const active   = getAllTrackedExercises();
  const colorMap = buildExerciseColorMap(active);

  if (!canvas || !active.length || allKeys.length < 2) {
    if (emptyEl) emptyEl.style.display = '';
    if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); }
    renderExerciseToggles('weekly-exercise-toggles', [], colorMap, state.weeklyHiddenExercises, () => {});
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Build dataset: { weekKey: { exNum: score } } — scores only, no metadata
  const data = {};
  allKeys.forEach(wk => { data[wk] = getWeeklyScoresOnly(wk); });

  // Only draw visible exercises
  const visibleNums   = active.filter(n => !state.weeklyHiddenExercises.has(n));
  const visibleColors = visibleNums.map(n => colorMap[n]);

  drawMultiLineChart(canvas, allKeys, visibleNums, data, visibleColors,
    n => `Ex ${n}`, 10);

  renderExerciseToggles(
    'weekly-exercise-toggles', active, colorMap,
    state.weeklyHiddenExercises,
    renderWeeklyTrendChart
  );
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
// LOG TAB (Continuous Episodes)
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────
function initLogTab() {
  document.getElementById('log-date-prev').addEventListener('click', () => {
    const d = isoToDate(state.logDate);
    d.setDate(d.getDate() - 1);
    state.logDate = localISO(d);
    renderLogTimeline();
  });
  document.getElementById('log-date-next').addEventListener('click', () => {
    const d = isoToDate(state.logDate);
    d.setDate(d.getDate() + 1);
    const next = localISO(d);
    if (next <= todayISO()) {
      state.logDate = next;
      renderLogTimeline();
    }
  });
  document.getElementById('btn-add-episode').addEventListener('click', () => {
    openEpisodeSheet(null);
  });
  renderLogTimeline();
}

function renderLogTimeline() {
  const label     = document.getElementById('log-date-label');
  const container = document.getElementById('log-timeline');
  const iso       = state.logDate;
  const isToday   = iso === todayISO();

  label.textContent = isToday
    ? 'Today'
    : isoToDate(iso).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });

  const episodes = getDateEpisodes(iso).slice().reverse(); // newest first

  if (!episodes.length) {
    container.innerHTML = '<p class="empty-state">No episodes for this day. Tap + Episode to log.</p>';
    return;
  }

  container.innerHTML = episodes.map(ep => {
    const { icon, main, sub } = episodeDisplay(ep);
    return `
      <div class="timeline-entry">
        <span class="entry-icon">${icon}</span>
        <div class="entry-body">
          <div class="entry-main">${main}</div>
          ${sub ? `<div class="entry-sub">${sub}</div>` : ''}
        </div>
        <div class="entry-meta">
          <span class="entry-time">${ep.time || ''}</span>
          <div class="entry-actions">
            <button class="entry-edit"  data-id="${ep.id}" type="button" aria-label="Edit">✎</button>
            <button class="entry-delete" data-id="${ep.id}" type="button" aria-label="Delete">✕</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.entry-edit').forEach(btn => {
    btn.addEventListener('click', () => openEpisodeSheet(btn.dataset.id));
  });
  container.querySelectorAll('.entry-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      showModal('Delete episode?', 'This cannot be undone.', () => {
        deleteEpisode(btn.dataset.id);
        renderLogTimeline();
      });
    });
  });
}

function episodeDisplay(ep) {
  if (ep.type === 'dizziness') {
    const act = ep.activity ? (ACTIVITY_LABELS[ep.activity] || ep.activity) : '';
    return {
      icon: '🌀',
      main: `Dizziness ${ep.intensity}/10${act ? ' · ' + act : ''}`,
      sub:  ep.stress ? `Stress ${ep.stress}/10${ep.notes ? ' · ' + ep.notes : ''}` : ep.notes || '',
    };
  }
  if (ep.type === 'meditation') {
    return { icon: '🧘', main: 'Meditation', sub: ep.notes || '' };
  }
  if (ep.type === 'walk') {
    return { icon: '🚶', main: 'Walk', sub: ep.notes || '' };
  }
  if (ep.type === 'nap') {
    return { icon: '😴', main: `Nap · ${ep.duration || ep.hours || 0}h`, sub: ep.notes || '' };
  }
  // Legacy sleep type
  if (ep.type === 'sleep') {
    const t = ep.sleepType === 'night' ? 'Night sleep' : 'Nap';
    const stars = ep.quality ? '★'.repeat(ep.quality) + '☆'.repeat(5-ep.quality) : '';
    return { icon: '🌙', main: `${t} · ${ep.hours}h${stars ? ' · ' + stars : ''}`, sub: ep.notes || '' };
  }
  return { icon: '📌', main: ep.type || 'Entry', sub: ep.notes || '' };
}

// ─────────────────────────────────────────────
// EPISODE SHEET
// ─────────────────────────────────────────────
function initEpisodeSheet() {
  // Build activity chips
  const chipGrid = document.getElementById('ep-activity-chips');
  chipGrid.innerHTML = NEW_ACTIVITIES.map(act => `
    <button class="chip" data-activity="${act}" type="button">${ACTIVITY_LABELS[act]}</button>
  `).join('');

  // Type selector
  document.querySelectorAll('#ep-type-selector .type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.episodeType = btn.dataset.type;
      document.querySelectorAll('#ep-type-selector .type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateEpisodeFields();
    });
  });

  // Intensity slider
  const intSlider = document.getElementById('ep-intensity');
  const intBadge  = document.getElementById('ep-intensity-badge');
  intSlider.addEventListener('input', () => {
    const v = +intSlider.value;
    intBadge.textContent      = v;
    intBadge.style.background = dizColor(v);
  });

  // Stress slider
  const stressSlider = document.getElementById('ep-stress');
  const stressBadge  = document.getElementById('ep-stress-badge');
  stressSlider.addEventListener('input', () => {
    stressBadge.textContent = stressSlider.value;
  });

  // Activity chips (single-select)
  chipGrid.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const act = chip.dataset.activity;
      if (state.epSelectedActivity === act) {
        chip.classList.remove('selected');
        state.epSelectedActivity = null;
      } else {
        chipGrid.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        state.epSelectedActivity = act;
      }
    });
  });

  // Nap stepper
  document.getElementById('ep-nap-minus').addEventListener('click', () => {
    state.epNapHours = Math.max(0.5, r1(state.epNapHours - 0.5));
    document.getElementById('ep-nap-display').textContent = `${state.epNapHours} h`;
  });
  document.getElementById('ep-nap-plus').addEventListener('click', () => {
    state.epNapHours = Math.min(4, r1(state.epNapHours + 0.5));
    document.getElementById('ep-nap-display').textContent = `${state.epNapHours} h`;
  });

  document.getElementById('ep-save').addEventListener('click', saveEpisodeSheet);
  document.getElementById('ep-cancel').addEventListener('click', closeSheet);
}

function openEpisodeSheet(editId) {
  state.editingEpisodeId = editId;
  const isEdit  = !!editId;
  const existing = isEdit ? getEpisodes().find(e => e.id === editId) : null;

  document.getElementById('ep-sheet-title').textContent = isEdit ? 'Edit Episode' : 'Log Episode';

  // Set type
  state.episodeType = existing ? existing.type : 'dizziness';
  // If editing a legacy 'sleep' type, show as-is but don't crash
  const validType = ['dizziness','meditation','walk','nap'].includes(state.episodeType)
    ? state.episodeType : 'dizziness';
  state.episodeType = validType;

  document.querySelectorAll('#ep-type-selector .type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === validType);
  });

  // Time
  document.getElementById('ep-time').value = existing?.time || nowTimeString();

  // Dizziness fields
  const intV = existing?.intensity ?? 5;
  document.getElementById('ep-intensity').value = intV;
  const intBadge = document.getElementById('ep-intensity-badge');
  intBadge.textContent = intV;
  intBadge.style.background = dizColor(intV);

  const stV = existing?.stress ?? 5;
  document.getElementById('ep-stress').value = stV;
  document.getElementById('ep-stress-badge').textContent = stV;

  // Activity chips
  state.epSelectedActivity = existing?.activity || null;
  document.querySelectorAll('#ep-activity-chips .chip').forEach(c => {
    c.classList.toggle('selected', c.dataset.activity === state.epSelectedActivity);
  });

  document.getElementById('ep-notes-diz').value = existing?.notes || '';

  // Nap
  state.epNapHours = existing?.duration ?? 1;
  document.getElementById('ep-nap-display').textContent = `${state.epNapHours} h`;
  document.getElementById('ep-notes-nap').value = existing?.notes || '';

  // Simple (meditation/walk)
  document.getElementById('ep-notes-simple').value = existing?.notes || '';

  updateEpisodeFields();
  openSheet('sheet-episode');
}

function updateEpisodeFields() {
  const t = state.episodeType;
  document.getElementById('ep-dizziness-fields').style.display = t === 'dizziness' ? '' : 'none';
  document.getElementById('ep-nap-fields').style.display       = t === 'nap'       ? '' : 'none';
  document.getElementById('ep-simple-fields').style.display    = (t === 'meditation' || t === 'walk') ? '' : 'none';
}

function saveEpisodeSheet() {
  const t    = state.episodeType;
  const time = document.getElementById('ep-time').value || nowTimeString();
  const date = state.logDate;

  let ep;
  if (t === 'dizziness') {
    ep = {
      id:        state.editingEpisodeId || genId('ep'),
      type:      'dizziness',
      date,
      timestamp: state.editingEpisodeId
        ? (getEpisodes().find(e => e.id === state.editingEpisodeId)?.timestamp ?? Date.now())
        : Date.now(),
      time,
      intensity: +document.getElementById('ep-intensity').value,
      stress:    +document.getElementById('ep-stress').value,
      activity:  state.epSelectedActivity || '',
      notes:     document.getElementById('ep-notes-diz').value.trim(),
    };
  } else if (t === 'nap') {
    ep = {
      id:        state.editingEpisodeId || genId('ep'),
      type:      'nap',
      date,
      timestamp: Date.now(),
      time,
      duration:  state.epNapHours,
      notes:     document.getElementById('ep-notes-nap').value.trim(),
    };
  } else {
    ep = {
      id:        state.editingEpisodeId || genId('ep'),
      type:      t, // 'meditation' | 'walk'
      date,
      timestamp: Date.now(),
      time,
      notes:     document.getElementById('ep-notes-simple').value.trim(),
    };
  }

  if (state.editingEpisodeId) updateEpisode(ep);
  else addEpisode(ep);

  closeSheet();
  renderLogTimeline();
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
// SETTINGS SHEET
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────
function initSettingsSheet() {
  document.getElementById('settings-save').addEventListener('click', saveSettings_);
  document.getElementById('settings-cancel').addEventListener('click', closeSheet);
}

function openSettings() {
  const active = getActiveExercises();
  const grid   = document.getElementById('settings-exercise-grid');

  grid.innerHTML = '';
  for (let n = 1; n <= 12; n++) {
    const isActive = active.includes(n);
    const div = document.createElement('div');
    div.className = `settings-exercise-item${isActive ? ' selected' : ''}`;
    div.dataset.ex = n;
    div.textContent = `Ex ${n}`;
    div.setAttribute('role', 'checkbox');
    div.setAttribute('aria-checked', String(isActive));
    div.addEventListener('click', () => {
      div.classList.toggle('selected');
      div.setAttribute('aria-checked', String(div.classList.contains('selected')));
    });
    grid.appendChild(div);
  }

  openSheet('sheet-settings');
}

function saveSettings_() {
  const selected = [...document.querySelectorAll('.settings-exercise-item.selected')]
    .map(el => +el.dataset.ex)
    .sort((a,b) => a-b);
  saveSettings({ activeExercises: selected });
  closeSheet();
  // Refresh weekly tab if visible
  if (state.currentView === 'weekly') renderWeeklyTab();
  if (state.currentView === 'daily')  { renderDailyCalendar(); renderDailyTodaySummary(); }
}

// ─────────────────────────────────────────────
// Sheet open/close
// ─────────────────────────────────────────────
function openSheet(id) {
  state.activeSheet = id;
  document.getElementById('sheet-overlay').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function closeSheet() {
  if (state.activeSheet) {
    document.getElementById(state.activeSheet).classList.add('hidden');
    state.activeSheet = null;
  }
  document.getElementById('sheet-overlay').classList.add('hidden');
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
// INSIGHTS TAB
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────
function initInsightsTab() {
  document.querySelectorAll('#insights-range-btns .range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#insights-range-btns .range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.insightsDays = +btn.dataset.days;
      renderInsights();
    });
  });
}

function renderInsights() {
  renderDizzyTrendChart();
  renderAvgDizzyTrendChart();
  renderSleepDizChart();
  renderActivityChart();
  renderTodChart();
  renderComplianceStreak();
  renderExerciseTrendsChart();
}

// ── 1. Dizziness Trend (total per day) ──────────────────────
function renderDizzyTrendChart() {
  const canvas = document.getElementById('diz-trend-chart');
  if (!canvas) return;
  const days = state.insightsDays;

  const now   = new Date();
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(localISO(d));
  }

  const dayMap = {};
  getEpisodes().filter(e => e.type === 'dizziness').forEach(e => {
    if (!dayMap[e.date]) dayMap[e.date] = [];
    dayMap[e.date].push(e.intensity);
  });

  const points = dates.map(iso => ({
    iso,
    val: dayMap[iso] ? dayMap[iso].reduce((s, v) => s + v, 0) : null,
  }));

  const maxVal = Math.max(10, ...points.filter(p => p.val !== null).map(p => p.val));
  const yMax   = Math.ceil(maxVal / 5) * 5;
  drawLineChart(canvas, points, { yMin: 0, yMax });
}

// ── 1b. Average Dizziness Trend ──────────────────────────────
function renderAvgDizzyTrendChart() {
  const canvas = document.getElementById('avg-diz-trend-chart');
  if (!canvas) return;
  const days = state.insightsDays;

  const now   = new Date();
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(localISO(d));
  }

  const dayMap = {};
  getEpisodes().filter(e => e.type === 'dizziness').forEach(e => {
    if (!dayMap[e.date]) dayMap[e.date] = [];
    dayMap[e.date].push(e.intensity);
  });

  const points = dates.map(iso => ({
    iso,
    val: dayMap[iso] ? r1(mean(dayMap[iso])) : null,
  }));

  drawLineChart(canvas, points, { yMin: 1, yMax: 10 });
}

// ── 2. Sleep vs Next-Day Dizziness ──────────
function renderSleepDizChart() {
  const canvas = document.getElementById('sleep-diz-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Build: date → { sleepHours, nextDayDizziness }
  // Use daily log for sleep, episodes for next-day dizziness
  const dailyKeys = getAllDailyKeys();
  const allEps    = getEpisodes().filter(e => e.type === 'dizziness');
  const dayDizMap = {};
  allEps.forEach(e => {
    if (!dayDizMap[e.date]) dayDizMap[e.date] = [];
    dayDizMap[e.date].push(e.intensity);
  });

  const logs = [];
  dailyKeys.forEach(iso => {
    const log = getDailyLog(iso);
    if (!log || !log.sleepHours) return;
    // Find next day
    const d = isoToDate(iso);
    d.setDate(d.getDate() + 1);
    const next = localISO(d);
    if (dayDizMap[next] && dayDizMap[next].length) {
      logs.push({
        sleepHours: log.sleepHours,
        dizziness:  r1(mean(dayDizMap[next])),
      });
    }
  });

  drawScatterChart(canvas, logs, { yMin: 1, yMax: 10, yLabel: 'Next-day avg dizziness' });
}

// ── 3. Activity Patterns ────────────────────
function renderActivityChart() {
  const canvas = document.getElementById('activity-chart');
  if (!canvas) return;

  const eps = getEpisodesInRange(state.insightsDays)
    .filter(e => e.type === 'dizziness' && e.activity);

  if (!eps.length) {
    drawEmptyChart(canvas, 'Log dizziness episodes with activities to see this chart.');
    return;
  }

  const byAct = {};
  eps.forEach(e => {
    if (!byAct[e.activity]) byAct[e.activity] = [];
    byAct[e.activity].push(e.intensity);
  });

  const sorted = Object.entries(byAct)
    .map(([act, vals]) => ({ label: (ACTIVITY_LABELS[act] || act).replace(/^\S+\s/, ''), val: r1(mean(vals)) }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 12);

  drawHorizontalBarChart(canvas, sorted, 10);
}

// ── 4. Time of Day ──────────────────────────
function renderTodChart() {
  const canvas = document.getElementById('tod-chart');
  if (!canvas) return;

  const eps = getEpisodesInRange(state.insightsDays)
    .filter(e => e.type === 'dizziness' && e.time);

  const buckets = { Morning: [], Afternoon: [], Evening: [], Night: [] };
  eps.forEach(e => {
    const h = parseInt(e.time.split(':')[0], 10);
    if      (h >= 6  && h < 12) buckets.Morning.push(e.intensity);
    else if (h >= 12 && h < 17) buckets.Afternoon.push(e.intensity);
    else if (h >= 17 && h < 21) buckets.Evening.push(e.intensity);
    else                         buckets.Night.push(e.intensity);
  });

  const bars = ['Morning','Afternoon','Evening','Night'].map(k => ({
    label: k,
    val: buckets[k].length ? r1(mean(buckets[k])) : 0,
  })).filter(b => b.val > 0);

  if (!bars.length) {
    drawEmptyChart(canvas, 'Log more episodes to see time-of-day patterns.');
    return;
  }

  drawVerticalBarChart(canvas, bars, 10);
}

// ── 5. Compliance Streak + Heatmap ──────────
function renderComplianceStreak() {
  const today = todayISO();
  const allDaily = getAllDailyKeys();

  // Current streak: consecutive days (going backwards from today) with both tasks done
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = localISO(d);
    const log = getDailyLog(iso);
    if (log && log.exercisesDone && log.videoDone) streak++;
    else break;
  }

  // Best streak ever
  let bestStreak = 0, cur = 0;
  const sortedKeys = getAllDailyKeys().sort();
  // Fill gaps — build continuous sequence
  if (sortedKeys.length) {
    const start = isoToDate(sortedKeys[0]);
    const end   = isoToDate(today);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = localISO(d);
      const log = getDailyLog(iso);
      if (log && log.exercisesDone && log.videoDone) {
        cur++;
        bestStreak = Math.max(bestStreak, cur);
      } else {
        cur = 0;
      }
    }
  }

  const display = document.getElementById('compliance-streak-display');
  display.innerHTML = `
    <div class="streak-stat">
      <div class="streak-value">${streak}</div>
      <div class="streak-label">Current streak</div>
    </div>
    <div class="streak-stat">
      <div class="streak-value">${bestStreak}</div>
      <div class="streak-label">Best streak</div>
    </div>
    <div class="streak-stat">
      <div class="streak-value">${allDaily.length}</div>
      <div class="streak-label">Days logged</div>
    </div>
  `;

  drawComplianceHeatmap(document.getElementById('compliance-heatmap'));
}

function drawComplianceHeatmap(canvas) {
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const dpr  = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W    = wrap.clientWidth  || 320;
  const H    = wrap.clientHeight || 110;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // 13 weeks (columns) × 7 days (rows), oldest week left
  const COLS = 13, ROWS = 7;
  const padL = 26, padT = 16, padR = 4, padB = 4;
  const cW   = (W - padL - padR) / COLS;
  const cH   = (H - padT - padB) / ROWS;
  const gap  = 2;
  const cellW = cW - gap;
  const cellH = cH - gap;

  // Build date list: 91 days ending today
  const today = new Date();
  const dates = [];
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(localISO(d));
  }

  // Day-of-week labels
  ctx.fillStyle = '#9ab4ba';
  ctx.font      = `${9 * (dpr > 1 ? 1 : 1)}px -apple-system, sans-serif`;
  ctx.textAlign = 'right';
  ['M','T','W','T','F','S','S'].forEach((l, row) => {
    ctx.fillText(l, padL - 4, padT + row * cH + cellH / 2 + 3);
  });

  // Draw cells
  dates.forEach((iso, idx) => {
    const col = Math.floor(idx / 7);
    const row = idx % 7;
    const log = getDailyLog(iso);
    const x   = padL + col * cW;
    const y   = padT + row * cH;

    let fill;
    if (!log) {
      fill = '#eef4f6';
    } else if (log.exercisesDone && log.videoDone) {
      fill = '#4aaa6a';
    } else if (log.exercisesDone || log.videoDone) {
      fill = '#e6a817';
    } else {
      fill = '#c0392b';
    }

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(x, y, cellW, cellH, 2)
      : ctx.rect(x, y, cellW, cellH);
    ctx.fill();
  });
}

// ── 6. Weekly Exercise Score Trends ─────────
function renderExerciseTrendsChart() {
  const canvas   = document.getElementById('exercise-trends-chart');
  const emptyEl  = document.getElementById('exercise-trends-empty');
  const allKeys  = getAllWeeklyKeys();
  const active   = getAllTrackedExercises();
  const colorMap = buildExerciseColorMap(active);

  if (!canvas || !active.length || allKeys.length < 2) {
    if (emptyEl) emptyEl.style.display = '';
    if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); }
    renderExerciseToggles('insights-exercise-toggles', [], colorMap, state.insightsHiddenExercises, () => {});
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const data = {};
  allKeys.forEach(wk => { data[wk] = getWeeklyScoresOnly(wk); });

  const visibleNums   = active.filter(n => !state.insightsHiddenExercises.has(n));
  const visibleColors = visibleNums.map(n => colorMap[n]);

  drawMultiLineChart(canvas, allKeys, visibleNums, data, visibleColors,
    n => `Ex ${n}`, 10);

  renderExerciseToggles(
    'insights-exercise-toggles', active, colorMap,
    state.insightsHiddenExercises,
    renderExerciseTrendsChart
  );
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
// CANVAS CHART HELPERS
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────

function setupCanvas(canvas) {
  const dpr  = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W    = wrap.clientWidth  || 300;
  const H    = wrap.clientHeight || 180;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H };
}

function drawEmptyChart(canvas, msg) {
  const { ctx, W, H } = setupCanvas(canvas);
  ctx.fillStyle = '#9ab4ba';
  ctx.font      = '13px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(msg, W / 2, H / 2);
}

// Line chart: points = [{iso, val|null}]
function drawLineChart(canvas, points, opts = {}) {
  const { ctx, W, H } = setupCanvas(canvas);
  const { yMin = 1, yMax = 10 } = opts;
  const P    = { t: 14, r: 14, b: 36, l: 32 };
  const cW   = W - P.l - P.r;
  const cH   = H - P.t - P.b;
  const n    = points.length;

  const toX = i  => P.l + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const toY = v  => P.t + cH - ((v - yMin) / (yMax - yMin)) * cH;

  // Gridlines + Y labels (dynamic ticks)
  const gridTicks = yMax <= 10
    ? [2, 4, 6, 8, 10]
    : Array.from({ length: 5 }, (_, i) => Math.round((i + 1) * yMax / 5));
  ctx.strokeStyle = '#dce8eb';
  ctx.lineWidth   = 1;
  ctx.font        = '10px -apple-system, sans-serif';
  ctx.fillStyle   = '#9ab4ba';
  ctx.textAlign   = 'right';
  gridTicks.forEach(v => {
    const y = toY(v);
    ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + cW, y); ctx.stroke();
    ctx.fillText(v, P.l - 5, y + 4);
  });

  const withVal = points.map((p, i) => ({ ...p, i })).filter(p => p.val !== null);

  // Filled area
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
      started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), (started = true));
    });
    ctx.stroke();
  }

  // Dots
  withVal.forEach(({ i, val }) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(val), 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#fff';
    ctx.strokeStyle = '#5f9ea8';
    ctx.lineWidth   = 2;
    ctx.fill(); ctx.stroke();
  });

  // X labels
  ctx.fillStyle = '#9ab4ba'; ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(n / 5));
  points.forEach(({ iso }, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    ctx.fillText(formatShort(iso), toX(i), H - P.b + 18);
  });
}

// Scatter chart for sleep vs next-day dizziness
function drawScatterChart(canvas, logs, opts = {}) {
  const { ctx, W, H } = setupCanvas(canvas);

  if (logs.length < 3) {
    ctx.fillStyle = '#9ab4ba';
    ctx.font      = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Log sleep + episodes on the same day to see this.', W / 2, H / 2);
    return;
  }

  const P      = { t: 14, r: 14, b: 36, l: 36 };
  const cW     = W - P.l - P.r;
  const cH     = H - P.t - P.b;
  const maxH   = 12;
  const yMin   = opts.yMin   ?? 1;
  const yMax   = opts.yMax   ?? 10;
  const yLabel = opts.yLabel ?? 'Next-day dizziness';
  const yRange = yMax - yMin;

  const toX = h => P.l + (Math.min(h, maxH) / maxH) * cW;
  const toY = v => P.t + cH - ((Math.min(v, yMax) - yMin) / yRange) * cH;

  // Dynamic gridlines
  const gridTicks = yMax <= 10
    ? [2, 4, 6, 8, 10]
    : Array.from({ length: 5 }, (_, i) => Math.round((i + 1) * yMax / 5));

  ctx.strokeStyle = '#dce8eb'; ctx.lineWidth = 1;
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = '#9ab4ba'; ctx.textAlign = 'right';
  gridTicks.forEach(v => {
    const y = toY(v);
    ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + cW, y); ctx.stroke();
    ctx.fillText(v, P.l - 5, y + 4);
  });
  ctx.textAlign = 'center';
  [0, 3, 6, 9, 12].forEach(h => ctx.fillText(`${h}h`, toX(h), H - P.b + 16));
  ctx.fillText('Sleep hours →', P.l + cW / 2, H - 2);

  ctx.save(); ctx.translate(11, P.t + cH / 2); ctx.rotate(-Math.PI / 2);
  ctx.font = '10px -apple-system, sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#9ab4ba'; ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  logs.forEach(l => {
    ctx.beginPath();
    ctx.arc(toX(l.sleepHours), toY(l.dizziness), 6, 0, Math.PI * 2);
    ctx.globalAlpha  = 0.72;
    ctx.fillStyle    = dizColor(Math.min(10, (l.dizziness / yMax) * 10));
    ctx.fill();
    ctx.globalAlpha  = 1;
    ctx.strokeStyle  = 'rgba(255,255,255,0.8)';
    ctx.lineWidth    = 1.5;
    ctx.stroke();
  });

  if (logs.length >= 5) {
    const xs = logs.map(l => Math.min(l.sleepHours, maxH));
    const ys = logs.map(l => l.dizziness);
    const n  = xs.length;
    const sx = xs.reduce((a,b) => a+b, 0), sy = ys.reduce((a,b) => a+b, 0);
    const sxy = xs.reduce((a,x,i) => a + x*ys[i], 0);
    const sxx = xs.reduce((a,x) => a + x*x, 0);
    const den = n * sxx - sx * sx;
    if (Math.abs(den) > 0.001) {
      const m = (n * sxy - sx * sy) / den;
      const b = (sy - m * sx) / n;
      ctx.beginPath();
      ctx.moveTo(toX(0),    toY(Math.max(yMin, Math.min(yMax, b))));
      ctx.lineTo(toX(maxH), toY(Math.max(yMin, Math.min(yMax, m * maxH + b))));
      ctx.strokeStyle = 'rgba(95,158,168,0.55)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4,4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// Horizontal bar chart: bars = [{label, val}], maxVal
function drawHorizontalBarChart(canvas, bars, maxVal) {
  const { ctx, W, H } = setupCanvas(canvas);
  if (!bars.length) {
    drawEmptyChart(canvas, 'No data yet.');
    return;
  }

  const n      = bars.length;
  const labelW = 130;
  const valW   = 36;
  const padT   = 8, padB = 8, padR = 8;
  const barH   = Math.max(14, Math.min(22, (H - padT - padB) / n - 4));
  const gap    = (H - padT - padB - n * barH) / Math.max(n - 1, 1);
  const trackW = W - labelW - valW - padR;

  ctx.font      = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#2d3f45';
  ctx.textAlign = 'right';

  bars.forEach(({ label, val }, i) => {
    const y = padT + i * (barH + gap);

    // Label
    ctx.fillStyle = '#6e8a90';
    ctx.font      = '11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(label, labelW - 8, y + barH / 2 + 4);

    // Track
    ctx.fillStyle = '#eef4f6';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(labelW, y, trackW, barH, 3)
                  : ctx.rect(labelW, y, trackW, barH);
    ctx.fill();

    // Bar
    const fillW = Math.max(4, (val / maxVal) * trackW);
    ctx.fillStyle = '#5f9ea8';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(labelW, y, fillW, barH, 3)
                  : ctx.rect(labelW, y, fillW, barH);
    ctx.fill();

    // Value
    ctx.fillStyle = '#4a8291';
    ctx.textAlign = 'left';
    ctx.font      = '11px -apple-system, sans-serif';
    ctx.fillText(val, labelW + trackW + 4, y + barH / 2 + 4);
  });
}

// Vertical bar chart: bars = [{label, val}], maxVal
function drawVerticalBarChart(canvas, bars, maxVal) {
  const { ctx, W, H } = setupCanvas(canvas);
  if (!bars.length) return;

  const P  = { t: 14, r: 14, b: 40, l: 32 };
  const cW = W - P.l - P.r;
  const cH = H - P.t - P.b;
  const n  = bars.length;
  const bW = Math.min(60, (cW / n) * 0.6);

  // Gridlines
  ctx.strokeStyle = '#dce8eb'; ctx.lineWidth = 1;
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = '#9ab4ba'; ctx.textAlign = 'right';
  [2, 4, 6, 8, 10].forEach(v => {
    const y = P.t + cH - (v / maxVal) * cH;
    ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + cW, y); ctx.stroke();
    ctx.fillText(v, P.l - 5, y + 4);
  });

  bars.forEach(({ label, val }, i) => {
    const x  = P.l + (i + 0.5) * (cW / n) - bW / 2;
    const bH = (val / maxVal) * cH;
    const y  = P.t + cH - bH;

    ctx.fillStyle = '#5f9ea8';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, bW, bH, 4)
                  : ctx.rect(x, y, bW, bH);
    ctx.fill();

    ctx.fillStyle = '#9ab4ba'; ctx.textAlign = 'center';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText(label, P.l + (i + 0.5) * (cW / n), H - P.b + 16);

    if (val > 0) {
      ctx.fillStyle = '#4a8291';
      ctx.fillText(val, P.l + (i + 0.5) * (cW / n), y - 4);
    }
  });
}

// Multi-line chart: weekKeys[], exNums[], data {weekKey: {exNum: score}}, colors[], labelFn, maxVal
function drawMultiLineChart(canvas, weekKeys, exNums, data, colors, labelFn, maxVal) {
  const { ctx, W, H } = setupCanvas(canvas);
  if (!weekKeys.length || !exNums.length) return;

  const P  = { t: 14, r: 14, b: 46, l: 32 };
  const cW = W - P.l - P.r;
  const cH = H - P.t - P.b;
  const n  = weekKeys.length;

  const toX = i => P.l + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const toY = v => P.t + cH - (v / maxVal) * cH;

  // Gridlines
  ctx.strokeStyle = '#dce8eb'; ctx.lineWidth = 1;
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = '#9ab4ba'; ctx.textAlign = 'right';
  [2, 4, 6, 8, 10].forEach(v => {
    const y = toY(v);
    ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + cW, y); ctx.stroke();
    ctx.fillText(v, P.l - 5, y + 4);
  });

  // Draw one line per exercise
  exNums.forEach((exN, ei) => {
    const color = colors[ei % colors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    let started = false;
    weekKeys.forEach((wk, i) => {
      const scores = data[wk] || {};
      const val    = scores[String(exN)];
      if (val === undefined || val === null) { started = false; return; }
      const x = toX(i), y = toY(val);
      started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), (started = true));
    });
    ctx.stroke();

    // Dots
    weekKeys.forEach((wk, i) => {
      const scores = data[wk] || {};
      const val    = scores[String(exN)];
      if (val === undefined || val === null) return;
      ctx.beginPath();
      ctx.arc(toX(i), toY(val), 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  });

  // X labels (sparse)
  ctx.fillStyle = '#9ab4ba'; ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(n / 5));
  weekKeys.forEach((wk, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    ctx.fillText(wk, toX(i), H - P.b + 16);
  });

  // Legend
  const legX    = P.l;
  const legY    = H - P.b + 28;
  const legStep = Math.max(30, cW / exNums.length);
  ctx.font = '9px -apple-system, sans-serif';
  exNums.forEach((exN, ei) => {
    const x = legX + ei * legStep;
    if (x + 26 > W) return; // don't overflow
    ctx.fillStyle = colors[ei % colors.length];
    ctx.fillRect(x, legY - 8, 12, 8);
    ctx.fillStyle = '#9ab4ba';
    ctx.textAlign = 'left';
    ctx.fillText(labelFn(exN), x + 14, legY);
  });
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
// EXPORT TAB
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────
function initExport() {
  document.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const days = +btn.dataset.days;
      if (type === 'episodes') exportEpisodesCSV(days);
      else if (type === 'daily')   exportDailyCSV(days);
      else if (type === 'weekly')  exportWeeklyCSV();
    });
  });

  document.getElementById('backup-btn').addEventListener('click', backupAllData);

  document.getElementById('restore-btn').addEventListener('click', () => {
    const file = document.getElementById('restore-file-input').files[0];
    if (!file) {
      showModal('No File Selected', 'Please choose a backup JSON file first.', null, true);
      return;
    }
    showModal(
      'Restore Data?',
      'This will merge the backup into your current data. Existing entries with the same keys will be overwritten. Continue?',
      () => restoreFromBackup(file)
    );
  });

  document.getElementById('clear-data-btn').addEventListener('click', () => {
    showModal(
      'Clear All Data?',
      'This will permanently delete all episodes, daily logs, and weekly scores from this device. This cannot be undone.',
      () => {
        // Clear all pppd_ keys
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('pppd_')) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
        renderExportStats();
        renderDailyCalendar();
        renderDailyTodaySummary();
        showModal('Done', 'All data has been cleared.', null, true);
      }
    );
  });
}

function backupAllData() {
  const backup = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('pppd_')) backup[k] = localStorage.getItem(k);
  }
  if (!Object.keys(backup).length) {
    showModal('Nothing to Backup', 'No data found to back up.', null, true);
    return;
  }
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `pppd-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function restoreFromBackup(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      let count = 0;
      for (const [k, v] of Object.entries(data)) {
        if (k.startsWith('pppd_')) {
          localStorage.setItem(k, v);
          count++;
        }
      }
      document.getElementById('restore-file-input').value = '';
      renderExportStats();
      renderDailyCalendar();
      renderDailyTodaySummary();
      showModal('Restore Complete', `${count} data entries restored successfully.`, null, true);
    } catch {
      showModal('Restore Failed', 'The file could not be read. Make sure it is a valid PPPD backup file.', null, true);
    }
  };
  reader.readAsText(file);
}

function renderExportStats() {
  const el       = document.getElementById('data-stats');
  const episodes = getEpisodes();
  const dailyK   = getAllDailyKeys();
  const weeklyK  = getAllWeeklyKeys();

  if (!episodes.length && !dailyK.length && !weeklyK.length) {
    el.textContent = 'No data logged yet.';
    return;
  }

  const dizzy = episodes.filter(e => e.type === 'dizziness');
  const first = episodes.length ? episodes[0].date : (dailyK[0] || '—');
  const last  = episodes.length ? episodes[episodes.length - 1].date : (dailyK[dailyK.length - 1] || '—');

  el.innerHTML = `
    <strong>${dizzy.length}</strong> dizziness episodes ·
    <strong>${episodes.length}</strong> total log entries<br>
    <strong>${dailyK.length}</strong> daily log entries ·
    <strong>${weeklyK.length}</strong> weekly score entries<br>
    From <strong>${first !== '—' ? formatShort(first) : '—'}</strong> to
    <strong>${last  !== '—' ? formatShort(last)  : '—'}</strong>
  `;
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportEpisodesCSV(days) {
  const entries = getEpisodesInRange(days).filter(e => e.type !== 'sleep');
  if (!entries.length) {
    showModal('Nothing to Export', 'No episodes found for this time period.', null, true);
    return;
  }
  const header = ['Date','Time','Type','Intensity','Stress','Activity','Duration (h)','Notes'];
  const rows = entries.map(e => [
    e.date,
    e.time || '',
    e.type,
    e.intensity || '',
    e.stress    || '',
    e.activity  ? (ACTIVITY_LABELS[e.activity] || e.activity).replace(/^\S+\s/, '') : '',
    e.duration  || '',
    csvEscape(e.notes || ''),
  ]);
  const csv   = [header, ...rows].map(r => r.join(',')).join('\r\n');
  const label = days === 0 ? 'all-time' : `${days}d`;
  downloadCSV(csv, `pppd-episodes-${label}-${todayISO()}.csv`);
}

function exportDailyCSV(days) {
  let keys = getAllDailyKeys();
  if (days > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffISO = localISO(cutoff);
    keys = keys.filter(k => k >= cutoffISO);
  }
  if (!keys.length) {
    showModal('Nothing to Export', 'No daily log entries found.', null, true);
    return;
  }
  const header = ['Date','Sleep Hours','Sleep Quality','Sleep Notes','Nap Hours','Exercises Done','Video Done','Exercises Completed'];
  const rows = keys.map(iso => {
    const log = getDailyLog(iso) || {};
    return [
      iso,
      log.sleepHours    ?? '',
      log.sleepQuality  ?? '',
      csvEscape(log.sleepNotes || ''),
      log.napHours      ?? '',
      log.exercisesDone ? 'Yes' : 'No',
      log.videoDone     ? 'Yes' : 'No',
      csvEscape((log.exercisesChecked || []).map(n => `Exercise ${n}`).join('; ')),
    ];
  });
  const csv   = [header, ...rows].map(r => r.join(',')).join('\r\n');
  const label = days === 0 ? 'all-time' : `${days}d`;
  downloadCSV(csv, `pppd-daily-${label}-${todayISO()}.csv`);
}

function exportWeeklyCSV() {
  const keys = getAllWeeklyKeys();
  if (!keys.length) {
    showModal('Nothing to Export', 'No weekly scores logged yet.', null, true);
    return;
  }
  // Collect all exercise numbers seen (exclude metadata keys)
  const allNums = new Set();
  keys.forEach(wk => {
    const scores = getWeeklyScoresOnly(wk);
    Object.keys(scores).forEach(n => allNums.add(n));
  });
  const numsSorted = [...allNums].map(Number).sort((a,b) => a-b).map(String);

  const header = ['Week', ...numsSorted.map(n => `Exercise ${n}`)];
  const rows   = keys.map(wk => {
    const scores = getWeeklyScoresOnly(wk);
    return [wk, ...numsSorted.map(n => scores[n] ?? '')];
  });
  const csv = [header, ...rows].map(r => r.join(',')).join('\r\n');
  downloadCSV(csv, `pppd-weekly-${todayISO()}.csv`);
}

// ─────────────────────────────────────────────
// Modal
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

  const bgClose = e => { if (e.target === overlay) { close(); overlay.removeEventListener('click', bgClose); } };
  overlay.addEventListener('click', bgClose);
}

// ─────────────────────────────────────────────
// Resize Observer — redraw charts on resize
// ─────────────────────────────────────────────
function initResizeObserver() {
  const ro = new ResizeObserver(() => {
    if (state.currentView === 'insights') renderInsights();
    if (state.currentView === 'weekly')   renderWeeklyTrendChart();
  });
  ro.observe(document.getElementById('main-content'));
}

// ─────────────────────────────────────────────
// Service Worker
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
// Boot
// ─────────────────────────────────────────────
function init() {
  migrateData();

  initHeader();
  initNav();
  initDailyTab();
  initDailySheet();
  initWeeklyTab();
  initLogTab();
  initEpisodeSheet();
  initSettingsSheet();
  initInsightsTab();
  initExport();
  initResizeObserver();

  // Close sheet when overlay is tapped
  document.getElementById('sheet-overlay').addEventListener('click', closeSheet);

  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
