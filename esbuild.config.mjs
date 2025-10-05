import esbuild from "esbuild";
import { readFileSync } from "fs";

const watch = process.argv.includes("--watch");
const prod = process.argv.includes("--prod");

const banner = readFileSync("manifest.json", "utf8");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "main.js",
  target: "es2020",
  format: "cjs",
  platform: "browser",
  treeShaking: true,
  sourcemap: !prod,
  minify: prod,
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*"
  ],
  banner: {
    js: "/*\n" + banner.trim() + "\n*/",
  }
});

if (watch) {
  await context.watch();
  console.log("Watching for changes...");
} else {
  await context.rebuild();
  await context.dispose();
}
