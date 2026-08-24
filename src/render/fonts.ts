import { Platform } from 'react-native';
import { matchFont, type SkFont } from '@shopify/react-native-skia';
import { CONFIG } from '../game/config';

// Procedural-only rendering: system typeface, no bundled font assets.

export interface GameFonts {
  label: SkFont;
  gate: SkFont;
  small: SkFont;
  boss: SkFont;
}

const FONT_FAMILY = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });

function heavy(fontSize: number): SkFont {
  // Heaviest weight the system face offers; falls back to bold where the
  // family has no black cut.
  return matchFont({ fontFamily: FONT_FAMILY, fontSize, fontWeight: '900' });
}

function bold(fontSize: number): SkFont {
  return matchFont({ fontFamily: FONT_FAMILY, fontSize, fontWeight: 'bold' });
}

export function createGameFonts(): GameFonts {
  return {
    label: heavy(CONFIG.crowd.labelFontSize),
    gate: heavy(CONFIG.gates.textFontSize),
    small: bold(CONFIG.enemies.labelFontSize),
    boss: heavy(CONFIG.boss.numberFontSize),
  };
}
