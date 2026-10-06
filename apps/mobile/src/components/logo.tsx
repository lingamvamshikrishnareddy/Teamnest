import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Original TeamNest mark (see apps/web/src/components/logo.tsx). */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect width={32} height={32} rx={9} fill="#FFFFFF" fillOpacity={0.14} />
      <Path d="M7 15.5a9 9 0 0 0 18 0" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" />
      <Path d="M10.5 15.5a5.5 5.5 0 0 0 11 0" stroke="#14B8A6" strokeWidth={2.6} strokeLinecap="round" />
      <Circle cx={16} cy={11} r={2.6} fill="#F97316" />
    </Svg>
  );
}
