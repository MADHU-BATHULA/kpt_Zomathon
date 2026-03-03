// ══════════════════════════════════════════════════
// GLOBALS
// ══════════════════════════════════════════════════
let predictionCount = 0, flaggedCount = 0;
let simInterval = null, simRunning = false;
let simOrders = 0, simFlagged = 0, simWaits = [], simPreds = [], simActuals = [];
const simCtx = document.getElementById('sim-chart').getContext('2d');
let simChart, errorChart, forChart, sriChart;

// ══════════════════════════════════════════════════
// TAB NAVIGATION
// ══════════════════════════════════════════════════
function showTab(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'dashboard') initDashboard();
  if (name === 'model') initModelView();
}

// ══════════════════════════════════════════════════
// KPT PREDICTION MODEL
// ══════════════════════════════════════════════════
const KPT_BASE = {
  qsr: 10, casual: 18, cloud: 14, fine: 28, street: 8
};
const CUISINE_MOD = {
  indian: 1.15, chinese: 1.0, pizza: 1.2, burger: 0.85, biryani: 1.35, dessert: 0.75
};
const TIME_MOD = {
  morning: 0.8, lunch: 1.35, afternoon: 0.9, dinner: 1.4, late: 0.85
};
const DAY_MOD = { weekday: 1.0, weekend: 1.2, festival: 1.5 };

async function predictKPT() {
  const type = document.getElementById('rest-type').value;
  const cuisine = document.getElementById('cuisine').value;
  const items = parseInt(document.getElementById('order-items').value) || 3;
  const tod = document.getElementById('time-of-day').value;
  const dayType = document.getElementById('day-type').value;
  const sri = parseInt(document.getElementById('sri-score').value);
  const density = parseInt(document.getElementById('order-density').value);
  const pos = parseInt(document.getElementById('pos-orders').value);
  const acoustic = parseInt(document.getElementById('acoustic-score').value);
  const forRate = parseInt(document.getElementById('for-trigger-rate').value);

  // Base KPT
  let base = KPT_BASE[type];
  // Item scaling (non-linear)
  const itemMod = 1 + Math.log(items) * 0.25;
  // All modifiers
  const cuisineMod = CUISINE_MOD[cuisine];
  const timeMod = TIME_MOD[tod];
  const dayMod = DAY_MOD[dayType];
  // Load signals
  const densityMod = 1 + (density / 50) * 0.45;
  const posMod = 1 + (pos / 40) * 0.35;
  const acousticMod = 1 + (acoustic / 100) * 0.3;
  // SRI adjustment (low SRI → more uncertainty → add buffer)
  const sriBuff = sri < 40 ? 1.15 : sri < 65 ? 1.05 : 1.0;
  // FOR bias adjustment
  const forBiasAdj = 1 + (forRate / 100) * 0.2;

  let kpt;
  try {
    const typeMap = { qsr: 1, casual: 2, cloud: 3, fine: 4, street: 5 };
    const res = await fetch('http://localhost:5000/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_type: typeMap[type] || 1,
        items: items,
        density: density,
        pos_orders: pos,
        activity: acoustic
      })
    });
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    kpt = data.kpt;
  } catch (e) {
    console.error("Backend error, falling back to local calculation", e);
    kpt = base * itemMod * cuisineMod * timeMod * dayMod * densityMod * posMod * acousticMod * sriBuff * forBiasAdj;
    kpt = Math.round(kpt * 10) / 10;
  }
  const kptLow = Math.round(kpt * 0.82);
  const kptHigh = Math.round(kpt * 1.22);

  // Confidence score
  let conf = 85;
  if (sri < 40) conf -= 12;
  else if (sri < 65) conf -= 5;
  if (forRate > 40) conf -= 10;
  if (forRate > 60) conf -= 8;
  if (pos === 0) conf -= 5;
  if (acoustic < 20) conf -= 3;
  conf = Math.max(45, Math.min(96, conf));

  // Signal contributions (percentages)
  const totalLoad = densityMod + posMod + acousticMod - 2;
  const contribs = [
    { label: 'Historical Pattern', val: Math.round(35 - (totalLoad * 5)), color: 'var(--z-blue)' },
    { label: 'Kitchen Load (Live)', val: Math.round(20 + totalLoad * 8), color: 'var(--z-orange)' },
    { label: 'Time & Day Context', val: Math.round(18 + (timeMod - 1) * 8), color: 'var(--z-purple)' },
    { label: 'Merchant SRI', val: Math.round(15 - (100 - sri) * 0.05), color: 'var(--z-green)' },
    { label: 'FOR Bias Correction', val: Math.round(12 + forRate * 0.1), color: 'var(--z-red)' }
  ];
  // Normalize to 100
  const total = contribs.reduce((s, c) => s + c.val, 0);
  contribs.forEach(c => c.val = Math.round(c.val / total * 100));
  contribs[0].val += 100 - contribs.reduce((s, c) => s + c.val, 0);

  // Signals active
  const pills = [];
  pills.push({ text: 'GPS Wait Labels', cls: 'pill-green' });
  if (pos > 0) pills.push({ text: `POS: ${pos} orders`, cls: 'pill-blue' });
  if (acoustic > 0) pills.push({ text: `Acoustic: ${acoustic}/100`, cls: 'pill-orange' });
  if (sri < 65) pills.push({ text: `SRI ${sri} — Low Trust`, cls: 'pill-yellow' });
  else pills.push({ text: `SRI ${sri} — Trusted`, cls: 'pill-green' });
  if (forRate > 30) pills.push({ text: `FOR Bias: ${forRate}% flagged`, cls: 'pill-red' });
  else pills.push({ text: `FOR Quality: Good`, cls: 'pill-green' });

  // Dispatch recommendation
  const dispatchDelta = Math.round((kpt * 0.35) + 2);
  const dispatchTime = Math.round(kpt - dispatchDelta);
  let dispatchText = `<strong style="color:var(--z-green)">Dispatch rider in ${dispatchTime} min</strong> (${dispatchDelta} min before estimated readiness). `;
  if (sri < 40) dispatchText += `⚠️ Low SRI merchant — add <strong style="color:var(--z-yellow)">+3 min buffer</strong> on dispatch.`;
  else if (forRate > 40) dispatchText += `⚠️ High FOR bias rate — bias-corrected estimate applied.`;
  else dispatchText += `Signal quality is good. Standard dispatch applies.`;

  // Render
  document.getElementById('predict-placeholder').style.display = 'none';
  const box = document.getElementById('kpt-result');
  box.classList.add('show');
  document.getElementById('kpt-val').textContent = kpt.toFixed(1) + ' min';
  document.getElementById('kpt-range-label').textContent = `Confidence interval: ${kptLow}–${kptHigh} min`;
  const fill = document.getElementById('conf-fill');
  fill.style.width = conf + '%';
  fill.style.background = conf > 75 ? 'var(--z-green)' : conf > 60 ? 'var(--z-yellow)' : 'var(--z-red)';
  document.getElementById('conf-val').textContent = conf + '%';

  const bg = document.getElementById('breakdown-grid');
  bg.innerHTML = contribs.map(c =>
    `<div class="breakdown-item">
      <div class="breakdown-val" style="color:${c.color}">${c.val}%</div>
      <div class="breakdown-lbl">${c.label}</div>
    </div>`
  ).join('');

  const sp = document.getElementById('signal-pills');
  sp.innerHTML = pills.map(p => `<div class="pill ${p.cls}">${p.text}</div>`).join('');
  document.getElementById('dispatch-rec').innerHTML = dispatchText;

  predictionCount++;
  document.getElementById('h-predictions').textContent = predictionCount;
  document.getElementById('h-accuracy').textContent = (80 + Math.random() * 8).toFixed(1) + '%';
}

