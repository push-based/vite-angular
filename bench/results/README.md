# Results

The files here are the measurements behind the docs site's [Performance page](../../site/content/performance.md) (generated apps, one laptop) and [Benchmarks page](../../site/content/benchmarks.md) (real apps, GitHub's runners and the laptop). `node report.mjs <files>` prints the tables and `node charts.mjs` draws the site's figures from them. What the numbers mean, and their caveats, are on those pages.

| File | What it is |
|---|---|
| `2026-10-17-rerun-generated.json` | The Performance page's run: the four tools plus the `ngp-tsrs` variant, four apps, every metric including `typecheck`, 20 edits per series, plugin at `e401c10`, with the tsrs option merged and the first dev-server check waiting for an idle server. Started 20:56 UTC on 17 October, finished after midnight local time |
| `2026-10-17-rerun-generated-ngp-notc.json` | The plugin's builds with `typeCheck: false`, right after it |
| `2026-10-17-generated.json` | The Performance page's numbers from the afternoon of 17 October until the rerun: four tools, four apps, every metric including `typecheck`, 20 edits per series, plugin at `92efd3a`. Its 100-component build rounds overlapped a load spike from runaway processes another session left behind, so the next file replaces that series |
| `2026-10-17-generated-build-100.json` | The 100-component builds, rerun once the machine was quiet |
| `2026-10-17-generated-ngp-notc.json` | The plugin's builds with `typeCheck: false`, same day |
| `ci-super-productivity.json`, `ci-ghostfolio.json` | The Benchmarks page's published numbers, from the `bench-real` workflow's artifacts: run 39066812590 on the evening of 17 October, plugin at `e401c10`. The morning run's files, from run 39017944058 and the plugin at `92efd3a`, are in git history before 18 October |
| `2026-10-18-rerun-real-apps.json` | The real apps on the laptop, just after midnight on 18 October, plugin at `e401c10`, for the Benchmarks page's laptop columns |
| `2026-10-17-real-apps.json` | The real apps on the laptop on the morning of 17 October, plugin at `e49fedc`: the laptop columns until the rerun |
| `2026-10-16-standalone-*.json`, `2026-10-16-playground.json`, `2026-10-16-ngp-notc.json` | The first full run, plugin at `33b8ecd`, 10 edits per series; the Performance page's numbers until 17 October |
| `2026-10-16-typecheck-cost.json` | The plugin with and without its type-check at 5,000 components, back to back: the 150 ms the check costs a cold start |
| `2026-10-16-analog-hmr.json` | Analog with `liveReload: true`: its component HMR failed the gates on the generated apps |
| `2026-10-16-spotcheck-main.json` | The 5,000-component app on the plugin at `32b209c`, after i18n and the `ng build` options landed: same build time, bundle size and edit times |
| `2026-10-17-template-wait-*.json` | The plugin's template edits before and after the wait moved to count from the template's write (decision 48), with `@oxc-angular/vite` alongside |

Files written before the harness recorded `pluginDirty` flagged untracked files under `bench/` as uncommitted changes; the plugin itself was committed for every run.

## Generated apps, 17 October 2026, evening run

`node report.mjs results/2026-10-17-rerun-generated.json results/2026-10-17-rerun-generated-ngp-notc.json`:

### Dev server: cold start to first contentful paint

Process start to the first paint of the rendered app, with every cache deleted first. Median.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 784 ms | 1.00 s | 1.64 s | 770 ms |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 778 ms | 949 ms | 1.57 s | 775 ms |
| Angular CLI | 2.06 s | 6.92 s | 28.4 s | n/a |
| Analog | 1.04 s | 1.94 s | 6.43 s | 1.08 s |
| @oxc-angular/vite | 359 ms | 532 ms | 1.09 s | 352 ms |

### Dev server: restart to first contentful paint

The same, keeping the caches the previous start wrote.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 405 ms | 453 ms | 570 ms | 467 ms |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 399 ms | 451 ms | 539 ms | 463 ms |
| Angular CLI | 1.92 s | 6.82 s | 28.1 s | n/a |
| Analog | 909 ms | 1.74 s | 5.76 s | 948 ms |
| @oxc-angular/vite | 282 ms | 296 ms | 338 ms | 303 ms |

