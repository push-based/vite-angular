# Results

The files here are the measurements behind the docs site's [Performance page](../../site/content/performance.md) (generated apps, one laptop) and [Benchmarks page](../../site/content/benchmarks.md) (real apps, GitHub's runners and the laptop). `node report.mjs <files>` prints the tables and `node charts.mjs` draws the site's figures from them. What the numbers mean, and their caveats, are on those pages.

| File | What it is |
|---|---|
| `2026-10-17-generated.json` | The Performance page's run: four tools, four apps, every metric including `typecheck`, 20 edits per series, plugin at `92efd3a`. Its 100-component build rounds overlapped a load spike from runaway processes another session left behind, so the next file replaces that series |
| `2026-10-17-generated-build-100.json` | The 100-component builds, rerun once the machine was quiet |
| `2026-10-17-generated-ngp-notc.json` | The plugin's builds with `typeCheck: false`, same day |
| `ci-super-productivity.json`, `ci-ghostfolio.json` | The Benchmarks page's published numbers, from the `bench-real` workflow's artifacts |
| `2026-10-17-real-apps.json` | The real apps on the laptop, the same day, for the Benchmarks page's laptop columns |
| `2026-10-16-standalone-*.json`, `2026-10-16-playground.json`, `2026-10-16-ngp-notc.json` | The first full run, plugin at `33b8ecd`, 10 edits per series; the Performance page's numbers until 17 October |
| `2026-10-16-typecheck-cost.json` | The plugin with and without its type-check at 5,000 components, back to back: the 150 ms the check costs a cold start |
| `2026-10-16-analog-hmr.json` | Analog with `liveReload: true`: its component HMR failed the gates on the generated apps |
| `2026-10-16-spotcheck-main.json` | The 5,000-component app on the plugin at `32b209c`, after i18n and the `ng build` options landed: same build time, bundle size and edit times |
| `2026-10-17-template-wait-*.json` | The plugin's template edits before and after the wait moved to count from the template's write (decision 48), with `@oxc-angular/vite` alongside |

Files written before the harness recorded `pluginDirty` flagged untracked files under `bench/` as uncommitted changes; the plugin itself was committed for every run.

## Generated apps, 17 October 2026

`node report.mjs results/2026-10-17-generated.json results/2026-10-17-generated-ngp-notc.json results/2026-10-17-generated-build-100.json`:

### Dev server: cold start to first contentful paint

Process start to the first paint of the rendered app, with every cache deleted first. Median.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 813 ms | 994 ms | 1.74 s | 775 ms |
| Angular CLI | 2.18 s | 6.98 s | 28.3 s | n/a |
| Analog | 1.10 s | 1.94 s | 6.46 s | 1.07 s |
| @oxc-angular/vite | 370 ms | 529 ms | 1.11 s | 357 ms |

### Dev server: restart to first contentful paint

The same, keeping the caches the previous start wrote.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 435 ms | 452 ms | 565 ms | 468 ms |
| Angular CLI | 2.08 s | 6.82 s | 27.9 s | n/a |
| Analog | 1.03 s | 1.68 s | 5.77 s | 958 ms |
| @oxc-angular/vite | 321 ms | 297 ms | 333 ms | 303 ms |

### Template edit to DOM

Writing an external template until the new element is in the page. "reload" means the page reloaded to show it; otherwise the component updated in place. Median, and the fastest edit in brackets.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 123 ms (61 ms) | 115 ms ±7% (58 ms) | 124 ms ±10% (60 ms) | 129 ms (66 ms) |
| Angular CLI | 185 ms (177 ms) | 464 ms (449 ms) | 1.81 s (1.74 s) |  |
| Analog | 264 ms ±10% (236 ms), reload | 796 ms (645 ms), reload | 2.70 s (2.56 s), reload | 201 ms (194 ms), reload |
| @oxc-angular/vite | 80 ms ±48% (15 ms) | 117 ms (14 ms) | 118 ms (16 ms) | 119 ms (18 ms) |

### .ts edit to DOM

Changing a string in a page component's class (a signal's initial value in the generated apps, a testimonial in Ghostfolio) until the new text is in the page. Every tool reloads the page for this. Median, and the fastest edit in brackets.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 180 ms (79 ms), reload | 186 ms (85 ms), reload | 200 ms ±14% (126 ms), reload | 168 ms (64 ms), reload |
| Angular CLI | 242 ms (229 ms), reload | 530 ms (505 ms), reload | 1.92 s (1.89 s), reload |  |
| Analog | 323 ms ±8% (232 ms), reload | 757 ms ±5% (632 ms), reload | 2.69 s (2.56 s), reload | 199 ms (195 ms), reload |
| @oxc-angular/vite | 168 ms (66 ms), reload | 169 ms (100 ms), reload | 182 ms (79 ms), reload | 145 ms ±13% (61 ms), reload |

### Production build