function randomizeInputs() {
  const types = ['qsr', 'casual', 'cloud', 'fine', 'street'];
  const cuisines = ['indian', 'chinese', 'pizza', 'burger', 'biryani', 'dessert'];
  const tods = ['morning', 'lunch', 'afternoon', 'dinner', 'late'];
  const days = ['weekday', 'weekend', 'festival'];
  document.getElementById('rest-type').value = types[Math.floor(Math.random() * types.length)];
  document.getElementById('cuisine').value = cuisines[Math.floor(Math.random() * cuisines.length)];
  document.getElementById('order-items').value = Math.floor(Math.random() * 8) + 1;
  document.getElementById('time-of-day').value = tods[Math.floor(Math.random() * tods.length)];
  document.getElementById('day-type').value = days[Math.floor(Math.random() * days.length)];
  document.getElementById('sri-score').value = Math.floor(Math.random() * 70) + 20;
  const d = Math.floor(Math.random() * 45) + 2;
  document.getElementById('order-density').value = d;
  document.getElementById('density-val').textContent = d;
  const p = Math.floor(Math.random() * 35);
  document.getElementById('pos-orders').value = p;
  document.getElementById('pos-val').textContent = p;
  const a = Math.floor(Math.random() * 90) + 5;
  document.getElementById('acoustic-score').value = a;
  document.getElementById('acoustic-val').textContent = a;
  const f = Math.floor(Math.random() * 60);
  document.getElementById('for-trigger-rate').value = f;
  document.getElementById('for-rate-val').textContent = f;
  predictKPT();
}

