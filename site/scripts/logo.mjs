// Generates the vite-plugin-ngp logo: an Angular "A" split into facets, between two parentheses,
// inside a gear. A vector redraw of scripts/logo-reference.webp, which is the source of truth for
// its shapes and colors. Coordinates are relative to the gear's center.
// Writes public/logo.svg and public/favicon.svg. <app-logo>, the README and the playground use them.
// Usage: node scripts/logo.mjs
import {writeFileSync} from 'node:fs';
const f = (n) => +n.toFixed(2);
const pt = ([x, y]) => `${f(x)},${f(y)}`;
const polygon = (pts) => 'M' + pts.map(pt).join('L') + 'Z';
const polar = (r, deg) => [r * Math.sin((deg * Math.PI) / 180), -r * Math.cos((deg * Math.PI) / 180)];

// Gear: 14 teeth, one at the top and one at the bottom.
const teeth = 14, rTip = 414, rRoot = 364, tipHalf = 5.6, rootHalf = 9.8;
const outer = [];
for (let i = 0; i < teeth; i++) {
  const a = (i * 360) / teeth;
  outer.push(polar(rRoot, a - rootHalf), polar(rTip, a - tipHalf), polar(rTip, a + tipHalf), polar(rRoot, a + rootHalf));
}
// The stroke rounds the corners and adds 5 all round, so the tips and the holes are drawn 5 short.
// The gear's inner edge: a circle, with a tab reaching in at the top and the bottom, each holding a hole.
const rInner = 305, tabHalf = 45, tabDepth = 272, tabFlat = 20, rHoleAt = 350, rHole = 30;
const sx = tabHalf, sy = f(Math.sqrt(rInner ** 2 - tabHalf ** 2));
const inner =
  `M${sx},${-sy}A${rInner},${rInner} 0 0,1 ${sx},${sy}` +
  `L${tabFlat},${tabDepth}L${-tabFlat},${tabDepth}L${-sx},${sy}` +
  `A${rInner},${rInner} 0 0,1 ${-sx},${-sy}` +
  `L${-tabFlat},${-tabDepth}L${tabFlat},${-tabDepth}Z`;
const hole = (cy) => `M${-rHole},${cy}a${rHole},${rHole} 0 1,0 ${2 * rHole},0a${rHole},${rHole} 0 1,0 ${-2 * rHole},0Z`;
const gear = polygon(outer) + inner + hole(-rHoleAt) + hole(rHoleAt);

// Parentheses: bands between two arcs of the same radius, offset sideways.
const rParen = 292, parenY = 190, parenOuterCx = -38, parenWidth = 55;
const dx = Math.sqrt(rParen ** 2 - parenY ** 2);
const paren = (s) => {
  // s = -1 for "(", 1 for ")". Outer edge first, top to bottom, then the inner edge back up.
  const xo = s * (-parenOuterCx + dx), xi = s * (-parenOuterCx - parenWidth + dx);
  const down = s < 0 ? 0 : 1;
  return `M${f(xo)},${-parenY}A${rParen},${rParen} 0 0,${down} ${f(xo)},${parenY}` +
    `L${f(xi)},${parenY}A${rParen},${rParen} 0 0,${1 - down} ${f(xi)},${-parenY}Z`;
};
const parens = paren(-1) + paren(1);

// The "A": two side facets of a hexagon, the counter, and the base.
const leftFacet = polygon([[-19, -244], [-200, -136], [-201, 128]]);
const rightFacet = polygon([[19, -244], [200, -136], [201, 128]]);
const counter = polygon([[0, -118], [80, 38], [-80, 38]]);
const base = polygon([[-115, 93], [115, 93], [154, 164], [0, 254], [-154, 164]]);

const ink = '#05060B';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-424 -424 848 848" width="256" height="256" role="img" aria-labelledby="t">
  <title id="t">vite-plugin-ngp</title>
  <defs>
    <linearGradient id="gear" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#00C2FF"/>
      <stop offset="0.2" stop-color="#00E5FF"/>
      <stop offset="0.36" stop-color="#1E8BFF"/>
      <stop offset="0.52" stop-color="#8A4DFC"/>
      <stop offset="0.72" stop-color="#F00AF0"/>
      <stop offset="1" stop-color="#FF0AD2"/>
    </linearGradient>
    <linearGradient id="left" x1="0.3" y1="0" x2="0.5" y2="1">
      <stop offset="0" stop-color="#00F5FF"/>
      <stop offset="1" stop-color="#0A5CF2"/>
    </linearGradient>
    <linearGradient id="right" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#FF4CF0"/>
      <stop offset="0.5" stop-color="#E000FA"/>
      <stop offset="1" stop-color="#8A08F9"/>
    </linearGradient>
    <linearGradient id="counter" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FF2EEA"/>
      <stop offset="1" stop-color="#F005FA"/>
    </linearGradient>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#10D8FC"/>
      <stop offset="0.5" stop-color="#8A1FFF"/>
      <stop offset="1" stop-color="#FF07D6"/>
    </linearGradient>
    <linearGradient id="paren" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#EAFBFF"/>
      <stop offset="1" stop-color="#FFF0FC"/>
    </linearGradient>
  </defs>
  <circle r="${rInner + 6}" fill="${ink}"/>
  <path fill="url(#gear)" fill-rule="evenodd" stroke="url(#gear)" stroke-width="10" stroke-linejoin="round" d="${gear}"/>
  <path fill="url(#paren)" stroke="${ink}" stroke-width="36" paint-order="stroke" d="${parens}"/>
  <path fill="url(#left)" d="${leftFacet}"/>
  <path fill="url(#right)" d="${rightFacet}"/>
  <path fill="url(#counter)" d="${counter}"/>
  <path fill="url(#base)" d="${base}"/>
</svg>
`;

const root = new URL('..', import.meta.url);
writeFileSync(new URL('public/logo.svg', root), svg);
writeFileSync(new URL('public/favicon.svg', root), svg);
