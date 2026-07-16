// Real-time pitch detection using the ACF2+ autocorrelation algorithm.
// Everything here runs in the browser — audio never leaves the device.

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

// Convert a frequency in Hz to the nearest MIDI note number.
export function freqToMidi(freq) {
  return Math.round(12 * (Math.log2(freq / 440)) + 69);
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi) {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

// How many cents (hundredths of a semitone) a frequency is from a MIDI note.
// Positive = sharp (too high), negative = flat (too low).
export function centsOff(freq, midi) {
  return Math.floor(1200 * Math.log2(freq / midiToFreq(midi)));
}

/**
 * Estimate the fundamental frequency of a buffer of PCM samples.
 * Returns the frequency in Hz, or -1 if the signal is too quiet / unpitched.
 */
export function autoCorrelate(buffer, sampleRate) {
  const SIZE = buffer.length;

  // Bail out if the signal is basically silence.
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  // Trim near-silent edges to sharpen the correlation.
  let r1 = 0;
  let r2 = SIZE - 1;
  const threshold = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < threshold) {
      r2 = SIZE - i;
      break;
    }
  }

  const trimmed = buffer.slice(r1, r2);
  const trimmedSize = trimmed.length;

  const c = new Array(trimmedSize).fill(0);
  for (let lag = 0; lag < trimmedSize; lag++) {
    for (let i = 0; i < trimmedSize - lag; i++) {
      c[lag] += trimmed[i] * trimmed[i + lag];
    }
  }

  // Find the first dip, then the peak after it.
  let d = 0;
  while (d < trimmedSize - 1 && c[d] > c[d + 1]) d++;

  let maxValue = -1;
  let maxIndex = -1;
  for (let i = d; i < trimmedSize; i++) {
    if (c[i] > maxValue) {
      maxValue = c[i];
      maxIndex = i;
    }
  }
  let T0 = maxIndex;
  if (T0 <= 0) return -1;

  // Parabolic interpolation around the peak for sub-sample accuracy.
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? x2;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  return sampleRate / T0;
}

/**
 * Wraps microphone access and provides a per-frame pitch reading.
 */
export class PitchTracker {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.stream = null;
    this.buffer = new Float32Array(2048);
    this.running = false;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.running = true;
  }

  stop() {
    this.running = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  // Returns { freq, midi, note, cents } or null if no clear pitch this frame.
  read() {
    if (!this.running || !this.analyser) return null;
    this.analyser.getFloatTimeDomainData(this.buffer);
    const freq = autoCorrelate(this.buffer, this.audioContext.sampleRate);
    if (freq <= 0) return null;
    const midi = freqToMidi(freq);
    return {
      freq,
      midi,
      note: midiToNoteName(midi),
      cents: centsOff(freq, midi),
    };
  }

  // Play a reference tone (for pitch-matching exercises).
  playTone(freq, durationMs = 1500) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + durationMs / 1000,
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    osc.onended = () => ctx.close();
  }
}