// ══════════════════════════════════════════════════
// FOR SIGNAL DETECTOR
// ══════════════════════════════════════════════════
function detectFOR() {
  const riderDist = parseFloat(document.getElementById('rider-distance').value);
  const riderForGap = parseFloat(document.getElementById('rider-for-gap').value);
  const acceptForGap = parseFloat(document.getElementById('accept-for-gap').value);
  const histKpt = parseFloat(document.getElementById('hist-kpt').value);
  const forPickupGap = parseFloat(document.getElementById('for-pickup-gap').value);
  const concurrentFor = parseInt(document.getElementById('concurrent-for').value);
  const sri = parseInt(document.getElementById('det-sri').value);
  const deviation = parseFloat(document.getElementById('baseline-deviation').value);

  // Score each factor 0–1 (1 = most suspicious)
  const factors = [];

  // Factor 1: Rider proximity
  let riderProxScore = riderDist < 50 ? 1.0 : riderDist < 100 ? 0.75 : riderDist < 200 ? 0.4 : 0.1;
  factors.push({ name: 'Rider proximity at FOR', score: riderProxScore, weight: 0.30 });

  // Factor 2: Rider arrival → FOR gap
  let arrivalGapScore = riderForGap < 60 ? 1.0 : riderForGap < 180 ? 0.65 : riderForGap < 360 ? 0.3 : 0.1;
  if (riderForGap < 0) arrivalGapScore = 0.05; // FOR before rider = genuine
  factors.push({ name: 'Rider arrival → FOR timing', score: arrivalGapScore, weight: 0.25 });

  // Factor 3: FOR-to-pickup gap
  let pickupGapScore = forPickupGap < 20 ? 0.95 : forPickupGap < 60 ? 0.6 : forPickupGap < 120 ? 0.3 : 0.1;
  factors.push({ name: 'FOR-to-pickup speed', score: pickupGapScore, weight: 0.20 });

  // Factor 4: Baseline deviation
  let deviationScore = deviation < -8 ? 0.9 : deviation < -5 ? 0.65 : deviation < -2 ? 0.3 : 0.1;
  factors.push({ name: 'Deviation from baseline', score: deviationScore, weight: 0.15 });

  // Factor 5: Concurrent FOR events
  let concurrentScore = concurrentFor >= 4 ? 0.9 : concurrentFor === 3 ? 0.65 : concurrentFor === 2 ? 0.35 : 0.05;
  factors.push({ name: 'Batch marking pattern', score: concurrentScore, weight: 0.10 });

  // Composite score
  const composite = factors.reduce((s, f) => s + f.score * f.weight, 0);
  // SRI modifier
  const sriMod = sri < 40 ? 1.15 : sri < 65 ? 1.05 : 0.92;
  const finalScore = Math.min(1, composite * sriMod);

  // Verdict
  let verdict, cls, icon, explanation;
  if (finalScore >= 0.65) {
    verdict = 'CORRUPTED — Rider-Triggered FOR';
    cls = 'corrupted'; icon = '🚨';
    explanation = `Contamination score: <strong style="color:var(--z-red)">${(finalScore * 100).toFixed(0)}/100</strong> — This FOR event should be down-weighted or excluded from KPT training labels. Rider presence strongly influenced the marking time.`;
  } else if (finalScore >= 0.38) {
    verdict = 'SUSPICIOUS — Flagged for Review';
    cls = 'suspicious'; icon = '⚠️';
    explanation = `Contamination score: <strong style="color:var(--z-yellow)">${(finalScore * 100).toFixed(0)}/100</strong> — Apply 0.6× weight to this FOR event in training. Pattern is ambiguous but shows multiple risk signals.`;
  } else {
    verdict = 'TRUSTED — Genuine FOR Signal';
    cls = 'safe'; icon = '✅';
    explanation = `Contamination score: <strong style="color:var(--z-green)">${(finalScore * 100).toFixed(0)}/100</strong> — This FOR event passes all validation checks and can be used as a reliable KPT training label.`;
  }

  document.getElementById('det-placeholder').style.display = 'none';
  const r = document.getElementById('det-result');
  r.className = 'detection-result show ' + cls;
  document.getElementById('det-icon').textContent = icon;
  document.getElementById('det-verdict').textContent = verdict;
  document.getElementById('det-score').innerHTML = explanation;

  // Flags
  const flags = [];
  if (riderDist < 100) flags.push({ text: 'Rider <100m', cls: 'pill-red' });
  if (riderForGap < 180) flags.push({ text: 'Fast arrival→FOR', cls: 'pill-red' });
  if (forPickupGap < 60) flags.push({ text: 'Instant pickup', cls: 'pill-yellow' });
  if (concurrentFor >= 3) flags.push({ text: 'Batch marking', cls: 'pill-yellow' });
  if (deviation < -5) flags.push({ text: 'Below baseline', cls: 'pill-yellow' });
  if (sri < 40) flags.push({ text: 'Low SRI merchant', cls: 'pill-red' });
  document.getElementById('det-flags').innerHTML = flags.map(f => `<div class="pill ${f.cls}">${f.text}</div>`).join('');

  // Factors visualization
  document.getElementById('det-factors').innerHTML = factors.map(f => {
    const pct = Math.round(f.score * 100);
    const col = pct > 65 ? 'var(--z-red)' : pct > 35 ? 'var(--z-yellow)' : 'var(--z-green)';
    return `<div class="factor-item">
      <span class="factor-name">${f.name}</span>
      <div class="factor-bar"><div class="factor-fill" style="width:${pct}%;background:${col}"></div></div>
      <span class="factor-val" style="color:${col}">${pct}</span>
    </div>`;
  }).join('');

  if (cls === 'corrupted') { flaggedCount++; document.getElementById('h-flagged').textContent = flaggedCount; }
}