Process start to exit, caches deleted first.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 1.32 s | 4.81 s | 20.2 s | 1.09 s |
| vite-plugin-ngp, `typeCheck: false` | 1.16 s | 3.88 s | 16.7 s | 1.01 s |
| Angular CLI | 2.02 s | 6.72 s | 30.1 s | n/a |
| Analog | 1.44 s | 4.50 s | 18.4 s | 1.22 s |
| @oxc-angular/vite | 255 ms | 441 ms | 1.42 s | 315 ms |

### Type error reported in the dev server

Planting a template type error until the dev server's terminal names it. Only the tools that type-check in dev.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 512 ms | 639 ms | 1.37 s | 500 ms |
| Angular CLI | 182 ms | 433 ms | 1.60 s | n/a |

### Type error cleared in the dev server

Removing it until the dev server reports the app clean again.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 501 ms | 544 ms | 1.36 s | 499 ms |
| Angular CLI | 184 ms | 455 ms | 1.73 s | n/a |

### Dev server memory, cold start

Resident memory of the dev server's whole process tree, sampled every 100 ms: the peak between process start and the rendered page, and in brackets what it held once the page had rendered and settled. Median. Includes esbuild, tsgo, Sass and worker processes; shared pages count once per process.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 669 MB (579 MB settled) | 1.07 GB (806 MB settled) | 1.61 GB (1.61 GB settled) | 617 MB (563 MB settled) |
| Angular CLI | 951 MB (951 MB settled) | 1.94 GB (1.94 GB settled) | 5.89 GB (4.81 GB settled) | n/a |
| Analog | 607 MB (604 MB settled) | 858 MB (858 MB settled) | 2.05 GB (2.05 GB settled) | 621 MB (621 MB settled) |
| @oxc-angular/vite | 339 MB (339 MB settled) | 465 MB (465 MB settled) | 970 MB (970 MB settled) | 333 MB (333 MB settled) |

### Dev server memory, restart

The same for a restart with the caches kept.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 431 MB ±7% (360 MB settled) | 805 MB (549 MB settled) | 1.01 GB (1.01 GB settled) | 393 MB (333 MB settled) |
| Angular CLI | 793 MB (793 MB settled) | 1.81 GB (1.81 GB settled) | 6.03 GB (5.73 GB settled) | n/a |
| Analog | 453 MB (453 MB settled) | 616 MB (616 MB settled) | 1.38 GB (1.38 GB settled) | 473 MB (473 MB settled) |
| @oxc-angular/vite | 221 MB (221 MB settled) | 221 MB (221 MB settled) | 262 MB (262 MB settled) | 222 MB (222 MB settled) |

### Dev server memory after edits

What the dev server held after the edit series (the warm-up and measured template and `.ts` edits, in one session), and in brackets its peak during that session.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 333 MB (461 MB peak) | 519 MB (836 MB peak) | 1.43 GB (2.46 GB peak) | 325 MB (422 MB peak) |
| Angular CLI | 883 MB (891 MB peak) | 1.86 GB (2.12 GB peak) | 6.57 GB (6.86 GB peak) |  |
| Analog | 467 MB (517 MB peak) | 1,009 MB (1.09 GB peak) | 2.59 GB (3.55 GB peak) | 475 MB (502 MB peak) |
| @oxc-angular/vite | 180 MB (234 MB peak) | 205 MB (231 MB peak) | 235 MB (267 MB peak) | 197 MB (228 MB peak) |

### Production build memory

Peak resident memory of the build's whole process tree, sampled every 100 ms. Median.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 631 MB | 1.48 GB | 5.02 GB | 603 MB |
| vite-plugin-ngp, `typeCheck: false` | 600 MB | 1.17 GB ±6% | 3.73 GB | 545 MB |
| Angular CLI | 771 MB | 1.46 GB | 5.08 GB | n/a |
| Analog | 658 MB | 1.11 GB | 3.36 GB | 662 MB |
| @oxc-angular/vite | 286 MB | 578 MB | 1.55 GB | 270 MB |

### Bundle size

All JavaScript in the build, and the initial part: what index.html loads plus everything it imports statically, before any lazy route. Gzip at level 9, per file.

