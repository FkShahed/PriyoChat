import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle, Line, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

// The sun's path across the sky: a TRUE half circle (same radius across and up), centred in the card.
//  - A soft glowing dome under a thick rounded path that runs from sunrise (left) to sunset (right).
//  - The part the sun has already travelled glows in sunrise-orange -> gold -> sunset-rose; the rest is a faint track.
//  - The sun sits exactly where it is now, with a halo and little rays.
//  - At night the same half circle stays, but empty (no sun): a few stars and the moon sit inside.
// progress: 0..1 while the sun is up, null at night.

// A natural-looking night sky: many tiny stars of different size and brightness scattered inside the dome
// (fixed positions from a small seeded generator, so they never jump around); a few bright ones get a soft glow.
const SKY = (() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: 34 }, () => ({ u: rnd() * 2 - 1, v: rnd(), z: rnd(), o: rnd() }));
})();

export default function SunArc({ width, progress, moon, label }) {
  if (!width || width < 80) return <View style={{ height: 100 }} />;
  const day = progress != null;
  const cx = width / 2;
  const r = Math.min(width / 2 - 14, 76); // height of the curve (shorter than before: was 96)
  // the two ends (sunrise on the left, sunset on the right) stay as far out to the sides as before
  const rx = Math.min(width / 2 - 8, 118);
  const x0 = cx - rx;
  const x1 = cx + rx;
  const top = 14; // room above the dome for the sun's halo
  const BASE = top + r; // the bottom of the half circle
  const H = BASE + 8;

  // the curve: both ends lie down gently like ramps (flat at the bottom, then rising), the middle is a soft round top
  const P = 1.6;
  const pt = (t) => [cx - rx * Math.cos(Math.PI * t), BASE - r * Math.pow(Math.sin(Math.PI * t), P)];
  const build = (tEnd) => {
    const n = Math.max(2, Math.ceil(60 * tEnd));
    let d = '';
    for (let i = 0; i <= n; i++) {
      const [px, py] = pt((tEnd * i) / n);
      d += `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)} `;
    }
    return d;
  };
  const arc = build(1);
  const dome = `${arc} Z`;
  let sx = 0;
  let sy = 0;
  let travelled = null;
  if (day) {
    const t = Math.max(0.001, Math.min(1, progress));
    [sx, sy] = pt(t);
    travelled = build(t);
  }
  const rays = [];
  if (day) {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      rays.push(<Line key={i} x1={sx + 14 * Math.cos(a)} y1={sy + 14 * Math.sin(a)} x2={sx + 19 * Math.cos(a)} y2={sy + 19 * Math.sin(a)} stroke="#FDE68A" strokeWidth={1.8} strokeLinecap="round" opacity={0.85} />);
    }
  }

  return (
    <View style={{ width, height: H }}>
      <Svg width={width} height={H}>
        <Defs>
          {/* sky glow under the path */}
          <SvgGradient id="sunDome" gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={BASE}>
            <Stop offset="0" stopColor={day ? '#FFFFFF' : '#A5B4FC'} stopOpacity={day ? 0.26 : 0.14} />
            <Stop offset="1" stopColor={day ? '#FFFFFF' : '#A5B4FC'} stopOpacity="0" />
          </SvgGradient>
          {/* colour of the path along its length: sunrise orange -> gold -> sunset rose */}
          <SvgGradient id="sunPath" gradientUnits="userSpaceOnUse" x1={x0} y1="0" x2={x1} y2="0">
            <Stop offset="0" stopColor="#FB923C" />
            <Stop offset="0.5" stopColor="#FCD34D" />
            <Stop offset="1" stopColor="#FB7185" />
          </SvgGradient>
        </Defs>

        <Path d={dome} fill="url(#sunDome)" />

        {/* faint track: always there */}
        <Path d={arc} stroke="rgba(255,255,255,0.2)" strokeWidth={6} strokeLinecap="round" fill="none" />

        {day ? (
          <>
            {/* how far the sun has come */}
            <Path d={travelled} stroke="url(#sunPath)" strokeWidth={6} strokeLinecap="round" fill="none" />
            {/* the sun: halo, rays, core */}
            <Circle cx={sx} cy={sy} r={13} fill="#FCD34D" opacity={0.22} />
            <Circle cx={sx} cy={sy} r={6} fill="#FEF3C7" />
          </>
        ) : (
          <>
            {SKY.map((st, i) => {
              const x = cx + st.u * rx * 0.92;
              const y = top + 6 + st.v * (r - 4);
              const tt = Math.acos(Math.max(-1, Math.min(1, (cx - x) / rx))) / Math.PI;
              if (y < BASE - r * Math.pow(Math.sin(Math.PI * tt), P) + 7) return null; // keep them inside the dome
              if (Math.abs(x - cx) < 30 && Math.abs(y - (BASE - r * 0.5 - 4)) < 28) return null; // clear space around the moon
              const bright = st.z > 0.88;
              const rad = bright ? 1.5 : 0.5 + st.z * 0.8;
              const op = bright ? 0.95 : 0.3 + st.o * 0.45;
              return (
                <React.Fragment key={i}>
                  {bright ? <Circle cx={x} cy={y} r={4.5} fill="#C7D2FE" opacity={0.18} /> : null}
                  {bright ? <Line x1={x - 3.6} y1={y} x2={x + 3.6} y2={y} stroke="#E0E7FF" strokeWidth={0.6} opacity={0.7} /> : null}
                  {bright ? <Line x1={x} y1={y - 3.6} x2={x} y2={y + 3.6} stroke="#E0E7FF" strokeWidth={0.6} opacity={0.7} /> : null}
                  <Circle cx={x} cy={y} r={rad} fill={st.o > 0.7 ? '#DBEAFE' : '#FFFFFF'} opacity={op} />
                </React.Fragment>
              );
            })}
          </>
        )}
      </Svg>

      {label ? (
        <Text numberOfLines={1} style={{ position: 'absolute', left: cx - 80, width: 160, top: day ? BASE - 36 : BASE - r * 0.5 + 22, textAlign: 'center', color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '400' }}>{label}</Text>
      ) : null}

      {!day && moon ? (
        <Text style={{ position: 'absolute', top: BASE - r * 0.5 - 20, left: cx - 22, width: 44, textAlign: 'center', fontSize: 32, lineHeight: 40 }}>{moon}</Text>
      ) : null}
    </View>
  );
}