### Template edit to DOM

Writing an external template until the new element is in the page. "reload" means the page reloaded to show it; otherwise the component updated in place. Median, and the fastest edit in brackets.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 97 ms ±30% (59 ms) | 119 ms (56 ms) | 109 ms ±23% (60 ms) | 129 ms (66 ms) |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 123 ms (60 ms) | 102 ms ±19% (58 ms) | 71 ms ±11% (61 ms) | 129 ms (65 ms) |
| Angular CLI | 183 ms (179 ms) | 459 ms (442 ms) | 1.81 s (1.76 s) |  |
| Analog | 329 ms (227 ms), reload | 789 ms (633 ms), reload | 2.72 s (2.54 s), reload | 229 ms ±15% (195 ms), reload |
| @oxc-angular/vite | 118 ms (16 ms) | 117 ms (15 ms) | 116 ms (16 ms) | 118 ms (16 ms) |

### .ts edit to DOM

Changing a string in a page component's class (a signal's initial value in the generated apps, a testimonial in Ghostfolio) until the new text is in the page. Every tool reloads the page for this. Median, and the fastest edit in brackets.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 179 ms (77 ms), reload | 187 ms (85 ms), reload | 216 ms ±17% (125 ms), reload | 167 ms (65 ms), reload |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 181 ms (79 ms), reload | 185 ms (76 ms), reload | 210 ms (117 ms), reload | 140 ms ±21% (64 ms), reload |
| Angular CLI | 236 ms (228 ms), reload | 522 ms (508 ms), reload | 1.89 s (1.85 s), reload |  |
| Analog | 328 ms (218 ms), reload | 781 ms ±6% (627 ms), reload | 2.68 s (2.59 s), reload | 201 ms (192 ms), reload |
| @oxc-angular/vite | 167 ms (67 ms), reload | 171 ms (67 ms), reload | 180 ms (73 ms), reload | 162 ms (61 ms), reload |

### Production build

Process start to exit, caches deleted first.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 1.32 s | 4.79 s | 20.5 s | 1.08 s |
| vite-plugin-ngp, `typeCheck: false` | 1.16 s | 3.88 s | 16.7 s | 1.03 s |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 1.29 s | 4.65 s | 19.6 s | 1.07 s |
| Angular CLI | 2.01 s | 6.73 s | 30.2 s | n/a |
| Analog | 1.44 s | 4.51 s | 19.3 s | 1.22 s |
| @oxc-angular/vite | 262 ms | 441 ms | 1.45 s | 317 ms |

### Type error reported in the dev server

Planting a template type error until the dev server's terminal names it. Only the tools that type-check in dev.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 496 ms | 638 ms | 1.36 s | 500 ms |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 484 ms | 557 ms | 1.02 s | 479 ms |
| Angular CLI | 182 ms | 433 ms | 1.66 s | n/a |

### Type error cleared in the dev server

Removing it until the dev server reports the app clean again.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 502 ms | 548 ms | 1.36 s | 498 ms |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 483 ms | 500 ms ±6% | 1.02 s | 477 ms |
| Angular CLI | 185 ms | 455 ms | 1.78 s | n/a |

### Dev server memory, cold start

Resident memory of the dev server's whole process tree, sampled every 100 ms: the peak between process start and the rendered page, and in brackets what it held once the page had rendered and settled. Median. Includes esbuild, tsgo, Sass and worker processes; shared pages count once per process.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 663 MB (585 MB settled) | 1.10 GB (814 MB settled) | 1.56 GB (1.56 GB settled) | 573 MB (569 MB settled) |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 595 MB (586 MB settled) | 902 MB (853 MB settled) | 1.56 GB (1.56 GB settled) | 566 MB (563 MB settled) |
| Angular CLI | 959 MB (959 MB settled) | 1.98 GB (1.98 GB settled) | 5.63 GB (5.63 GB settled) | n/a |
| Analog | 605 MB (605 MB settled) | 860 MB (860 MB settled) | 2.01 GB (2.01 GB settled) | 618 MB (618 MB settled) |
| @oxc-angular/vite | 339 MB (339 MB settled) | 463 MB (463 MB settled) | 977 MB (977 MB settled) | 332 MB (332 MB settled) |

