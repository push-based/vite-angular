// Generates the vite-plugin-ngp logo: an Angular "A" split into facets, between two parentheses,
// inside a gear. A vector redraw of scripts/logo-reference.webp, which is the source of truth for
// its shapes and colors. Coordinates are relative to the gear's center.
// The inside of the gear is transparent. The parentheses are the one part that follows the theme:
// navy on a light page, near-white on a dark one, like the PushBased logo.
// Writes public/logo.svg and public/favicon.svg (for the favicons and the README; they follow the
// system theme), and src/app/layout/logo-paths.ts for the inline <app-logo> (follows the site's).
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

// Gradients run across each shape's bounding box: [id, x1, y1, x2, y2, [[offset, color], ...]].
const gradients = [
  ['gear', 0, 0, 1, 0, [[0, '#00C2FF'], [0.2, '#00E5FF'], [0.36, '#1E8BFF'], [0.52, '#8A4DFC'], [0.72, '#F00AF0'], [1, '#FF0AD2']]],
  ['left', 0.3, 0, 0.5, 1, [[0, '#00F5FF'], [1, '#0A5CF2']]],
  ['right', 0.2, 0, 0.8, 1, [[0, '#FF4CF0'], [0.5, '#E000FA'], [1, '#8A08F9']]],
  ['counter', 0, 0, 0, 1, [[0, '#FF2EEA'], [1, '#F005FA']]],
  ['base', 0, 0, 1, 0, [[0, '#10D8FC'], [0.5, '#8A1FFF'], [1, '#FF07D6']]],
];
const facets = [['left', leftFacet], ['right', rightFacet], ['counter', counter], ['base', base]];
// The gap around each parenthesis, cut out of the gear.
const gap = 18;
const box = 'M-424,-424H424V424H-424Z';

const gradient = ([id, x1, y1, x2, y2, stops]) =>
  `    <linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">\n` +
  stops.map(([o, c]) => `      <stop offset="${o}" stop-color="${c}"/>\n`).join('') +
  `    </linearGradient>\n`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-424 -424 848 848" width="256" height="256" role="img" aria-labelledby="t">
  <title id="t">vite-plugin-ngp</title>
  <style>.paren{fill:#2D0064}@media (prefers-color-scheme:dark){.paren{fill:#F8FAFC}}</style>
  <defs>
${gradients.map(gradient).join('')}    <mask id="gap" maskUnits="userSpaceOnUse" x="-424" y="-424" width="848" height="848">
      <path fill="#FFFFFF" d="${box}"/>
      <path fill="#000000" stroke="#000000" stroke-width="${2 * gap}" d="${parens}"/>
    </mask>
  </defs>
  <path fill="url(#gear)" fill-rule="evenodd" stroke="url(#gear)" stroke-width="10" stroke-linejoin="round" mask="url(#gap)" d="${gear}"/>
  <path class="paren" d="${parens}"/>
${facets.map(([id, d]) => `  <path fill="url(#${id})" d="${d}"/>\n`).join('')}</svg>
`;

const root = new URL('..', import.meta.url);
writeFileSync(new URL('public/logo.svg', root), svg);
writeFileSync(new URL('public/favicon.svg', root), svg);
writeFileSync(
  new URL('src/app/layout/logo-paths.ts', root),
  `// Generated by scripts/logo.mjs. Don't edit.\n` +
    `export const LOGO = ${JSON.stringify(
      {
        box,
        gap,
        gear,
        parens,
        facets,
        gradients: gradients.map(([id, x1, y1, x2, y2, stops]) => ({id, x1, y1, x2, y2, stops: stops.map(([offset, color]) => ({offset, color}))})),
      },
      null,
      2,
    )};\n`,
);