| App | Tool | JS | JS gzip | Initial JS | Initial gzip | CSS |
|---|---|---:|---:|---:|---:|---:|
| 100 | vite-plugin-ngp | 424 kB | 127 kB | 232 kB | 71 kB | 0.0 kB |
| 100 | vite-plugin-ngp, `typeCheck: false` | 424 kB | 127 kB | 232 kB | 71 kB | 0.0 kB |
| 100 | Angular CLI | 421 kB | 128 kB | 247 kB | 77 kB | 0.0 kB |
| 100 | Analog | 423 kB | 127 kB | 232 kB | 71 kB | 0.0 kB |
| 100 | @oxc-angular/vite | 499 kB | 131 kB | 343 kB | 104 kB | 0.0 kB |
| 1,000 | vite-plugin-ngp | 2,017 kB | 525 kB | 246 kB | 76 kB | 0.0 kB |
| 1,000 | vite-plugin-ngp, `typeCheck: false` | 2,017 kB | 525 kB | 246 kB | 76 kB | 0.0 kB |
| 1,000 | Angular CLI | 1,994 kB | 523 kB | 251 kB | 78 kB | 0.0 kB |
| 1,000 | Analog | 2,006 kB | 521 kB | 246 kB | 76 kB | 0.0 kB |
| 1,000 | @oxc-angular/vite | 1,961 kB | 381 kB | 356 kB | 109 kB | 0.0 kB |
| 5,000 | vite-plugin-ngp | 9,296 kB | 2,342 kB | 313 kB | 97 kB | 0.0 kB |
| 5,000 | vite-plugin-ngp, `typeCheck: false` | 9,296 kB | 2,342 kB | 313 kB | 97 kB | 0.0 kB |
| 5,000 | Angular CLI | 9,080 kB | 2,275 kB | 268 kB | 81 kB | 0.0 kB |
| 5,000 | Analog | 9,237 kB | 2,324 kB | 314 kB | 97 kB | 0.0 kB |
| 5,000 | @oxc-angular/vite | 8,570 kB | 1,506 kB | 422 kB | 129 kB | 0.0 kB |
| playground | vite-plugin-ngp | 403 kB | 135 kB | 354 kB | 115 kB | 4.3 kB |
| playground | vite-plugin-ngp, `typeCheck: false` | 403 kB | 135 kB | 354 kB | 115 kB | 4.3 kB |
| playground | Analog | 406 kB | 134 kB | 355 kB | 114 kB | 4.3 kB |
| playground | @oxc-angular/vite | 490 kB | 157 kB | 443 kB | 137 kB | 4.3 kB |

n/a: Angular CLI can't run the playground: it uses import.meta.env and import.meta.hot, which only Vite defines.

### Environment

- `2026-10-17-generated.json`: 2026-10-17 15:33 UTC, plugin at `92efd3a`, repo at `066b7bd`, Apple M2 Max, 12 cores, 32 GB, Darwin 27.0.0 arm64, Now drawing from 'AC Power'. Node v26.12.0, Chrome Chrome/155.0.8059.84. 1 warm-up and 5 measured runs per start or build, 2 warm-up and 20 measured edits. 1-minute load average during samples: 2.3–30.2.
  Versions: @angular/core 22.3.0-next.2, @angular/compiler-cli 22.3.0-next.2, @angular/build 22.3.0-next.2, @angular/cli 22.3.0-next.2, @analogjs/vite-plugin-angular 2.8.2-beta.1, @oxc-angular/vite 0.0.41, vite 8.3.4, rolldown 1.2.14, typescript 6.0.3, puppeteer-core 25.14.0. Patches: @analogjs__vite-plugin-angular@2.8.2-beta.1.patch, real/ghostfolio.patch, real/super-productivity.patch.
- `2026-10-17-generated-ngp-notc.json`: 2026-10-17 17:04 UTC, plugin at `92efd3a`, repo at `066b7bd`, Apple M2 Max, 12 cores, 32 GB, Darwin 27.0.0 arm64, Now drawing from 'AC Power'. Node v26.12.0, Chrome Chrome/155.0.8059.84. 1 warm-up and 5 measured runs per start or build, 2 warm-up and 10 measured edits. 1-minute load average during samples: 3.2–4.6.
  Versions: @angular/core 22.3.0-next.2, @angular/compiler-cli 22.3.0-next.2, @angular/build 22.3.0-next.2, @angular/cli 22.3.0-next.2, @analogjs/vite-plugin-angular 2.8.2-beta.1, @oxc-angular/vite 0.0.41, vite 8.3.4, rolldown 1.2.14, typescript 6.0.3, puppeteer-core 25.14.0. Patches: @analogjs__vite-plugin-angular@2.8.2-beta.1.patch, real/ghostfolio.patch, real/super-productivity.patch.
- `2026-10-17-generated-build-100.json`: 2026-10-17 17:07 UTC, plugin at `92efd3a`, repo at `066b7bd`, Apple M2 Max, 12 cores, 32 GB, Darwin 27.0.0 arm64, Now drawing from 'AC Power'. Node v26.12.0, Chrome Chrome/155.0.8059.84. 1 warm-up and 5 measured runs per start or build, 2 warm-up and 10 measured edits. 1-minute load average during samples: 3.5–3.8.
  Versions: @angular/core 22.3.0-next.2, @angular/compiler-cli 22.3.0-next.2, @angular/build 22.3.0-next.2, @angular/cli 22.3.0-next.2, @analogjs/vite-plugin-angular 2.8.2-beta.1, @oxc-angular/vite 0.0.41, vite 8.3.4, rolldown 1.2.14, typescript 6.0.3, puppeteer-core 25.14.0. Patches: @analogjs__vite-plugin-angular@2.8.2-beta.1.patch, real/ghostfolio.patch, real/super-productivity.patch.