### Dev server memory, restart

The same for a restart with the caches kept.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 420 MB ±6% (360 MB settled) | 685 MB (551 MB settled) | 932 MB (932 MB settled) | 348 MB (336 MB settled) |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 368 MB (368 MB settled) | 563 MB (556 MB settled) | 939 MB (939 MB settled) | 347 MB (335 MB settled) |
| Angular CLI | 784 MB (784 MB settled) | 1.81 GB (1.81 GB settled) | 5.65 GB (4.67 GB settled) | n/a |
| Analog | 452 MB (452 MB settled) | 615 MB (615 MB settled) | 1.34 GB (1.34 GB settled) | 480 MB (480 MB settled) |
| @oxc-angular/vite | 218 MB (218 MB settled) | 218 MB (218 MB settled) | 261 MB (261 MB settled) | 205 MB (205 MB settled) |

### Dev server memory after edits

What the dev server held after the edit series (the warm-up and measured template and `.ts` edits, in one session), and in brackets its peak during that session.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 321 MB (465 MB peak) | 517 MB (828 MB peak) | 1.67 GB (2.48 GB peak) | 319 MB (436 MB peak) |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 321 MB (420 MB peak) | 532 MB (673 MB peak) | 1.68 GB (2.01 GB peak) | 316 MB (414 MB peak) |
| Angular CLI | 861 MB (865 MB peak) | 1.85 GB (1.90 GB peak) | 6.07 GB (6.44 GB peak) |  |
| Analog | 476 MB (532 MB peak) | 1.08 GB (1.18 GB peak) | 3.52 GB (3.60 GB peak) | 480 MB (497 MB peak) |
| @oxc-angular/vite | 176 MB (229 MB peak) | 176 MB (225 MB peak) | 239 MB (263 MB peak) | 193 MB (219 MB peak) |

### Production build memory

Peak resident memory of the build's whole process tree, sampled every 100 ms. Median.

| Tool | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 644 MB | 1.46 GB | 4.77 GB ±7% | 624 MB |
| vite-plugin-ngp, `typeCheck: false` | 610 MB | 1.32 GB | 3.76 GB | 566 MB |
| vite-plugin-ngp, `typeChecker: 'tsrs'` | 643 MB | 1.26 GB | 4.39 GB | 612 MB |
| Angular CLI | 779 MB | 1.50 GB | 4.61 GB | n/a |
| Analog | 672 MB | 1.12 GB | 3.39 GB | 648 MB |
| @oxc-angular/vite | 280 MB | 576 MB | 1.55 GB | 270 MB |

### Bundle size

All JavaScript in the build, and the initial part: what index.html loads plus everything it imports statically, before any lazy route. Gzip at level 9, per file.

