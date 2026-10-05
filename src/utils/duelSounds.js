// Short synthesized effects: no downloads and no audio until a user gesture.
export function createDuelSounds() {
  let context;
  let enabled = true;
  let lastBrowse = -Infinity;
  const voices = new Set();
  try { enabled = localStorage.getItem('hechi-duel-sound') !== 'off'; } catch { /* Storage may be blocked. */ }
  const stop = () => {
    for (const source of voices) { try { source.stop(); } catch { /* Already ended. */ } }
    voices.clear();
  };
  const unlock = () => {
    if (!enabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context ??= new Audio();
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* Audio is optional; never interrupt a duel. */ }
  };
  const play = kind => {
    if (!enabled || document.hidden || context?.state !== 'running') return;
    const now = context.currentTime;
    if (kind === 'browse' && now - lastBrowse < 0.065) return;
    if (kind === 'browse') lastBrowse = now;
    // Duration, filtered air sweep, body pitch, volume. Slash has a metallic tail.
    const presets = {
      browse: [0.045, 2400, 1000, 550, 0.035],
      flip: [0.16, 1200, 4500, 330, 0.055],
      place: [0.13, 1700, 450, 150, 0.08],
      attack: [0.24, 650, 5000, 280, 0.075],
      slash: [0.48, 6200, 650, 1400, 0.1],
      fusion: [0.55, 500, 3500, 440, 0.055],
    };
    const preset = presets[kind];
    if (!preset) return;
    try {
      const [duration, from, to, pitch, volume] = preset;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      gain.connect(context.destination);
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass'; filter.Q.value = kind === 'slash' ? 1.8 : 0.7;
      filter.frequency.setValueAtTime(from, now);
      filter.frequency.exponentialRampToValueAtTime(to, now + duration);
      filter.connect(gain);
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource(); noise.buffer = buffer;
      const tone = context.createOscillator(); tone.type = 'sine';
      tone.frequency.setValueAtTime(pitch, now);
      tone.frequency.exponentialRampToValueAtTime(kind === 'fusion' ? 880 : pitch * 0.3, now + duration);
      const body = context.createGain(); body.gain.value = 0.22;
      tone.connect(body); body.connect(gain); noise.connect(filter);
      for (const source of [noise, tone]) {
        voices.add(source);
        source.onended = () => {
          voices.delete(source); source.disconnect();
          if (source === tone) { body.disconnect(); filter.disconnect(); gain.disconnect(); }
        };
        source.start(now); source.stop(now + duration);
      }
    } catch { /* Unsupported audio must not affect gameplay. */ }
  };
  return {
    get enabled() { return enabled; }, unlock, play, stop,
    setEnabled(value) {
      enabled = value;
      try { localStorage.setItem('hechi-duel-sound', value ? 'on' : 'off'); } catch { /* Optional persistence. */ }
      if (!value) stop(); else unlock();
    },
    dispose() { stop(); const previous = context; context = undefined; lastBrowse = -Infinity; if (previous) void previous.close().catch(() => {}); },
  };
}

export function combatSoundCues(event) {
  if (event.tipo === 'fusion') return [[0, 'fusion']];
  if (event.trampa) return [[650, 'flip']];
  if (event.directo) return [[0, 'attack']];
  const rebound = event.defensor?.posicion === 'ataque' && event.danoActor > 0 && event.ataque < event.defensa;
  const cues = [[400, 'attack']];
  if (event.destruidoRival || (event.destruidoActor && !rebound)) cues.push([900, 'slash']);
  if (rebound) cues.push([1100, 'attack']);
  if (rebound && event.destruidoActor) cues.push([1500, 'slash']);
  return cues;
}
