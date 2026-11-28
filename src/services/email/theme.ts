// Mirror the web's approved palette from src/constants/theme.css. Email clients
// receive literal inline colors, so CSS custom properties are not required.
export const emailTheme = {
  page: '#fafafb',
  surface: '#ffffff',
  subtle: '#f4f3f6',
  line: '#e7e5ec',
  lineStrong: '#c9c5d3',
  ink: '#1c1a22',
  inkMuted: '#5e5a6b',
  accent: '#6b5ba8',
  accentInk: '#5a4b94',
  accentTint: '#f1eef8',
  inkBand: '#2e2350',
} as const
