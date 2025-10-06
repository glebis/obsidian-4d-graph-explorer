# Obsidian 4D Graph Explorer Plugin

## Project Overview
Obsidian 4D Graph Explorer is a community plugin that renders a navigable four-dimensional representation of an Obsidian vault. It combines the vault's native graph data with custom 4D math and camera controls so users can explore links, clusters, and note metadata from new perspectives without leaving their notes workspace.

## Implementation Highlights
- Written in TypeScript and bundled with esbuild for Obsidian's plugin API
- `src/data` extracts and normalizes vault graph information before feeding the renderer
- `src/hyper` hosts 4D geometry math, projection pipelines, interaction controls, and WebGL shader code
- `src/view` wires the rendering loop into an Obsidian `ItemView`, handling lifecycle events and UI elements styled via `styles.css`
- `src/main.ts` bootstraps the plugin, registers the custom view, and exposes user-facing settings that control layout forces, node scale, and link visibility

## Key Directories

| Path | Purpose |
| --- | --- |
| `src/main.ts` | Obsidian plugin entrypoint, view activation, settings registration. |
| `src/view/graphExplorerView.ts` | UI composition, toolbar/config bindings, animation loop, canvas event handling. |
| `src/hyper/` | Rendering core: math utilities, 4D object definitions, force layout helpers, WebGL renderer and interaction controls. |
| `src/data/` | Vault graph data extraction and normalization for the renderer layer. |
| `styles.css` | Styling for the explorer view, toolbar, overlays, and configuration panel. |

## Project Structure & Module Organization
- `src/` holds the TypeScript source. Key areas: `src/view/` (Obsidian view logic), `src/hyper/` (4D maths, rendering, controls), and `src/data/` (vault graph extraction). Keep new modules beside related code
- `styles.css` defines the plugin UI skin. Update or extend styles here rather than inline
- Build artifacts land in `main.js`; git ignores it. Documentation such as this file sits at repo root

## Build, Test, and Development Commands
- `npm install` — install dependencies (run once per clone/upgrade)
- `npm run build` — bundle `src/main.ts` via esbuild into `main.js` for Obsidian
- `npx tsc --noEmit` — type-check the codebase without writing output. Use before commits
- `npm run dev` (add `--watch` to `node esbuild.config.mjs`) for incremental builds while editing

## Coding Style & Naming Conventions
- TypeScript, ES2020 target, strict mode. Prefer explicit interfaces and `async/await`
- Use 2-space indentation (inherited from current files). Name files in kebab-case (`graphExplorerView.ts` excepted for legacy view naming)
- Renderer shaders live in template literals; keep attribute names synced across geometry and shader constants
- Run `npm run build` after changes touching `src/hyper/render/renderer.ts` to ensure shaders still compile

## Testing Guidelines
- No automated test harness yet. Use `npx tsc --noEmit` plus manual Obsidian verification (reload plugin, inspect console for shader warnings)
- When adding tests, mirror structure under `src/` (e.g., `tests/hyper/math4d.spec.ts`) and document commands here

## Commit & Pull Request Guidelines
- Conventional commits not enforced; current history uses imperative summaries (e.g., "Add 4D graph explorer plugin"). Follow that style
- Include context in the body: affected modules, notable side effects, verification steps (`npm run build`, Obsidian reload)
- PRs should link relevant issues, summarize UX-impacting changes, and attach screenshots/gifs for UI updates (labels, controls, etc.)
