import React from 'react';
import Svg, { Rect, Path } from 'react-native-svg';

// Custom "feed" glyph: a stack of story cards (a card peeking out behind, a picture block and text lines).
// Drawn as a line icon; the active state is bolder with the picture block filled.
export default function FeedIcon({ size = 24, color = '#000', active = false }) {
  const sw = active ? 2.1 : 1.8;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* card peeking out behind */}
      <Path d="M7 3.4h10" stroke={color} strokeWidth={sw} strokeLinecap="round" opacity={active ? 1 : 0.7} />
      {/* front card */}
      <Rect x="3" y="6.4" width="18" height="14.2" rx="4.2" stroke={color} strokeWidth={sw} />
      {/* picture block */}
      <Rect x="6.2" y="9.8" width="5.2" height="5.2" rx="1.5" stroke={color} strokeWidth={sw} fill={active ? color : 'none'} />
      {/* headline lines */}
      <Path d="M13.9 10.5h3.2M13.9 14h3.2M6.3 17.5h10.8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}
