import { performance } from 'node:perf_hooks';
import { createSyntheticGraphPayload } from '../../src/bench/syntheticGraph';
import { buildNarrativeGraphFromData, updateForceLayoutConfig } from '../../src/hyper/core/graph';

interface GuardArgs {
  sizes: number[];
  averageDegree: number;
  runs: number;
}

interface GuardThresholds {
  maxBuildForceMs: number;
  maxRebuildAvgMs: number;
}

interface ScenarioResult {
  nodes: number;
  links: number;
  buildForceMs: number;
  rebuildAvgMs: number;
}

function parseNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) ? value : fallback;
}

function parseNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function parseSizesArg(fallback: number[]): number[] {
  const prefix = '--sizes=';
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const values = raw
    .slice(prefix.length)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value));
  return values.length > 0 ? values : fallback;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
  }
  return sum / values.length;
}

function configureForceLayout(): void {
  updateForceLayoutConfig({
    repelForce: 2.2,
    centerForce: 0.06,
    linkForce: 0.42,
    linkDistance: 1.6,
    iterations: 48,
  });
}

function benchmarkScenario(nodes: number, args: GuardArgs, seedOffset: number): ScenarioResult {
  const payload = createSyntheticGraphPayload({
    nodeCount: nodes,
    averageDegree: args.averageDegree,
    seed: 707 + seedOffset,
  });

  configureForceLayout();
  // Warm up once to avoid startup skew.
  buildNarrativeGraphFromData(payload, { graphName: `perf-warmup-${nodes}` });

  const forceStart = performance.now();
  buildNarrativeGraphFromData(payload, { graphName: `perf-force-${nodes}` });
  const buildForceMs = performance.now() - forceStart;

  const rebuildRuns: number[] = [];
  for (let run = 0; run < args.runs; run += 1) {
    const t0 = performance.now();
    buildNarrativeGraphFromData(payload, { graphName: `perf-rebuild-${nodes}-${run}` });
    rebuildRuns.push(performance.now() - t0);
  }

  return {
    nodes,
    links: payload.links?.length ?? 0,
    buildForceMs,
    rebuildAvgMs: mean(rebuildRuns),
  };
}

function printResults(results: ScenarioResult[], thresholds: GuardThresholds): void {
  console.log('# Performance Guard');
  console.log('');
  console.log(`Thresholds: build(force) <= ${thresholds.maxBuildForceMs.toFixed(2)}ms, rebuild(avg) <= ${thresholds.maxRebuildAvgMs.toFixed(2)}ms`);
  console.log('');
  console.log('| Nodes | Links | Build (force) | Rebuild avg |');
  console.log('| ---: | ---: | ---: | ---: |');
  for (let i = 0; i < results.length; i += 1) {
    const row = results[i];
    console.log(`| ${row.nodes} | ${row.links} | ${row.buildForceMs.toFixed(2)} ms | ${row.rebuildAvgMs.toFixed(2)} ms |`);
  }
}

function main(): void {
  const args: GuardArgs = {
    sizes: parseSizesArg([1200]),
    averageDegree: parseNumberArg('degree', 6),
    runs: Math.max(2, Math.round(parseNumberArg('runs', 4))),
  };
  const thresholds: GuardThresholds = {
    maxBuildForceMs: parseNumberEnv('PERF_MAX_BUILD_FORCE_MS', 120),
    maxRebuildAvgMs: parseNumberEnv('PERF_MAX_REBUILD_AVG_MS', 80),
  };

  const results = args.sizes.map((nodes, index) => benchmarkScenario(nodes, args, index));
  printResults(results, thresholds);

  const violations: string[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result.buildForceMs > thresholds.maxBuildForceMs) {
      violations.push(
        `nodes=${result.nodes}: build(force) ${result.buildForceMs.toFixed(2)}ms > ${thresholds.maxBuildForceMs.toFixed(2)}ms`
      );
    }
    if (result.rebuildAvgMs > thresholds.maxRebuildAvgMs) {
      violations.push(
        `nodes=${result.nodes}: rebuild(avg) ${result.rebuildAvgMs.toFixed(2)}ms > ${thresholds.maxRebuildAvgMs.toFixed(2)}ms`
      );
    }
  }

  updateForceLayoutConfig({
    repelForce: 0,
    centerForce: 0,
    linkForce: 0,
    linkDistance: 1.6,
    iterations: 48,
  });

  if (violations.length > 0) {
    console.error('');
    console.error('Performance guard failed:');
    for (let i = 0; i < violations.length; i += 1) {
      console.error(`- ${violations[i]}`);
    }
    process.exitCode = 1;
  }
}

main();

