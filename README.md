# Obsidian 4D Graph Explorer

Explore your Obsidian knowledge graph in four dimensions. This plugin renders your vault's notes and links as an interactive 4D graph with WebGL, letting you discover connections and clusters from perspectives not possible in a flat graph.

## Features

- **4D graph visualization** -- notes are positioned in four-dimensional space and projected to 3D/2D in real time via WebGL
- **Force-directed layout** -- configurable repel, center, link, and distance forces shape the graph organically
- **Color themes** -- multiple built-in palettes (neon, heat, etc.) with per-node color rules based on tags, paths, or filenames
- **Graph insights** -- analysis modal showing cluster statistics and connectivity metrics
- **Viewport controls** -- zoom, rotation, and 4D camera manipulation
- **Active file tracking** -- highlights the currently open note in the graph
- **Configurable** -- all settings accessible from an in-view config panel (forces, link visibility, node size, color rules)

## Installation

### Manual

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
2. Create a folder `obsidian-4d-graph-explorer` inside your vault's `.obsidian/plugins/` directory
3. Copy the files into that folder
4. Enable the plugin in Obsidian Settings > Community Plugins

### From source

```bash
git clone https://github.com/glebis/obsidian-4d-graph-explorer.git
cd obsidian-4d-graph-explorer
npm install
npm run build
```

Copy the built `main.js`, `manifest.json`, and `styles.css` to your vault's plugins folder.

## Usage

Open the graph with the ribbon icon or the command palette: **Open 4D Graph Explorer**.

The graph opens in a side panel. Use the config panel (gear icon) to adjust forces, toggle links, change themes, and add color rules.

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # production build
npx tsc --noEmit  # type-check
npm test        # run unit tests
```

## License

[MIT](LICENSE)