| App | Tool | JS | JS gzip | Initial JS | Initial gzip | CSS |
|---|---|---:|---:|---:|---:|---:|
| 100 | vite-plugin-ngp | 424 kB | 127 kB | 232 kB | 71 kB | 0.0 kB |
| 100 | vite-plugin-ngp, `typeCheck: false` | 424 kB | 127 kB | 232 kB | 71 kB | 0.0 kB |
| 100 | vite-plugin-ngp, `typeChecker: 'tsrs'` | 424 kB | 127 kB | 232 kB | 71 kB | 0.0 kB |
| 100 | Angular CLI | 421 kB | 128 kB | 247 kB | 77 kB | 0.0 kB |
| 100 | Analog | 423 kB | 127 kB | 232 kB | 71 kB | 0.0 kB |
| 100 | @oxc-angular/vite | 499 kB | 131 kB | 343 kB | 104 kB | 0.0 kB |
| 1,000 | vite-plugin-ngp | 2,017 kB | 525 kB | 246 kB | 76 kB | 0.0 kB |
| 1,000 | vite-plugin-ngp, `typeCheck: false` | 2,017 kB | 525 kB | 246 kB | 76 kB | 0.0 kB |
| 1,000 | vite-plugin-ngp, `typeChecker: 'tsrs'` | 2,017 kB | 525 kB | 246 kB | 76 kB | 0.0 kB |
| 1,000 | Angular CLI | 1,994 kB | 523 kB | 251 kB | 78 kB | 0.0 kB |
| 1,000 | Analog | 2,006 kB | 521 kB | 246 kB | 76 kB | 0.0 kB |
| 1,000 | @oxc-angular/vite | 1,961 kB | 381 kB | 356 kB | 109 kB | 0.0 kB |
| 5,000 | vite-plugin-ngp | 9,296 kB | 2,342 kB | 313 kB | 97 kB | 0.0 kB |
| 5,000 | vite-plugin-ngp, `typeCheck: false` | 9,296 kB | 2,342 kB | 313 kB | 97 kB | 0.0 kB |
| 5,000 | vite-plugin-ngp, `typeChecker: 'tsrs'` | 9,296 kB | 2,342 kB | 313 kB | 97 kB | 0.0 kB |
| 5,000 | Angular CLI | 9,080 kB | 2,275 kB | 268 kB | 81 kB | 0.0 kB |
| 5,000 | Analog | 9,237 kB | 2,324 kB | 314 kB | 97 kB | 0.0 kB |
| 5,000 | @oxc-angular/vite | 8,570 kB | 1,506 kB | 422 kB | 129 kB | 0.0 kB |
| playground | vite-plugin-ngp | 403 kB | 135 kB | 354 kB | 115 kB | 4.3 kB |
| playground | vite-plugin-ngp, `typeCheck: false` | 403 kB | 135 kB | 354 kB | 115 kB | 4.3 kB |
| playground | vite-plugin-ngp, `typeChecker: 'tsrs'` | 403 kB | 135 kB | 354 kB | 115 kB | 4.3 kB |
| playground | Analog | 406 kB | 134 kB | 355 kB | 114 kB | 4.3 kB |
| playground | @oxc-angular/vite | 490 kB | 157 kB | 443 kB | 137 kB | 4.3 kB |

n/a: Angular CLI can't run the playground: it uses import.meta.env and import.meta.hot, which only Vite defines.

### Environment

- `2026-10-17-rerun-generated.json`: 2026-10-17 20:56 UTC, plugin at `e401c10`, repo at `e401c10`, Apple M2 Max, 12 cores, 32 GB, Darwin 27.0.0 arm64, Now drawing from 'AC Power'. Node v26.12.0, Chrome Chrome/155.0.8059.84. 1 warm-up and 5 measured runs per start or build, 2 warm-up and 20 measured edits. 1-minute load average during samples: 2.0–8.8.
  Versions: @angular/core 22.3.0-next.2, @angular/compiler-cli 22.3.0-next.2, @angular/build 22.3.0-next.2, @angular/cli 22.3.0-next.2, @analogjs/vite-plugin-angular 2.8.2-beta.1, @oxc-angular/vite 0.0.41, vite 8.3.4, rolldown 1.2.14, typescript 6.0.3, puppeteer-core 25.14.0. Patches: @analogjs__vite-plugin-angular@2.8.2-beta.1.patch, real/ghostfolio.patch, real/super-productivity.patch.
- `2026-10-17-rerun-generated-ngp-notc.json`: 2026-10-17 22:06 UTC, plugin at `e401c10`, repo at `e401c10`, Apple M2 Max, 12 cores, 32 GB, Darwin 27.0.0 arm64, Now drawing from 'AC Power'. Node v26.12.0, Chrome Chrome/155.0.8059.84. 1 warm-up and 5 measured runs per start or build, 2 warm-up and 10 measured edits. 1-minute load average during samples: 3.1–4.9.
  Versions: @angular/core 22.3.0-next.2, @angular/compiler-cli 22.3.0-next.2, @angular/build 22.3.0-next.2, @angular/cli 22.3.0-next.2, @analogjs/vite-plugin-angular 2.8.2-beta.1, @oxc-angular/vite 0.0.41, vite 8.3.4, rolldown 1.2.14, typescript 6.0.3, puppeteer-core 25.14.0. Patches: @analogjs__vite-plugin-angular@2.8.2-beta.1.patch, real/ghostfolio.patch, real/super-productivity.patch.