const scenarios = [
  { dist: 82, rfg: 95, afg: 8, hk: 19, fpg: 28, cf: 1, sri: 54, dev: -3, label: 'Rider-Triggered' },
  { dist: 450, rfg: -180, afg: 22, hk: 20, fpg: 240, cf: 1, sri: 81, dev: 1, label: 'Genuine FOR' },
  { dist: 120, rfg: 210, afg: 15, hk: 18, fpg: 95, cf: 4, sri: 42, dev: -6, label: 'Batch Marking' },
];
let scenIdx = 0;
function loadFORScenario() {
  const s = scenarios[scenIdx % scenarios.length];
  document.getElementById('rider-distance').value = s.dist;
  document.getElementById('rider-for-gap').value = s.rfg;
  document.getElementById('accept-for-gap').value = s.afg;
  document.getElementById('hist-kpt').value = s.hk;
  document.getElementById('for-pickup-gap').value = s.fpg;
  document.getElementById('concurrent-for').value = s.cf;
  document.getElementById('det-sri').value = s.sri;
  document.getElementById('baseline-deviation').value = s.dev;
  document.getElementById('deviation-val').textContent = (s.dev > 0 ? '+' : '') + s.dev;
  scenIdx++;
  detectFOR();
}

// ══════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════
function initDashboard() {
  // Error distribution chart
  const ectx = document.getElementById('error-chart').getContext('2d');
  if (errorChart) errorChart.destroy();
  const labels = ['<1 min', '1-2 min', '2-3 min', '3-5 min', '5-8 min', '>8 min'];
  const before = [8, 14, 18, 22, 20, 18];
  const after = [18, 24, 22, 17, 12, 7];
  errorChart = drawBarChart(ectx, labels, [
    { label: 'Before Correction', data: before, color: 'rgba(226,55,68,0.6)' },
    { label: 'After Signal Fix', data: after, color: 'rgba(46,204,113,0.7)' }
  ], 'Error (absolute)');

  // FOR quality line chart
  const fctx = document.getElementById('for-chart').getContext('2d');
  if (forChart) forChart.destroy();
  const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];
  const corrupt = [32, 30, 28, 25, 22, 20, 18, 17];
  const trusted = [68, 70, 72, 75, 78, 80, 82, 83];
  forChart = drawLineChart(fctx, weeks, [
    { label: 'Corrupted FOR %', data: corrupt, color: 'rgb(226,55,68)' },
    { label: 'Trusted FOR %', data: trusted, color: 'rgb(46,204,113)' }
  ]);

  // SRI distribution
  const sctx = document.getElementById('sri-chart').getContext('2d');
  if (sriChart) sriChart.destroy();
  const sriBins = ['0-20', '21-40', '41-60', '61-75', '76-90', '91-100'];
  const sriData = [3, 8, 22, 31, 28, 8];
  sriChart = drawBarChart(sctx, sriBins, [
    { label: 'Merchant Distribution', data: sriData, color: 'rgba(52,152,219,0.7)' }
  ], 'SRI Score Range');

  // Restaurant table
  const restaurants = [
    ['Spice Garden', 82, '5.2 min', '2.8 min', '-46%'],
    ['Biryani House', 74, '6.8 min', '3.4 min', '-50%'],
    ['Pizza Palace', 91, '4.1 min', '1.9 min', '-54%'],
    ['Burger Stop', 38, '8.3 min', '6.2 min', '-25%'],
    ['Dragon Wok', 67, '5.9 min', '3.1 min', '-47%'],
    ['Sweet Bites', 85, '3.2 min', '1.4 min', '-56%'],
  ];
  document.getElementById('rest-tbody').innerHTML = restaurants.map(r =>
    `<tr>
      <td><strong>${r[0]}</strong></td>
      <td><span class="badge ${parseInt(r[1]) > 75 ? 'badge-green' : parseInt(r[1]) > 50 ? 'badge-blue' : 'badge-red'}">${r[1]}</span></td>
      <td class="text-muted">${r[2]}</td>
      <td class="text-green">${r[3]}</td>
      <td class="font-bold text-green">${r[4]}</td>
    </tr>`
  ).join('');
}

