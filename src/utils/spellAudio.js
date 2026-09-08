const AUDIO_KEY = 'hechi-spell-audio';
let contexto;
let fuentes = [];
let generacion = 0;
let vozActual;

export function sonidoHabilitado() {
  try { return localStorage.getItem(AUDIO_KEY) !== 'off'; } catch { return true; }
}

export function guardarSonido(habilitado) {
  try { localStorage.setItem(AUDIO_KEY, habilitado ? 'on' : 'off'); } catch { /* Preferencia solo para esta sesion. */ }
}

export function prepararAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    contexto ??= new Audio();
    if (contexto.state === 'suspended') contexto.resume().catch(() => {});
  } catch { /* El audio nunca debe impedir abrir una carta. */ }
}

export function detenerHechizo() {
  generacion += 1;
  for (const fuente of fuentes) {
    try { fuente.stop(); } catch { /* Ya termino. */ }
  }
  fuentes = [];
  if (vozActual) window.speechSynthesis?.cancel();
  vozActual = null;
}

export function reproducirHechizo(numero, titulo) {
  detenerHechizo();
  prepararAudio();
  const turno = generacion;
  if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
    const voz = new window.SpeechSynthesisUtterance(titulo);
    const voces = window.speechSynthesis.getVoices();
    const elegida = voces.find((item) => /^es[-_]MX$/i.test(item.lang)) || voces.find((item) => /^es/i.test(item.lang));
    if (elegida) voz.voice = elegida;
    voz.lang = elegida?.lang || 'es-MX';
    voz.rate = 0.85;
    voz.pitch = [3, 9, 10, 12].includes(numero) ? 0.7 : 1;
    voz.volume = 0.9;
    vozActual = voz;
    try { window.speechSynthesis.speak(voz); } catch { /* Mantener el efecto si la voz no esta disponible. */ }
  }
  const tocar = () => {
    if (turno !== generacion || contexto?.state !== 'running') return;
    const oscuro = [3, 9, 10, 12].includes(numero);
    const base = (oscuro ? 100 : 280) + numero * 13;
    const inicio = contexto.currentTime;
    // Cada carta tiene su propio tono, ritmo y recorrido armonico.
    for (let i = 0; i < 5; i += 1) {
      const oscilador = contexto.createOscillator();
      const volumen = contexto.createGain();
      const tiempo = inicio + i * (0.09 + (numero % 4) * 0.025);
      const frecuencia = base * [1, 1.5, 2, 2.5, 3][oscuro ? 4 - i : i];
      oscilador.type = oscuro ? 'triangle' : 'sine';
      oscilador.frequency.setValueAtTime(frecuencia, tiempo);
      oscilador.frequency.exponentialRampToValueAtTime(frecuencia * (oscuro ? 0.5 : 1.2), tiempo + 0.65);
      volumen.gain.setValueAtTime(0, tiempo);
      volumen.gain.linearRampToValueAtTime(0.055, tiempo + 0.025);
      volumen.gain.exponentialRampToValueAtTime(0.001, tiempo + 0.7);
      oscilador.connect(volumen);
      volumen.connect(contexto.destination);
      fuentes.push(oscilador);
      oscilador.onended = () => {
        oscilador.disconnect();
        volumen.disconnect();
        fuentes = fuentes.filter((fuente) => fuente !== oscilador);
      };
      oscilador.start(tiempo);
      oscilador.stop(tiempo + 0.75);
    }
  };
  if (contexto?.state === 'running') tocar();
  else if (contexto) contexto.resume().then(tocar).catch(() => {});
}
