import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Path, Circle } from 'react-native-svg';

export default function LogoSVG({ size = 100, style }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <Defs>
        <LinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#00C6FF" />
          <Stop offset="100%" stopColor="#0072FF" />
        </LinearGradient>
        
        {/* Glow effect gradient */}
        <LinearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#00C6FF" stopOpacity="0.8"/>
          <Stop offset="100%" stopColor="#0072FF" stopOpacity="0.8"/>
        </LinearGradient>
      </Defs>

      {/* Background shadow/glow (optional, just for depth) */}
      <Path
        d="M35 20 C65 20, 80 30, 80 50 C80 70, 65 80, 35 80 L35 80 L35 20 Z"
        fill="url(#glow)"
        transform="translate(2, 4)"
      />
      <Path
        d="M25 20 C25 15, 30 10, 35 10 L35 10 C35 10, 35 90, 35 90 C30 90, 25 85, 25 80 Z"
        fill="url(#glow)"
        transform="translate(2, 4)"
      />

      {/* Main P shape */}
      {/* Stem of the P */}
      <Path
        d="M25 15 C25 9.47, 29.47 5, 35 5 L35 5 L35 95 C29.47 95, 25 90.53, 25 85 Z"
        fill="url(#grad)"
      />
      
      {/* Loop of the P */}
      <Path
        d="M34 5 L55 5 C74.33 5, 90 20.67, 90 40 C90 59.33, 74.33 75, 55 75 L34 75 Z"
        fill="url(#grad)"
      />
      
      {/* Cutout (Inner circle of the P) */}
      <Circle cx="52" cy="40" r="16" fill="#0D1A3A" />
      
      {/* Heart inside the cutout */}
      <Path
        d="M52 46.5 C52 46.5, 45 40.5, 45 36.5 C45 33.5, 47.5 31, 50.5 31 C52 31, 53.5 31.8, 54 33 C54.5 31.8, 56 31, 57.5 31 C60.5 31, 63 33.5, 63 36.5 C63 40.5, 56 46.5, 56 46.5 L54 48.5 L52 46.5 Z"
        fill="#FFFFFF"
        transform="translate(-2, 0)"
      />
    </Svg>
  );
}
