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

function bold(fontSize: number): SkFont {
  return matchFont({ fontFamily: FONT_FAMILY, fontSize, fontWeight: 'bold' });
}

export function createGameFonts(): GameFonts {
  return {
    label: bold(CONFIG.crowd.labelFontSize),
    gate: bold(CONFIG.gates.textFontSize),
    small: bold(CONFIG.enemies.labelFontSize),
    boss: bold(CONFIG.boss.numberFontSize),
  };
}
