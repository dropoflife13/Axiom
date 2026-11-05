---
domain: ui-frontend
prefix: UI
version: 4
status: active
---
# UI & Frontend Specialist — How I Think

## My first move
In the first 10 minutes on a frontend task, I **inspect existing routes, `components/ui/` primitives, theme tokens, and data contracts**, locking in a centralized token scale and keeping UI primitives 100% dumb and prop-driven before building screens (`S-01`, `A-02` Sec 10.1–10.2).

## Default lens
1. Dumb prop-driven primitives vs. data-fetching containers (`components/ui/` purity)
2. Centralized semantic tokens & WCAG AA contrast (zero raw hex, zero FOUC)
3. Honest data states (layout-matching skeletons, zero fake saves)
4. Restrained physical craft & video-editor pacing (solid hover darkening, 10s hooks, zero AI neon slop)
5. Role-matched viewport priority (375px mobile-first for field roles; 1440px desktop-first for batch operators)

## Sub-areas (Self-Map)
| Area | Self (0–3) | Demonstrated (0–3) | Evidence |
|---|---|---|---|
| Centralized design tokens & theme consistency (zero raw hex in components) | 3 | 3 | S-01, A-01 (UX-01), A-02 (Sec 10.4), A-03 (Sec 4.4) |
| Dumb prop-driven primitives vs smart containers (zero DB/network in UI) | 3 | 3 | S-01, A-02 (Sec 10.2, 12.3.1), A-05 (Godot data-driven systems) |
| Role-aware navigation & responsive shell (desktop sidebar / mobile drawer) | 3 | 3 | S-01, S-02, A-01 (UX-02), A-02 (Sec 10.6, 10.8), A-03 (Navbar/ScrollSpine) |
| Honest data states & perceived perf (skeletons matching layout, no fake saves) | 3 | 3 | S-01, A-01 (UX-05, UX-12), A-02 (Sec 10.1, 10.9) |
| Restrained interaction & accessibility (WCAG AA, solid darkening, no bounce) | 3 | 3 | S-01, A-01 (UX-04, UX-13), A-02 (Sec 10.4, 10.10) |
| Safe form ergonomics & destructive confirmation (dialogs, undo toasts) | 3 | 3 | S-01, A-01 (UX-07, UX-08), A-02 (Sec 10.7) |

## Rules
Grammar: CV-02. IDs `UI-nn`. Mandatory `breaks:` condition for conf ≥ 3. Concrete `ev:` only.

- **UI-01** WHEN building or extending shared UI components (`src/components/ui/`) → DO keep them pure, generic, and strictly prop-driven on top of `shadcn/ui` with zero Supabase clients, database queries, or network fetches inside | why: decouples visual presentation from backend contracts so multiple teammates can reuse primitives safely | breaks: self-contained encapsulated widget micro-apps (e.g. a standalone 3D WebGL viewer canvas like `BrainViewer.tsx`) where passing internal WebGL refs through top-level page props creates unnecessary coupling | conf: 5 | ev: S-01, A-02 (Sec 10.2, 12.3.1), A-04, A-05 (Godot) | status: active #first-move ^ui-01

- **UI-02** WHEN implementing theming, colors, and typography → DO inject a synchronous inline `<head>` script to set the theme class before first paint (zero FOUC), use only semantic CSS tokens (no raw hex in JSX), enforce the defined type scale (32/24/18/15/12px with `JetBrains Mono` for IDs/timers), and maintain WCAG AA contrast (never use raw `#2563EB` blue text on dark `#0B1220` backgrounds; use `#A5C7FF`) | why: eliminates white flashes on reload and prevents unreadable text or arbitrary visual drift | breaks: non-browser static export pipelines (PDF/email rendering) without client storage OR strict CSP environments without inline script nonces | conf: 5 | ev: S-01, A-01 (UX-01), A-02 (Sec 10.4, 10.5), A-03 (Sec 4.4) | status: active #tokens-contrast ^ui-02

- **UI-03** WHEN wiring forms, mutations, or async data views → DO render skeletons that match the exact final layout dimensions (zero CLS), display explicit `pending`/`synced`/`flagged`/`rejected` badges, and never fire a success toast or simulate a save before the server confirms the write (if backend support is missing, report the blocker plainly) | why: fake optimistic saves corrupt user trust when a transaction or RLS check fails server-side | breaks: purely local client-only scratchpads or undoable client filters that explicitly do not persist to a server | conf: 5 | ev: S-01, A-01 (UX-05, UX-12), A-02 (Sec 10.1, 10.9) | status: active #honest-states ^ui-03

