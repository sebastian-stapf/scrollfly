(function () {
  'use strict';
  const $ = id => document.getElementById(id), { FlyEnv, math: M } = FlyLab;
  const anatomyOnly = document.documentElement.dataset.brainMode === 'anatomy';
  const renderer = new FlyView.ArenaRenderer($('arena'));
  let dimension = 3, env, observation, running = false, accumulator = 0, lastFrame = 0, heldAction = 0;
  const keys = new Set();
  const { SensorReflex } = FlyPolicy;
  let reflex;
  const brainView = new FlyBrain.BrainView($('brain-canvas')), brainClient = new FlyBrain.BrainClient();
  let brainMetadata = null, brainTelemetry = null, brainBusy = false, generation = 0, selectedBrainAction = -1;
  async function connectBrain() {
    if (anatomyOnly) {
      $('brain-status').textContent = 'ANATOMY';
      $('brain-caption').textContent = 'Explore real MaleCNS anatomy. Fly manually or use the sensor reflex demo above; no trained brain or neural activity is running on this page.';
      try {
        const response = await fetch('../brain-geometry.json');
        if (!response.ok) throw new Error('Anatomy unavailable');
        brainView.setGeometry(await response.json());
        $('brain-reference').hidden = true;
        $('brain-orbit-hint').textContent = 'DRAG TO ORBIT · SCROLL TO ZOOM · ANATOMY ONLY';
      } catch {
        $('brain-orbit-hint').textContent = 'ANATOMICAL REFERENCE';
      }
      return;
    }
    $('brain-status').textContent = 'CONNECTING';
    try {
      brainMetadata = await brainClient.connect();
      brainView.setGeometry(await brainClient.get('/geometry'));
      $('brain-reference').hidden = true;
      $('brain-neurons').textContent = brainMetadata.neurons.toLocaleString();
      $('brain-edges').textContent = brainMetadata.edges.toLocaleString();
      $('brain-status').textContent = 'CONNECTED';
      $('brain-orbit-hint').textContent = 'DRAG TO ORBIT · SCROLL TO ZOOM';
      $('brain-caption').textContent = `${brainMetadata.display_neurons} sampled anatomical skeletons. All ${brainMetadata.neurons.toLocaleString()} model neurons participate in inference.`;
      renderBrainStatus(brainMetadata);
      renderBrainActions();
    } catch (error) {
      brainClient.connected = false;
      $('brain-status').textContent = 'OFFLINE';
      $('brain-caption').textContent = 'Brain service is offline. The anatomical reference remains visible; no neural activity is being simulated here.';
    }
  }
  function renderBrainStatus(data) {
    $('brain-checkpoint').textContent = data.checkpoint_label || 'Initialized model · not trained';
    const t = data.training;
    $('brain-training-progress').textContent = t ? `${t.status} · ${Number(t.timesteps || 0).toLocaleString()} RL steps${t.fps ? ' · ' + t.fps.toFixed(1) + ' steps/s' : ''}` : 'Training status unavailable';
    const sensory=data.sensory_inputs||brainTelemetry?.sensory_inputs;
    $('brain-sensors').textContent=sensory ? `${sensory.vision_cameras===2?'Stereo vision':'Vision'} received · ${sensory.visual_neurons.toLocaleString()} visual neurons · ${sensory.smell_received?'Smell received · '+sensory.olfactory_neurons.toLocaleString()+' olfactory neurons':'Smell disabled'}` : 'Sensory receipt appears after a brain action';
  }
  function renderBrainActions() {
    const labels = env?.config.control === 'directional' ? (dimension === 2 ? ['Stay','Up','Down','Left','Right'] : ['Stay','Up','Down','Left','Right','Forward','Backward']) : (dimension === 2 ? ['Left wing','Right wing'] : ['Left wing','Right wing','Pitch','Bank']);
    const list = $('brain-actions'); list.replaceChildren();
    labels.forEach((label, i) => {
      const button = document.createElement('button'); button.type = 'button';
      button.classList.toggle('selected', i === selectedBrainAction); button.setAttribute('aria-pressed', i === selectedBrainAction);
      button.append(document.createTextNode(label));
      const value = brainTelemetry?.outputs?.[i], output = document.createElement('output'); output.textContent = value === undefined ? '—' : value.toFixed(3); button.append(output);
      const meter = document.createElement('span'); meter.className = 'action-meter'; meter.style.display = 'block';
      const bar = document.createElement('i'); const v = value === undefined ? 0 : Math.max(-1,Math.min(1,value));
      const directional=env?.config.control==='directional';
      bar.style.left = directional?'0%':`${v<0?50+v*50:50}%`; bar.style.width = `${Math.abs(v)*(directional?100:50)}%`; meter.append(bar); button.append(meter);
      button.addEventListener('click', () => { selectedBrainAction=i;brainView.selectAction(i);renderBrainActions();renderNeuronList(); });list.append(button);
    });
  }
  function renderNeuronList() {
    const action = selectedBrainAction;
    $('brain-contribution-title').textContent = action < 0 ? 'Active neurons' : 'Neurons contributing to this output';
    const rows = action < 0 ? brainTelemetry?.top_active : brainTelemetry?.top_contributors?.[action];
    $('brain-region-label').textContent = action < 0 ? 'Mean activity by region' : 'Share of absolute output contribution';
    const regions=$('brain-regions');regions.replaceChildren();
    const names={ol_intrinsic:'Optic lobes',ol_sensory:'Visual receptors',cb_intrinsic:'Central brain',vnc_intrinsic:'Nerve cord',descending_neuron:'Descending neurons',vnc_motor:'Nerve cord motor',cb_motor:'Brain motor',cb_sensory:'Brain sensory',visual_projection:'Visual projection'};
    const regionRows=action<0?brainTelemetry?.regions:brainTelemetry?.action_regions?.[action];
    if(regionRows)for(const row of [...regionRows].sort((a,b)=>(b.share??b.activity)-(a.share??a.activity)).slice(0,4)){
      const line=document.createElement('div'),label=document.createElement('span'),value=document.createElement('b');
      label.textContent=names[row.name]||row.name.replaceAll('_',' ');value.textContent=((row.share??row.activity)*100).toFixed(1)+'%';
      line.append(label,value);regions.append(line);
    }
    const list=$('brain-top-neurons');list.replaceChildren();
    if(!rows?.length){const li=document.createElement('li');li.textContent='Waiting for a model observation';list.append(li);return;}
    for(const row of rows.slice(0,6)){
      const li=document.createElement('li'),name=document.createElement('span'),value=document.createElement('b');
      name.textContent=`${row.type || 'Neuron'} · ${row.id}`;name.title=`Body ${row.id}${row.region ? ' · '+row.region : ''}`;
      value.textContent=Number(row.value).toFixed(4);li.append(name,value);list.append(li);
    }
  }
  function clearBrainActivity() {$('brain-status').textContent=anatomyOnly?'ANATOMY':brainClient.connected?'CONNECTED · IDLE':'OFFLINE';$('brain-sensors').textContent='Sensory receipt appears after a brain action';brainTelemetry=null;selectedBrainAction=-1;brainView.setTelemetry(null);brainView.selectAction(-1);renderBrainActions();renderNeuronList();}
  $('brain-connect').addEventListener('click', connectBrain);
  // Progress should stay current even while the interactive episode is paused.
  setInterval(async()=>{
    if(!brainClient.connected||brainBusy)return;
    try{brainMetadata=await brainClient.get('/metadata');renderBrainStatus(brainMetadata);}
    catch{$('brain-training-progress').textContent='Training status unavailable · reconnect brain';}
  },15000);
  $('brain-all').addEventListener('click',()=>{selectedBrainAction=-1;brainView.selectAction(-1);renderBrainActions();renderNeuronList();});
  function readNumber(id) {
    const input = $(id), n = Number(input.value);
    if (!input.value.trim() || !Number.isInteger(n) || n < Number(input.min) || n > Number(input.max)) throw new Error(`Enter ${input.min}–${input.max} for ${input.parentElement.firstChild.textContent.trim()}.`);
    return n;
  }
  function reset() {
    try {
      const config = { dimension, control: $('control').value, sensors: $('sensors').value, rewardCount: readNumber('reward-count'), dangerCount: readNumber('danger-count'), maxSteps: readNumber('duration') * 30, lethalTraps: $('lethal').checked };
      const seed = readNumber('seed'), replacement = new FlyEnv(config);
      const first = replacement.reset(seed);
      generation++; env = replacement; observation = first.observation; reflex = new SensorReflex(env.config);
      clearBrainActivity();
      renderer.reset(); accumulator = 0; keys.clear(); heldAction = 0;
      for (const id of ['left-wing', 'right-wing', 'pitch', 'bank']) { $(id).value = '0'; $(id + '-value').value = '0.00'; }
      $('config-error').hidden = true; $('episode-overlay').hidden = true;
      updateMode(); updateUI();
    } catch (error) { running = false; $('config-error').textContent = error.message; $('config-error').hidden = false; updatePlay(); }
  }
  function updateMode() {
    const c = env.config, wings = c.control === 'wings', stereo = c.dimension === 3;
    $('direction-controls').hidden = wings; $('wing-controls').hidden = !wings;
    document.querySelectorAll('.depth-control, .wing-3d').forEach(el => { el.hidden = !stereo; });
    $('right-eye-card').hidden = !stereo; $('left-label').textContent = stereo ? 'LEFT EYE' : 'FORWARD VIEW';
    $('vision-label').textContent = `${stereo ? 'STEREO' : 'MONO'} · ${c.fov}° FOV`;
    $('camera-caption').textContent = wings ? 'The cameras turn with the fly.' : 'Fixed forward view. Movement keeps both camera and scent axes aligned.';
    $('arena-label').textContent = stereo ? 'SPATIAL ARENA' : 'PLANAR ARENA';
    $('arena-hint').textContent = stereo ? 'Drag to orbit · WASD + E/Q to fly' : 'WASD / arrows to fly';
    $('key-help').textContent = wings ? `W/S thrust · A/D turn${stereo ? ' · ↑/↓ pitch · Q/E bank' : ''}` : `WASD / arrows${stereo ? ' · E forward · Q backward' : ''}`;
    $('smell-state').textContent = c.sensors === 'vision-smell' ? 'ON' : 'OFF';
    $('smell-caption').textContent = c.sensors === 'vision-smell' ? `Poo and flytraps smell alike. Use vision to tell them apart.${stereo ? ' z = body up/down.' : ''}` : 'No smell channel is sent to the agent.';
    $('sensor-help').textContent = c.sensors === 'vision-smell' ? 'Poo and flytraps share one attractive scent. Vision is needed to tell them apart.' : 'Only camera pixels are sent to the agent. Rewards still provide learning feedback.';
    document.querySelectorAll('[data-dimension]').forEach(b => { const selected = Number(b.dataset.dimension) === c.dimension; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', selected); });
    updatePilot();
  }
  function updatePilot() {
    const demo = $('pilot').value !== 'manual';
    $('pilot-help').textContent = $('pilot').value === 'brain' ? 'Runs the actual MaleCNS model on vnode18. Outputs and neural contributions come from its current checkpoint.' : $('pilot').value === 'reflex' ? 'Follows the shared scent and uses camera pixels to recognize rewards and traps. Not trained.' : 'Run the episode, then use the keys or buttons.';
    document.querySelectorAll('[data-action], #wing-controls input, #neutral-wings').forEach(b => { b.disabled = demo; });
  }
  function updatePlay() {
    $('play').textContent = running ? 'Ⅱ Pause' : '▶ Run episode';
    $('live-status').textContent = env && (env.state.terminated || env.state.truncated) ? 'COMPLETE' : running ? ($('pilot').value === 'brain' ? 'MALECNS POLICY' : $('pilot').value === 'reflex' ? 'REFLEX DEMO' : 'MANUAL FLIGHT') : 'PAUSED';
    $('step').disabled = brainBusy || running || (env && (env.state.terminated || env.state.truncated));
    $('play').disabled = env && (env.state.terminated || env.state.truncated);
  }
  function updateUI() {
    const s = env.state, c = env.config;
    $('score').textContent = (s.score > 0 ? '+' : '') + s.score.toFixed(2);
    $('collected').replaceChildren(document.createTextNode(`${s.collected} `), Object.assign(document.createElement('em'), { textContent: `/ ${c.rewardCount}` }));
    $('hits').textContent = s.hits;
    $('time').replaceChildren(document.createTextNode(String(Math.ceil((c.maxSteps - s.steps) * c.dt))), Object.assign(document.createElement('em'), { textContent: 's' }));
    $('step-count').textContent = `step ${s.steps} / ${c.maxSteps}`;
    const v = observation.vision;
    FlyView.drawPixels($('eye-left'), v.mono || v.left, v.width, v.height);
    if (v.right) FlyView.drawPixels($('eye-right'), v.right, v.width, v.height);
    FlyView.drawSmell($('smell'), observation.smell, c.dimension);
    $('scent-strength').textContent = observation.smell ? observation.smell.at(-1).toFixed(2) : '—';
    updatePlay();
  }
  function manualAction() {
    const c = env.config, pressed = (...choices) => choices.some(k => keys.has(k));
    if (c.control === 'directional') {
      if (heldAction) return heldAction;
      if (pressed('w', 'arrowup')) return 1;
      if (pressed('s', 'arrowdown')) return 2;
      if (pressed('a', 'arrowleft')) return 3;
      if (pressed('d', 'arrowright')) return 4;
      if (c.dimension === 3 && pressed('e')) return 5;
      if (c.dimension === 3 && pressed('q')) return 6;
      return 0;
    }
    let left = Number($('left-wing').value), right = Number($('right-wing').value);
    if (pressed('w', 's', 'a', 'd')) {
      const thrust = (pressed('w') ? .8 : 0) - (pressed('s') ? .8 : 0), turn = (pressed('a') ? .75 : 0) - (pressed('d') ? .75 : 0);
      left = M.clamp(thrust + turn, -1, 1); right = M.clamp(thrust - turn, -1, 1);
    }
    const action = [left, right];
    if (c.dimension === 3) action.push(pressed('arrowup', 'arrowdown') ? (pressed('arrowup') ? .8 : -.8) : Number($('pitch').value), pressed('q', 'e') ? (pressed('q') ? -.8 : .8) : Number($('bank').value));
    return action;
  }
  async function advanceBrain() {
    if (brainBusy || env.state.terminated || env.state.truncated) return;
    const currentGeneration = generation, wasRunning = running;
    brainBusy = true; updatePlay();
    try {
      if (!brainClient.connected) throw new Error('Connect the brain service before running the MaleCNS pilot.');
      const result = await brainClient.infer(observation, env.config);
      if (generation !== currentGeneration || $('pilot').value !== 'brain' || (wasRunning && !running)) return;
      brainTelemetry = result;brainView.setTelemetry(result);renderBrainStatus(result);renderBrainActions();renderNeuronList();
      $('brain-status').textContent = result.trained ? 'CHECKPOINT POLICY' : 'UNTRAINED POLICY';
      for(let i=0;i<result.action_repeat;i++){
        if(env.state.terminated||env.state.truncated)break;
        applyAction(result.action);
      }
      updateUI();
    } catch(error) {
      if(generation === currentGeneration){running=false;clearBrainActivity();$('config-error').textContent=error.message;$('config-error').hidden=false;$('brain-status').textContent='INFERENCE ERROR';}
    } finally {brainBusy=false;updatePlay();}
  }
  function applyAction(action) {
    const result = env.step(action);
    observation = result.observation;
    if (result.terminated || result.truncated) {
      running = false; $('episode-overlay').hidden = false;
      $('episode-title').textContent = result.truncated ? 'Time’s up.' : env.state.collected === env.config.rewardCount ? 'Every reward collected.' : 'Caught by a flytrap.';
      $('episode-summary').textContent = `${env.state.collected} rewards · ${env.state.hits} trap contacts · ${env.state.score.toFixed(2)} return`;
      $('announcer').textContent = $('episode-title').textContent + ' ' + $('episode-summary').textContent;
    }
  }
  function advance() {
    if (env.state.terminated || env.state.truncated) return;
    if ($('pilot').value === 'brain') { void advanceBrain(); return; }
    applyAction($('pilot').value === 'reflex' ? reflex.act(observation) : manualAction());
  }

  function frame(now) {
    const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, .2) : 0; lastFrame = now;
    if (running) {
      accumulator += elapsed * Number($('speed').value);
      if ($('pilot').value === 'brain') {
        if(!brainBusy && accumulator >= env.config.dt*4){accumulator=0;void advanceBrain();}
      } else {
      let steps = 0;
      while (accumulator >= env.config.dt && running && steps < 12) { advance(); accumulator -= env.config.dt; steps++; }
      if (steps) updateUI();
      }
    }
    renderer.draw(env, now); requestAnimationFrame(frame);
  }
  $('play').addEventListener('click', () => { running = !running; accumulator = 0; updatePlay(); });
  $('step').addEventListener('click', () => { advance(); updateUI(); });
  $('reset').addEventListener('click', reset);
  $('play-again').addEventListener('click', () => { reset(); running = true; updatePlay(); });
  $('new-world').addEventListener('click', () => { const seed = new Uint32Array(1); crypto.getRandomValues(seed); $('seed').value = String(seed[0]); reset(); });
  document.querySelectorAll('[data-dimension]').forEach(b => b.addEventListener('click', () => { dimension = Number(b.dataset.dimension); reset(); }));
  for (const id of ['control', 'sensors', 'reward-count', 'danger-count', 'duration', 'seed', 'lethal']) $(id).addEventListener('change', reset);
  $('pilot').addEventListener('change', () => {
    // Restart so the reflex's action-derived orientation memory always has a known origin.
    reset();
  });
  for (const id of ['left-wing', 'right-wing', 'pitch', 'bank']) $(id).addEventListener('input', () => { $(id + '-value').value = Number($(id).value).toFixed(2); });
  $('neutral-wings').addEventListener('click', () => { for (const id of ['left-wing', 'right-wing', 'pitch', 'bank']) { $(id).value = '0'; $(id + '-value').value = '0.00'; } keys.clear(); });
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('pointerdown', e => { heldAction = Number(button.dataset.action); button.setPointerCapture(e.pointerId); button.classList.add('held'); e.preventDefault(); });
    const release = () => { heldAction = 0; button.classList.remove('held'); };
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
    button.addEventListener('click', e => { if (e.detail === 0 && !running) { heldAction = Number(button.dataset.action); advance(); heldAction = 0; updateUI(); } });
  });
  document.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (!e.repeat && !env.state.terminated && !env.state.truncated) { running = !running; accumulator = 0; updatePlay(); } }
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) { e.preventDefault(); keys.add(key); }
  });
  document.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  const releaseInput = () => { keys.clear(); heldAction = 0; document.querySelectorAll('.held').forEach(b => b.classList.remove('held')); };
  window.addEventListener('blur', releaseInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseInput(); running = false; accumulator = 0; updatePlay(); } });
  // Diagnostic API is explicit and separate from the policy's observation interface.
  window.Flyspace = { get environment() { return env; }, get observation() { return observation; }, SensorReflex };
  reset(); requestAnimationFrame(frame); void connectBrain();
})();