function refreshDashboard() {
  const ids = ['d-accuracy', 'd-wait', 'd-for-corrupt', 'd-p90'];
  const vals = [
    (81 + Math.random() * 5).toFixed(1) + '%',
    (2.8 + Math.random() * 1.5).toFixed(1) + ' min',
    (19 + Math.random() * 8).toFixed(1) + '%',
    (5.2 + Math.random() * 2).toFixed(1) + ' min'
  ];
  ids.forEach((id, i) => document.getElementById(id).textContent = vals[i]);
  initDashboard();
}

// ══════════════════════════════════════════════════
// SIMULATION
// ══════════════════════════════════════════════════
const REST_NAMES = ['Spice Garden', 'Biryani Hub', 'Pizza Place', 'Dragon Wok', 'Burger Bar', 'Sweet Tooth', 'Curry Palace', 'Quick Bites', 'Cloud Kitchen A', 'Tandoor Express'];
const CUISINES_SIM = ['🍛', '🍚', '🍕', '🍜', '🍔', '🧁', '🍱', '🌯', '☁️', '🫓'];

function toggleSimulation() {
  if (simRunning) {
    clearInterval(simInterval);
    simRunning = false;
    document.getElementById('sim-toggle').textContent = '▶ Start Simulation';
  } else {
    simRunning = true;
    document.getElementById('sim-toggle').textContent = '⏸ Pause';
    if (!simChart) initSimChart();
    runSimulation();
    const speed = parseInt(document.getElementById('sim-speed').value);
    simInterval = setInterval(runSimulation, speed);
  }
}

function runSimulation() {
  const n = parseInt(document.getElementById('sim-rest-count').value);
  const restIdx = Math.floor(Math.random() * n);
  const name = REST_NAMES[restIdx] || 'Restaurant ' + restIdx;
  const emoji = CUISINES_SIM[restIdx] || '🍽️';

  // Simulate order
  const basekpt = 8 + Math.random() * 22;
  const loadFactor = 0.8 + Math.random() * 0.7;
  const predicted = Math.round(basekpt * loadFactor * 10) / 10;
  const error = (Math.random() - 0.4) * 4;
  const actual = Math.max(1, predicted + error);
  const isRiderTriggered = Math.random() < 0.22;
  const items = Math.floor(Math.random() * 5) + 1;

  simOrders++;
  if (isRiderTriggered) simFlagged++;
  simWaits.push(Math.abs(error));
  simPreds.push(predicted);
  simActuals.push(actual);

  const avgWait = (simWaits.reduce((a, b) => a + b, 0) / simWaits.length).toFixed(1);
  const accuracy = Math.round((1 - simWaits.filter(w => w > 3).length / simWaits.length) * 100);

  document.getElementById('sim-orders').textContent = simOrders;
  document.getElementById('sim-flagged').textContent = simFlagged;
  document.getElementById('sim-accuracy').textContent = accuracy + '%';
  document.getElementById('sim-avg-wait').textContent = avgWait + ' min';

  // Feed item
  const feed = document.getElementById('order-feed');
  if (feed.children[0] && feed.children[0].textContent.includes('Press Start')) feed.innerHTML = '';

  const itemEl = document.createElement('div');
  itemEl.className = 'feed-item';
  const bgColor = isRiderTriggered ? 'rgba(226,55,68,0.15)' : 'rgba(46,204,113,0.1)';
  const statusText = isRiderTriggered ? '🚩 FOR Flagged' : '✅ Trusted';
  const statusColor = isRiderTriggered ? 'var(--z-red)' : 'var(--z-green)';
  itemEl.innerHTML = `
    <div class="feed-icon" style="background:${bgColor}">${emoji}</div>
    <div class="feed-content">
      <div class="feed-title">${name} · ${items} item${items > 1 ? 's' : ''}</div>
      <div class="feed-meta">Predicted: <strong>${predicted.toFixed(1)} min</strong> · Actual: <strong>${actual.toFixed(1)} min</strong> · Δ ${error > 0 ? '+' : ''}${error.toFixed(1)} min</div>
    </div>
    <div class="feed-badge" style="color:${statusColor}">${statusText}</div>`;
  feed.insertBefore(itemEl, feed.firstChild);
  if (feed.children.length > 20) feed.removeChild(feed.lastChild);

  // Update sim chart
  updateSimChart();

  // Update header
  document.getElementById('h-predictions').textContent = predictionCount + simOrders;
  document.getElementById('h-flagged').textContent = flaggedCount + simFlagged;

  // Animate timeline
  animateTimeline(predicted);
}

function initSimChart() {
  simChart = new SimpleLineChart('sim-chart');
}

function updateSimChart() {
  if (!simChart) return;
  const last = Math.min(simPreds.length, 20);
  simChart.update(simPreds.slice(-last), simActuals.slice(-last));
}