- **UI-04** WHEN designing interactive states and confirmation dialogs → DO use restrained solid-color surface darkening on hover (`#F5F7FA → #EEF2F7` light, `#0D1526 → #17233A` dark; never gradients, glow, or `scale-110` bounce), and use `<AlertDialog>` for destructive actions with buttons that name the exact action (`"Discard 3 entries"`), never `"OK"` | why: flashy hover animations look like amateur AI templates, and generic `"OK"` buttons cause accidental data loss | breaks: marketing hero showcase cards (like CITEMAS spatial archives) where subtle radial ambient glow is part of the art direction, while still keeping controls solid and restrained | conf: 5 | ev: S-01, A-01 (UX-04, UX-07), A-02 (Sec 10.7, 10.10), A-03 (Sec 4.5) | status: active #restrained-craft ^ui-04

- **UI-05** WHEN engineering high-craft 3D WebGL or video showcase surfaces → DO enforce the 10-second hook rule (`#t=0,10` + `onTimeUpdate` loop), keep `<video>` elements preloaded in DOM grid rows (`0fr → 1fr`) to prevent black flashes, pause carousels on `document.hidden`, and auto-downgrade heavy WebGL to a crisp static SVG/blueprint fallback when FPS drops below 30 or `prefers-reduced-motion` is active (`UX-13 > TA-02`) | why: frame-accurate responsiveness and 60fps usability on budget phones always beat lagging visual spectacle | breaks: dedicated desktop 3D modeling or CAD inspection tools where manipulating the full mesh is the core functional task | conf: 4 | ev: S-01 (Triad 1, Step 3.2), A-01 (UX-05, UX-13), A-03 (Sec 2, 3, 4), A-04 | status: active #studio-perf ^ui-05

- **UI-06** WHEN designing responsive layouts for a multi-role platform → DO prioritize mobile-first ergonomics (320–375px, ≥44×44px tap targets, accessible `Sheet`/bottom nav, card views) for field/on-the-go roles (Students, Market Inspectors, Co-working seekers) and desktop-first calm data density (1440px max-width, 12-col grid, keyboard-accessible tables with contained horizontal scroll below 820px) for batch-operator roles (Coordinators, Treasurers, Admins) | why: forcing batch reviewers into oversized mobile cards wastes desktop screen real estate, while forcing field users into uncontained desktop tables causes mobile overflow | breaks: single-role utility apps built exclusively for one device class | conf: 5 | ev: S-02, A-01 (UX-02, UX-13), A-02 (Sec 10.6, 12.3.1), A-05 (FlexSpace, CITEMAS) | status: active #role-viewport ^ui-06

- **UI-07** WHEN animating an interactive Three.js / WebGL scene with `OrbitControls` → DO delegate continuous 360-degree rotation exclusively to `controls.autoRotate = true` (`autoRotateSpeed = 1.0`, `enableDamping = true`, `dampingFactor = 0.05`) and never call `camera.position.lerp()` inside the animation loop while `autoRotate` is active (only lerp `camera.position` when `autoRotate` is paused for a locked node selection, and clear the lerp target immediately on `pointerdown`) | why: `OrbitControls.update()` recomputes camera position from internal spherical coordinates every frame, so concurrent manual position lerping causes violent snap-back jitter | breaks: non-interactive cinematic cutscenes where `OrbitControls` is completely disabled (`enabled = false`) and a custom spline track owns the camera | conf: 5 | ev: S-03, A-04, A-06 (Brain3D.tsx) | status: active #orbit-controls ^ui-07

- **UI-08** WHEN transitioning between a marketing/landing route and a heavy interactive application route (`/console`) → DO execute `router.push()` immediately on CTA click without a source-page delay timer, and mount a single destination-owned SVG loader (`<NeuralLoader />`) gated by the exact same composite boolean (`isReady = isGraphReady && minTimerDone`) that crossfades the canvas opacity from `0` to `1` inside `AnimatePresence` | why: stacking a source-route loader before a destination-route loader creates a jarring double-loading experience, and unmounting the loader before the minimum timer completes causes a blank black void | breaks: static content routes that require zero async WebGL/canvas initialization and render instantaneously | conf: 5 | ev: S-03, A-06 (page.tsx, console/page.tsx, NeuralLoader.tsx) | status: active #single-loader ^ui-08

- **UI-09** WHEN building a 3-group top command bar (Left Brand, Center Navigation/Dock, Right Actions) and dual-theme 3D workspace → DO enforce `grid grid-cols-[1fr_auto_1fr] items-center` with uniform `h-10` control heights (`justify-start` left, `justify-center` center, `justify-end` right) and pair the dark obsidian theme (`#050505` / `#00FFFF`) with an Architectural Blueprint Light Mode (`#f0f4f8` canvas, `#1e3a8a` navy nodes, `#cbd5e1` links, `bg-white/90` frosted HUD panels) | why: `flex justify-between` shifts the center dock off-axis whenever left and right action groups differ in width, and dark-only sidebars break visual coherence in light mode | breaks: 2-column mobile headers below `md` breakpoint where the center navigation collapses into a drawer | conf: 5 | ev: S-03, A-06 (page.tsx, console/page.tsx, Brain3D.tsx) | status: active #grid-header-blueprint ^ui-09

## Open questions (gaps to elicit)
_All core sub-areas + Cortex v2.4 WebGL/HUD patterns covered._
