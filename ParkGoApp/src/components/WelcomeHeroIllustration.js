import React from 'react';
import { useWindowDimensions } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

/** Port of web `WelcomeHeroIllustration` (decorative isometric art). */
export function WelcomeHeroIllustration() {
  const { width: winW } = useWindowDimensions();
  const w = Math.min(Math.max(280, winW - 32), 440);
  const h = Math.round((w * 360) / 440);

  return (
    <Svg width={w} height={h} viewBox="0 0 440 360" accessibilityRole="image" accessibilityLabel="">
      <Defs>
        <LinearGradient id="wh-sky" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#e0f2fe" />
          <Stop offset="100%" stopColor="#f0f9ff" />
        </LinearGradient>
        <LinearGradient id="wh-phone" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#ffffff" />
          <Stop offset="100%" stopColor="#e2e8f0" />
        </LinearGradient>
        <LinearGradient id="wh-pin" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#3b82f6" />
          <Stop offset="100%" stopColor="#1d4ed8" />
        </LinearGradient>
      </Defs>
      <Rect width={440} height={360} fill="url(#wh-sky)" rx={24} />
      <Ellipse cx={220} cy={300} rx={180} ry={28} fill="#cbd5e1" opacity={0.35} />
      <Path d="M60 240 L220 180 L380 240 L220 300 Z" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth={1} />
      <G transform="translate(130, 72)">
        <Rect x={0} y={0} width={180} height={220} rx={18} fill="url(#wh-phone)" stroke="#cbd5e1" strokeWidth={2} />
        <Rect x={12} y={24} width={156} height={168} rx={8} fill="#0f172a" opacity={0.06} />
        <Rect x={20} y={32} width={140} height={152} rx={6} fill="#1e293b" />
        <G transform="translate(28, 44)">
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3].map((col) => (
              <Rect
                key={`${row}-${col}`}
                x={col * 30 + (row % 2) * 8}
                y={row * 38}
                width={22}
                height={32}
                rx={3}
                fill={row % 2 === 0 ? '#22c55e' : '#4ade80'}
                opacity={0.85}
              />
            ))
          )}
          <Rect x={4} y={118} width={120} height={8} rx={2} fill="#64748b" opacity={0.5} />
        </G>
        <Ellipse cx={90} cy={206} rx={28} ry={4} fill="#cbd5e1" />
      </G>
      <G transform="translate(198, 48)">
        <Path d="M22 0C10 0 0 9 0 20c0 16 22 36 22 36s22-20 22-36C44 9 34 0 22 0z" fill="url(#wh-pin)" />
        <Circle cx={22} cy={20} r={10} fill="#fff" />
        <SvgText
          x={22}
          y={26}
          textAnchor="middle"
          fontSize={14}
          fontWeight="700"
          fill="#1d4ed8"
          fontFamily="System"
        >
          P
        </SvgText>
      </G>
      <Rect x={48} y={168} width={36} height={52} rx={4} fill="#fff" stroke="#e2e8f0" />
      <Rect x={56} y={152} width={20} height={20} rx={2} fill="#bfdbfe" />
      <Rect x={356} y={176} width={40} height={44} rx={4} fill="#fff" stroke="#e2e8f0" />
      <Rect x={364} y={160} width={24} height={18} rx={2} fill="#bfdbfe" />
      <Rect x={72} y={248} width={28} height={14} rx={3} fill="#fff" stroke="#94a3b8" />
      <Rect x={320} y={252} width={26} height={12} rx={3} fill="#3b82f6" opacity={0.9} />
      <Rect x={260} y={268} width={24} height={11} rx={3} fill="#22c55e" opacity={0.85} />
      <Circle cx={40} cy={220} r={14} fill="#22c55e" opacity={0.7} />
      <Rect x={36} y={228} width={8} height={16} fill="#78716c" rx={1} />
      <Circle cx={400} cy={228} r={12} fill="#22c55e" opacity={0.65} />
      <Rect x={397} y={234} width={6} height={12} fill="#78716c" rx={1} />
    </Svg>
  );
}
