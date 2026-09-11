'use strict';
const $ = id => document.getElementById(id);
const clock = new WatchClock(), video = $('video');
const canvas = $('fly'), stage = document.querySelector('.stage');
const performanceState = new FlyPerformance(); performanceState.reset(0, 0, 1);
let flyView = null, visualTime = 0, lastFrame = 0;
FlyComic.create(canvas).then(view => { flyView = view; $('character-state').textContent = 'PhD in doomscrolling'; }).catch(() => { $('character-state').textContent = '3D rendering unavailable in this browser'; stage.classList.add('no-3d'); });
const brainView = new FlyBrain.BrainView($('brain-canvas'));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let clips = [], active = 0, transitioning = false, swipeUntil = 0, lastMedia = 0;
let brainMetadata = null, lastBin = null, brainFailure = false, lastBrainPaint = 0;
let likeUntil = 0, likingDuration;
const recordings = new Map(), regionElements = [];
function fmt(value) { return Number.isFinite(value) ? value.toFixed(1) : '—'; }
function createCells(parent, n, style) { for (let i = 0; i < n; i++) { const dot = document.createElement('span'); dot.className = 'cell ' + style; parent.appendChild(dot); } }
createCells($('pam-cells'), 15, 'pam'); createCells($('ppl-cells'), 2, 'ppl');
function paintTrace(trace) {
  const el = $('trace'), g = el.getContext('2d'), w = el.width, h = el.height;
  g.clearRect(0, 0, w, h);
  const max = Math.max(1, ...trace.flatMap(t => [t.pam_hz, t.ppl_hz]));
  g.strokeStyle = '#303c4d'; g.lineWidth = 1;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(0, 15 + i * 65); g.lineTo(w, 15 + i * 65); g.stroke(); }
  for (const [field, color] of [['pam_hz', '#65e5d2'], ['ppl_hz', '#f388b6']]) {
    g.strokeStyle = color; g.lineWidth = 3; g.beginPath();
    trace.forEach((t, i) => { const x = 6 + i / Math.max(1, trace.length - 1) * (w - 12), y = h - 20 - t[field] / max * (h - 40); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
  }
  g.fillStyle = '#98a6bb'; g.font = '18px system-ui'; g.fillText(fmt(max) + ' Hz', 4, 15);
}
function updateCells(rates) {
  const cells = [...document.querySelectorAll('.cell')], identities = clips[active]?.observation.cells;
  cells.forEach((cell, i) => {
    cell.style.opacity = rates ? .15 + .85 * Math.min(1, rates[i] / 50) : .15;
    cell.title = identities ? identities[i].type + ' · body ' + identities[i].id + ' · ' + (rates ? fmt(rates[i]) + ' Hz' : 'no completed window') : '';
  });
  $('pam').textContent = rates ? fmt(rates.slice(0, 15).reduce((a, b) => a + b, 0) / 15) + ' Hz' : '—';
  $('ppl').textContent = rates ? fmt((rates[15] + rates[16]) / 2) + ' Hz' : '—';
}
async function resumeVideo() {
  if (!clock.running || document.hidden) return;
  video.playbackRate = Number($('speed').value);
  try { await video.play(); } catch (error) {
    if (error.name === 'AbortError' || !clock.running) return;
    clock.running = false; $('play').textContent = 'Play'; $('status').textContent = 'Press Play to start the video.';
  }
}
function selectClip(index) {
  active = (index + clips.length) % clips.length;
  const clip = clips[active], p = clip.observation.prediction;
  likeUntil = 0; likingDuration = undefined; performanceState.reset(p.predicted_watch_seconds, clip.watch_time, p.seconds);
  stage.classList.remove('liked', 'liking');
  $('like-label').textContent = 'Fly like';
  $('like-status').textContent = 'Like at halfway if prediction ≥ viewer median + 1 s.';
  $('thought-caption').textContent = ['one more. for science.', 'my thesis needs this.', 'very serious research.', 'zero plans. six legs.'][active % 4];
  clock.reset(p.seconds); lastMedia = 0; lastBin = null; video.src = clip.media; video.load();
  $('predicted').textContent = fmt(p.predicted_watch_seconds) + ' s'; $('bubble').textContent = fmt(p.seconds) + ' s';
  $('actual').textContent = fmt(clip.watch_time) + ' s'; $('video-title').textContent = 'Video ' + clip.content_id;
  $('clip-index').textContent = String(active + 1).padStart(2, '0') + ' / ' + String(clips.length).padStart(2, '0');
  $('split').textContent = clip.observation.split === 'test' ? 'HELD-OUT CREATOR · REAL VIDEO' : 'TRAINING SAMPLE · REAL VIDEO';
  $('status').textContent = 'The fly predicts ' + fmt(p.seconds) + ' seconds, then scrolls. Brain activity follows the video.';
  paintTrace(clip.observation.trace); paintActivity(true); renderProgress(); resumeVideo();
  if (!reduced) document.querySelector('.phone').animate([{ transform: 'translateY(14px) rotate(8deg)', opacity: .65 }, { transform: 'translateY(0) rotate(6deg)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.18,.8,.24,1)' });
}
function maybeLike(time) {
  if (!performanceState.advance(clock.elapsed)) return;
  const duration = Math.min(1000, Math.max(160, (clock.target - clock.elapsed) / Number($('speed').value) * 900));
  likeUntil = time + duration; stage.style.setProperty('--like-duration', duration + 'ms');
  stage.classList.add('liked', 'liking');
  $('like-label').textContent = 'Fly liked';
  $('thought-caption').textContent = ['certified brain snack.', 'academically necessary.', 'my last brain cell: yes.', 'i have excellent taste.'][active % 4];
  const difference = clips[active].observation.prediction.predicted_watch_seconds - clips[active].watch_time;
  $('like-status').textContent = '♥ Liked at ' + fmt(performanceState.midpoint) + ' s · prediction ' + fmt(difference) + ' s above median.';
  if (!reduced) document.querySelector('.phone').animate([{ transform: 'rotate(6deg) scale(1)' }, { transform: 'rotate(2deg) scale(.97)', offset: .25 }, { transform: 'rotate(8deg) scale(1.025)', offset: .65 }, { transform: 'rotate(6deg) scale(1)' }], { duration: Math.min(500, duration), easing: 'ease-out' });
}
function renderProgress() {
  const media = ActivityClock.mediaProgress(video.readyState ? video.currentTime : 0, video.readyState ? video.duration : NaN, clips[active]?.duration);
  if (media.duration !== likingDuration) renderLiking(media.duration);
  const percent = 100 * media.fraction;
  $('progress').style.width = percent + '%'; $('phone-progress').style.width = percent + '%';
  const bar = document.querySelector('[role="progressbar"]');
  bar.setAttribute('aria-valuemax', media.duration ?? 100);
  bar.setAttribute('aria-valuenow', media.elapsed);
  bar.setAttribute('aria-valuetext', media.duration ? fmt(media.elapsed) + ' of ' + fmt(media.duration) + ' video seconds' : 'Loading video duration');
  const replay = media.duration ? Math.max(0, Math.round((clock.elapsed - media.elapsed) / media.duration)) : 0;
  $('video-length').textContent = 'Original video · ' + fmt(media.duration) + ' s' + (replay ? ' · replay ' + replay : '');
  $('elapsed').textContent = fmt(media.elapsed) + ' s watched'; $('remaining').textContent = fmt(media.remaining) + ' s remaining';
}
function renderLiking(duration) {
  likingDuration = duration;
  const clip = clips[active], predicted = clip?.observation.prediction.predicted_watch_seconds;
  const score = FlyLiking.score(predicted, clip?.watch_time, duration);
  $('liking-score').textContent = score === null ? '—' : Math.round(score);
  $('score-duration').textContent = fmt(duration) + ' s';
  $('liking-verdict').textContent = score === null ? 'Waiting for the brain snack…' :
    score >= 80 ? 'Certified brain snack.' : score >= 55 ? 'The antennae approve.' : score >= 30 ? 'Mildly snackable.' : 'Already thinking about the next one.';
}
function nextClip() {
  if (transitioning || !clips.length) return;
  transitioning = true; video.pause(); swipeUntil = performance.now() + 460;
  stage.classList.add('scrolling'); $('thought-caption').textContent = 'next. for science.';
  setTimeout(() => { selectClip(active + 1); document.querySelector('.stage').classList.remove('scrolling'); transitioning = false; }, reduced ? 0 : 460);
}
$('play').addEventListener('click', () => { clock.running = !clock.running; $('play').textContent = clock.running ? 'Pause' : 'Play'; if (clock.running) resumeVideo(); else video.pause(); });
$('next').addEventListener('click', nextClip);
$('speed').addEventListener('change', () => { video.playbackRate = Number($('speed').value); });
$('reset-brain').addEventListener('click', () => { brainView.yaw = -.2; brainView.pitch = .06; brainView.zoom = 1; brainView.draw(); });
video.addEventListener('error', () => { clock.running = false; $('play').textContent = 'Play'; $('status').textContent = 'This video could not load. Its original file must be included with the recorded run.'; });
document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); else resumeVideo(); });
function drawFly(time) {
  if (lastFrame && ((clock.running && !video.paused && !document.hidden) || transitioning)) visualTime += Math.min(.05, (time - lastFrame) / 1000);
  lastFrame = time;
  const swipeProgress = !reduced && transitioning ? Math.max(0, Math.min(1, 1 - (swipeUntil - time) / 460)) : 1;
  const swipe = WireheadModel.sampleSwipe(swipeProgress);
  video.style.transform = !reduced && transitioning ? `translateY(${-115 * swipe.screen}%) rotate(${-7 * swipe.screen}deg) scale(${1 - .1 * swipe.screen})` : '';
  const pose = performanceState.pose(clock.elapsed);
  flyView?.draw(visualTime, reduced ? { ...pose, reduced: true, reach: 0, cheer: pose.liked ? .65 : 0, after: 1, swipeProgress: 1 } : { ...pose, swipeProgress });
  if (likeUntil && time >= likeUntil) { stage.classList.remove('liking'); likeUntil = 0; }
}
function makeRegions() {
  $('brain-regions').replaceChildren(); regionElements.length = 0;
  for (const region of brainMetadata.regions) {
    const row = document.createElement('div'), line = document.createElement('div'), dot = document.createElement('i'), label = document.createElement('strong'), output = document.createElement('output'), track = document.createElement('div'), fill = document.createElement('i');
    row.style.setProperty('--region', region.color); line.className = 'region-line'; dot.className = 'region-dot'; label.textContent = region.label;
    track.className = 'region-track'; track.appendChild(fill); line.append(dot, label, output); row.append(line, track);
    $('brain-regions').appendChild(row); regionElements.push({ row, output, fill });
  }
}
function paintActivity(force = false) {
  const recording = recordings.get(clips[active]?.content_id);
  const index = ActivityClock.activityIndex(recording?.bins, clock.elapsed);
  $('brain-state').textContent = !recording ? (brainFailure ? 'Activity unavailable for this clip' : 'Loading neural recording…') : clock.elapsed < .1 ? (clock.running ? 'Starting playback…' : 'Ready · press Play') : transitioning ? 'Scrolling…' : clock.running && !video.paused ? 'Recorded activity · playing' : 'Recorded activity · paused';
  if (!force && index === lastBin) return;
  lastBin = index;
  const bin = index >= 0 ? recording.bins[index] : null;
  $('brain-time').textContent = fmt(bin?.time ?? 0) + ' s';
  $('network-spikes').textContent = bin ? bin.network_spikes.toLocaleString() : '—';
  updateCells(bin?.dan_hz);
  const activity = {};
  if (bin) brainMetadata.display_ids.forEach((id, i) => { activity[id] = bin.display_hz[i] / brainMetadata.brightness_saturation_hz; });
  brainView.setTelemetry({ activity });
  regionElements.forEach(({ row, output, fill }, i) => {
    const hz = bin?.region_hz[i] ?? 0, fraction = bin?.region_active_fraction[i] ?? 0;
    output.textContent = bin ? fmt(hz) + ' Hz' : '—';
    // All regions use the same fixed 50 Hz scale, as does anatomical brightness.
    fill.style.width = Math.min(100, hz / 50 * 100) + '%';
    row.title = brainMetadata.regions[i].neurons.toLocaleString() + ' neurons · ' + fmt(fraction * 100) + '% fired in this 100 ms window · ' + brainMetadata.regions[i].superclasses.join(', ');
  });
  $('top-neurons').replaceChildren();
  if (!bin?.top.length) { const li = document.createElement('li'); li.textContent = bin ? 'No spikes in this window.' : 'Activity appears after the first 100 ms.'; $('top-neurons').appendChild(li); }
  for (const cell of bin?.top || []) {
    const li = document.createElement('li'), name = document.createElement('b'), id = document.createElement('span'), value = document.createElement('output');
    name.textContent = cell.type || 'Unclassified'; name.style.color = brainMetadata.regions[cell.group].color;
    id.textContent = cell.id; value.textContent = fmt(cell.hz) + ' Hz'; li.append(name, id, value); $('top-neurons').appendChild(li);
  }
}
async function fetchJSON(path) { const response = await fetch(path); if (!response.ok) throw Error('Missing ' + path); return response.json(); }
async function loadBrain() {
  try {
    const [metadata, geometry] = await Promise.all([fetchJSON('brain-activity.json'), fetchJSON('brain-geometry.json')]);
    brainMetadata = metadata; brainView.setGeometry(geometry); makeRegions();
    $('display-count').textContent = metadata.display_ids.length + ' anatomical cells'; $('anatomy-count').textContent = String(metadata.display_ids.length);
    await Promise.all(metadata.clips.map(async clip => { const data = await fetchJSON(clip.file); recordings.set(clip.content_id, data); }));
    paintActivity(true);
  } catch { brainFailure = true; paintActivity(true); }
}
function tick(time) {
  const current = video.currentTime;
  if (!transitioning && !document.hidden && clips.length && video.readyState >= 2 && !video.paused) {
    const delta = ActivityClock.mediaDelta(lastMedia, current, video.duration); lastMedia = current;
    const finished = clock.advance(delta);
    maybeLike(time);
    if (finished) nextClip();
  }
  renderProgress();
  // At fast playback, render the latest recorded window at most 10 times/s.
  // The media clock and swipe deadline still advance every animation frame.
  if (time - lastBrainPaint >= 100) { paintActivity(); lastBrainPaint = time; }
  drawFly(time); requestAnimationFrame(tick);
}
async function load() {
  try {
    const data = await fetchJSON('replay.json');
    clips = data.clips.filter(c => c.media && c.observation?.prediction && Number.isFinite(c.observation.prediction.seconds));
    if (!clips.length) throw Error('No video predictions');
    const m = data.metrics; $('error').textContent = fmt(m.mae_seconds) + ' s'; $('baseline').textContent = fmt(m.median_baseline_mae_seconds) + ' s';
    const better = m.mae_seconds < m.median_baseline_mae_seconds;
    $('finding').textContent = `${m.train_videos} training videos · ${m.test_videos} held-out videos from ${m.test_creators} unseen creators. Showing ${clips.length} held-out clips. ${better ? 'The fly readout beats the constant baseline in this sample.' : 'The fly readout does not beat the constant baseline in this sample.'} Target: median measured viewing time. Only the dopamine readout was fitted; the full connectome stayed fixed.`;
    video.muted = true; clock.running = true; $('play').textContent = 'Pause';
    $('play').disabled = false; $('next').disabled = false; selectClip(0); loadBrain();
  } catch { $('status').textContent = 'No recorded video run is available. Export a completed ShortVideo run to view the fly’s predictions.'; }
}
requestAnimationFrame(tick); load();
