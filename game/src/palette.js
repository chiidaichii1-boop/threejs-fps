// The look plan, in one place. Emberworks is a foundry yard at dusk: warm dark
// ground, rust-orange ember accent for the attackers, cold teal for the
// defenders. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#2b241e',
  surface: '#3d332a',
  hairline: '#5c4d3d',
  ink: '#f2ede3',
  muted: '#b3a48e',
  accent: '#ff7a1a',
  ember: '#ff7a1a',
  teal: '#37b6c9',
  danger: '#e5484d',
  gold: '#f0a830',
};

export const TEAM = {
  attack: { name: 'Vanguard', color: '#ff7a1a', css: 'ember' },
  defend: { name: 'Rogue', color: '#37b6c9', css: 'teal' },
};

export function shade(name) {
  return PALETTE[name];
}
