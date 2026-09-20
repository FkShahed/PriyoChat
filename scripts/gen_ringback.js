/**
 * Generates a professional WhatsApp/Messenger-style ringback tone.
 * Pattern: 0.8s dual-tone (480Hz + 440Hz) ON, then 1.7s silence, looping.
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const CHANNELS = 1; // Mono is fine for ringback
const BITS = 16;
const DURATION_SECS = 3.5; // enough for 1.5 cycles, will loop in app

const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SECS);
const DATA_SIZE = NUM_SAMPLES * CHANNELS * (BITS / 8);
const buf = Buffer.alloc(44 + DATA_SIZE);

// WAV Header
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + DATA_SIZE, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);          // PCM
buf.writeUInt16LE(CHANNELS, 22);
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), 28);
buf.writeUInt16LE(CHANNELS * (BITS / 8), 32);
buf.writeUInt16LE(BITS, 34);
buf.write('data', 36);
buf.writeUInt32LE(DATA_SIZE, 40);

// WhatsApp-style ringback: 480Hz + 440Hz for 0.8s, then silent for 1.7s, repeat
const ON_SECS = 0.8;
const OFF_SECS = 1.7;
const CYCLE = ON_SECS + OFF_SECS;

const FREQ1 = 480; // Hz
const FREQ2 = 440; // Hz
const VOLUME = 0.45;

let offset = 44;
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  const posInCycle = t % CYCLE;
  const isOn = posInCycle < ON_SECS;

  let v = 0;
  if (isOn) {
    // Fade in/out for 10ms to prevent clicks
    const fadeMs = 0.01;
    let amp = VOLUME;
    if (posInCycle < fadeMs) amp *= posInCycle / fadeMs;
    if (posInCycle > ON_SECS - fadeMs) amp *= (ON_SECS - posInCycle) / fadeMs;
    v = amp * (Math.sin(2 * Math.PI * FREQ1 * t) + Math.sin(2 * Math.PI * FREQ2 * t)) / 2;
  }

  const sample = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  buf.writeInt16LE(sample, offset);
  offset += 2;
}

const outPath = path.join(__dirname, '..', 'assets', 'ringback.wav');
fs.writeFileSync(outPath, buf);
console.log(`✅ Ringback tone saved to: ${outPath}`);
