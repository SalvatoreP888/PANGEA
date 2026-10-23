# AGENTS.md

## Commands
- `npm run dev` — start the Next.js development server.
- `npm run build` — production build, including type checking.
- `npm test` — Deterministic simulation, terrain, art, activity, camera, identity and persistence regressions.
- `npm run lint:pangea` — strict lint for the PANGEA application.
- `npx tsc --noEmit` — whole-repository TypeScript check.
- `npm run test:browser` — Playwright/Chromium interaction checks; requires a running local server.
- `npm run build:standalone` — package the same playable application into `dist/PANGEA.html`.

- `npm run server` — authoritative Node24.15+ SQLite service; durable data belongs in ignored var/ or configured volume.
- `npm run test:evolution` — focused six-track production browser checks.
- `npm run build:credits` — regenerate complete bundled license notices.

## Architecture
Next.js 16 + React 19 application with Canvas rendering, based on the MIT-licensed IsoCity source.
- `src/app/page.tsx` — PANGEA entry point; `/isocity` preserves the original game.
- `src/pangea/components/` — application shell, inspector, game UI and styling.
- `src/pangea/renderer.ts` — seeded world and city rendering, camera, depth sorting, hit testing and terrain/street caches; directly reuses IsoCity utilities.
- `src/pangea/model.ts` — typed simulation boundary and fresh random seeds. Explicit seeds must remain reproducible.
- `src/pangea/simulation/` — renderer-independent PANGAEA Realms simulation; owns people, buildings, inventory, research, time and saves.
- `src/components/game/`, `src/context/`, `src/lib/` — preserved upstream IsoCity implementation.

## Code style and behavior
- Strict TypeScript, React functional components and the `@/*` path alias.
- Keep simulation state outside rendering and React UI state. Renderers must not invent residents or inventories.
- New worlds and fresh launches use a fresh seed by default; save import must preserve the original seed and state. An explicit seed reproduces the same initial world.
- Keep the developed preview clearly labelled as constructed. Natural starts have four founders.
- Preserve the earlier `PANGAEA_Project_Full/` project and its historical evidence.

- New terrain is generationVersion=2; missing version migrates to1. Preserve legacy geography and local-map fixtures exactly.
- A connected remote world must never be stepped locally. Server state/revision owns pause/speed/import.
- Maintain exact source pins and full notices when adapting OSS. Research-only clones stay outside the app.