function clearFeed() {
  document.getElementById('order-feed').innerHTML = '<div style="color:var(--z-muted); font-size:13px; padding:20px 0; text-align:center;">Feed cleared. Press Start to continue...</div>';
  simOrders = 0; simFlagged = 0; simWaits = []; simPreds = []; simActuals = [];
  ['sim-orders', 'sim-flagged'].forEach(id => document.getElementById(id).textContent = '0');
  ['sim-accuracy', 'sim-avg-wait'].forEach(id => document.getElementById(id).textContent = '—');
}

let tlState = 0;
function animateTimeline(kpt) {
  const dots = document.querySelectorAll('#revision-timeline .tl-dot');
  dots.forEach(d => { d.className = 'tl-dot pending'; });
  const step = tlState % 4;
  for (let i = 0; i <= step; i++) {
    dots[i].className = i < step ? 'tl-dot done' : 'tl-dot active';
  }
  tlState++;
}

// ══════════════════════════════════════════════════
// MODEL VIEW
// ══════════════════════════════════════════════════
function initModelView() {
  // Feature importance bars
  const features = [
    { name: 'Time-of-Day & Day Type', val: 85, color: 'var(--z-orange)' },
    { name: 'Order Size & Complexity', val: 78, color: 'var(--z-blue)' },
    { name: 'Acoustic Kitchen Score', val: 72, color: 'var(--z-purple)' },
    { name: 'POS Concurrent Orders', val: 68, color: 'var(--z-green)' },
    { name: 'Restaurant Category', val: 65, color: 'var(--z-yellow)' },
    { name: 'Zomato Order Density', val: 60, color: 'var(--z-red)' },
    { name: 'Merchant SRI Score', val: 55, color: 'var(--z-blue)' },
    { name: 'Rider-Triggered FOR Rate', val: 48, color: 'var(--z-orange)' },
    { name: 'Historical P50 KPT', val: 42, color: 'var(--z-green)' },
    { name: 'GPS Wait Time Labels', val: 38, color: 'var(--z-purple)' },
  ];
  document.getElementById('feature-bars').innerHTML = features.map(f =>
    `<div class="feat-bar">
      <div class="feat-label">
        <span>${f.name}</span>
        <span class="mono" style="color:${f.color}">${f.val}</span>
      </div>
      <div class="feat-track">
        <div class="feat-fill" style="width:${f.val}%;background:${f.color}"></div>
      </div>
    </div>`
  ).join('');

  // Signal layers
  const layers = [
    { num: 'L1', title: 'Passive Behavioral Signals', desc: 'Rider GPS wait times, Mx app interaction patterns, FOR marking velocity', color: 'var(--z-blue)', coverage: '100%' },
    { num: 'L2', title: 'Kitchen Load Inference', desc: 'POS aggregate orders, Zomato density, acoustic busyness score, event calendar', color: 'var(--z-orange)', coverage: '35–100%' },
    { num: 'L3', title: 'Merchant SRI Scoring', desc: 'Signal reliability index: wait accuracy, consistency, rider-trigger rate', color: 'var(--z-green)', coverage: '100%' },
    { num: 'L4', title: 'Dynamic Revision Engine', desc: 'Closed-loop real-time KPT update with 1-tap merchant prompt at T+P50−3min', color: 'var(--z-red)', coverage: '100%' },
  ];
  document.getElementById('layer-stack').innerHTML = layers.map(l =>
    `<div style="display:flex;gap:14px;align-items:flex-start;padding:14px;background:var(--z-dark3);border-radius:8px;border-left:3px solid ${l.color}">
      <div style="width:28px;height:28px;border-radius:6px;background:${l.color};display:flex;align-items:center;justify-content:center;font-family:'Space Mono',monospace;font-size:11px;font-weight:700;flex-shrink:0">${l.num}</div>
      <div>
        <div style="font-weight:600;font-size:13px;margin-bottom:3px">${l.title}</div>
        <div style="font-size:11px;color:var(--z-muted);margin-bottom:5px">${l.desc}</div>
        <div class="pill pill-blue" style="display:inline-flex;font-size:10px">Coverage: ${l.coverage}</div>
      </div>
    </div>`
  ).join('');

  // SRI breakdown
  const sriComps = [
    { name: 'Historical Wait Accuracy', weight: '35%', desc: 'Correlation between FOR markings and actual rider wait time = 0' },
    { name: 'Marking Consistency', weight: '25%', desc: 'Variance in FOR timing relative to their own historical baseline' },
    { name: 'Rider-Trigger Rate', weight: '25%', desc: '% of FOR events classified as rider-triggered over rolling 30 days' },
    { name: 'Batch Marking Frequency', weight: '15%', desc: 'How often multiple orders marked ready in rapid succession' },
  ];
  document.getElementById('sri-breakdown').innerHTML = sriComps.map(s =>
    `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:10px">
      <div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:var(--z-red);width:36px;flex-shrink:0">${s.weight}</div>
      <div>
        <div style="font-size:12px;font-weight:600">${s.name}</div>
        <div style="font-size:11px;color:var(--z-muted)">${s.desc}</div>
      </div>
    </div>`
  ).join('');
  updateSRIPreview(72);

  // Pipeline steps
  const steps = [
    { icon: '1', title: 'Raw FOR Signal Ingestion', desc: 'Collect all merchant FOR events with GPS coordinates and timestamps', color: 'var(--z-blue)' },
    { icon: '2', title: 'Rider-Triggered Detection', desc: 'Flag events where rider was within 100m or marked within 3 min of arrival', color: 'var(--z-yellow)' },
    { icon: '3', title: 'SRI-Weighted Labeling', desc: 'Apply SRI multiplier to determine trust weight of each FOR event', color: 'var(--z-orange)' },
    { icon: '4', title: 'GPS Wait Time Integration', desc: 'Replace biased FOR labels with GPS-derived actual wait time measurements', color: 'var(--z-purple)' },
    { icon: '5', title: 'Multi-Signal Feature Build', desc: 'Combine all 4 layers into enriched feature vector for model input', color: 'var(--z-green)' },
    { icon: '6', title: 'KPT Prediction Output', desc: 'Output predicted time + confidence interval + dispatch recommendation', color: 'var(--z-red)' },
  ];
  document.getElementById('pipeline-steps').innerHTML = steps.map(s =>
    `<div style="display:flex;gap:12px;align-items:flex-start">
      <div style="width:24px;height:24px;border-radius:50%;background:${s.color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${s.icon}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${s.title}</div>
        <div style="font-size:11px;color:var(--z-muted)">${s.desc}</div>
      </div>
    </div>`
  ).join('');
}

function updateSRIPreview(val) {
  val = parseInt(val);
  document.getElementById('sri-sample-val').textContent = val;
  const fill = document.getElementById('sri-sample-fill');
  fill.style.width = val + '%';
  const color = val >= 65 ? 'var(--z-green)' : val >= 40 ? 'var(--z-yellow)' : 'var(--z-red)';
  fill.style.background = color;
  const advice = document.getElementById('sri-advice');
  if (val >= 75) advice.innerHTML = '✅ <strong style="color:var(--z-green)">High Trust</strong> — FOR signals used at full weight. Better rider dispatch timing assigned.';
  else if (val >= 40) advice.innerHTML = '⚠️ <strong style="color:var(--z-yellow)">Medium Trust</strong> — FOR signals blended with inferred KPT at 70/30 weighting.';
  else advice.innerHTML = '🚨 <strong style="color:var(--z-red)">Low Trust</strong> — FOR signals down-weighted to 30%. Inferred KPT dominates. Merchant receives accuracy nudge notification.';
}

// ══════════════════════════════════════════════════
// CHART HELPERS (No external deps)
// ══════════════════════════════════════════════════
function drawBarChart(ctx, labels, datasets, xlabel) {
  const canvas = ctx.canvas;
  const W = canvas.offsetWidth || 400;
  const H = canvas.offsetHeight || 200;
  canvas.width = W * 2; canvas.height = H * 2;
  ctx.scale(2, 2);
  const pad = { top: 20, right: 20, bottom: 50, left: 40 };
  const w = W - pad.left - pad.right;
  const h = H - pad.top - pad.bottom;
  const maxVal = Math.max(...datasets.flatMap(d => d.data)) * 1.1;
  const barW = (w / labels.length) * 0.8 / datasets.length;
  const groupW = w / labels.length;

  ctx.clearRect(0, 0, W, H);
  // Grid
  ctx.strokeStyle = '#2E2E2E'; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + h - (h * i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + w, y); ctx.stroke();
    ctx.fillStyle = '#666'; ctx.font = '9px DM Sans';
    ctx.fillText(Math.round(maxVal * i / 4), 2, y + 3);
  }
  // Bars
  datasets.forEach((ds, di) => {
    ds.data.forEach((val, i) => {
      const x = pad.left + i * groupW + di * barW + groupW * 0.1;
      const bh = (val / maxVal) * h;
      const y = pad.top + h - bh;
      ctx.fillStyle = ds.color;
      roundRect(ctx, x, y, barW - 2, bh, 3);
    });
  });
  // Labels
  ctx.fillStyle = '#888'; ctx.font = '9px DM Sans'; ctx.textAlign = 'center';
  labels.forEach((l, i) => {
    ctx.fillText(l, pad.left + i * groupW + groupW / 2, H - pad.bottom + 14);
  });
  // Legend
  datasets.forEach((ds, i) => {
    ctx.fillStyle = ds.color;
    ctx.fillRect(pad.left + i * 100, H - 10, 8, 8);
    ctx.fillStyle = '#888'; ctx.textAlign = 'left';
    ctx.fillText(ds.label, pad.left + i * 100 + 12, H - 3);
  });
  return { destroy: () => { } };
}

function drawLineChart(ctx, labels, datasets) {
  const canvas = ctx.canvas;
  const W = canvas.offsetWidth || 400;
  const H = canvas.offsetHeight || 200;
  canvas.width = W * 2; canvas.height = H * 2;
  ctx.scale(2, 2);
  const pad = { top: 20, right: 20, bottom: 40, left: 36 };
  const w = W - pad.left - pad.right;
  const h = H - pad.top - pad.bottom;
  const allVals = datasets.flatMap(d => d.data);
  const maxVal = Math.max(...allVals) * 1.1;

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#2E2E2E'; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + h - (h * i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + w, y); ctx.stroke();
    ctx.fillStyle = '#666'; ctx.font = '9px DM Sans'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal * i / 4) + '%', pad.left - 4, y + 3);
  }
  datasets.forEach(ds => {
    ctx.beginPath(); ctx.strokeStyle = ds.color; ctx.lineWidth = 2;
    ds.data.forEach((v, i) => {
      const x = pad.left + i * (w / (labels.length - 1));
      const y = pad.top + h - (v / maxVal) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ds.data.forEach((v, i) => {
      const x = pad.left + i * (w / (labels.length - 1));
      const y = pad.top + h - (v / maxVal) * h;
      ctx.beginPath(); ctx.fillStyle = ds.color;
      ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
  });
  ctx.fillStyle = '#888'; ctx.font = '9px DM Sans'; ctx.textAlign = 'center';
  labels.forEach((l, i) => ctx.fillText(l, pad.left + i * (w / (labels.length - 1)), H - pad.bottom + 12));
  datasets.forEach((ds, i) => {
    ctx.fillStyle = ds.color; ctx.fillRect(pad.left + i * 90, H - 8, 10, 3);
    ctx.fillStyle = '#888'; ctx.textAlign = 'left'; ctx.fillText(ds.label, pad.left + i * 90 + 14, H - 3);
  });
  return { destroy: () => { } };
}

class SimpleLineChart {
  constructor(id) {
    this.canvas = document.getElementById(id);
    this.ctx = this.canvas.getContext('2d');
  }
  update(preds, actuals) {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const W = canvas.offsetWidth || 400, H = canvas.offsetHeight || 200;
    canvas.width = W * 2; canvas.height = H * 2;
    ctx.scale(2, 2);
    const pad = { top: 20, right: 20, bottom: 40, left: 40 };
    const w = W - pad.left - pad.right, h = H - pad.top - pad.bottom;
    const all = [...preds, ...actuals];
    const maxV = Math.max(...all) * 1.1, minV = Math.max(0, Math.min(...all) * 0.9);
    const range = maxV - minV;

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#2E2E2E'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + h * (1 - i / 4);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + w, y); ctx.stroke();
      ctx.fillStyle = '#666'; ctx.font = '9px DM Sans'; ctx.textAlign = 'right';
      ctx.fillText((minV + range * i / 4).toFixed(0), pad.left - 4, y + 3);
    }

    const drawLine = (data, color, dash) => {
      if (data.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
      if (dash) ctx.setLineDash([4, 3]); else ctx.setLineDash([]);
      data.forEach((v, i) => {
        const x = pad.left + i * (w / (data.length - 1));
        const y = pad.top + h - (v - minV) / range * h;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.setLineDash([]);
    };
    drawLine(preds, 'rgb(52,152,219)', false);
    drawLine(actuals, 'rgb(46,204,113)', true);

    ctx.font = '9px DM Sans'; ctx.textAlign = 'center';
    const labs = preds.map((_, i) => i + 1);
    labs.forEach((l, i) => {
      if (i % 3 === 0) { ctx.fillStyle = '#888'; ctx.fillText(l, pad.left + i * (w / (labs.length - 1)), H - pad.bottom + 12); }
    });
    ctx.fillStyle = 'rgb(52,152,219)'; ctx.fillRect(pad.left, H - 8, 10, 3);
    ctx.fillStyle = '#888'; ctx.textAlign = 'left'; ctx.fillText('Predicted', pad.left + 14, H - 3);
    ctx.fillStyle = 'rgb(46,204,113)'; ctx.fillRect(pad.left + 80, H - 8, 10, 3);
    ctx.fillText('Actual', pad.left + 94, H - 3);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath(); ctx.fill();
}

// Resize observer for charts
window.addEventListener('resize', () => {
  const panel = document.querySelector('.panel.active');
  if (panel && panel.id === 'panel-dashboard') setTimeout(initDashboard, 100);
});