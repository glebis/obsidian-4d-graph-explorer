import { performance } from 'node:perf_hooks';
import { createSyntheticGraphPayload } from '../../src/bench/syntheticGraph';
import { buildNarrativeGraphFromData, updateForceLayoutConfig } from '../../src/hyper/core/graph';
import { pickVisibleLabels, pushCandidateToPool, type LabelCandidate } from '../../src/view/labelSelection';

interface BenchmarkArgs {
  sizes: number[];
  averageDegree: number;
  rebuildRuns: number;
  labelPoolSize: number;
  visibleLabels: number;
}

interface ScenarioMetrics {
  nodes: number;
  links: number;
  generateMs: number;
  buildNoForceMs: number;
  buildForceMs: number;
  rebuildAvgMs: number;
  labelAvgMs: number;
}

function parseNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
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
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function formatMs(value: number): string {
  return `${value.toFixed(2)} ms`;
}

function runLabelSelectionBenchmark(nodeCount: number, runs: number, labelPoolSize: number, visibleLabels: number): number {
  const results: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    const candidates: LabelCandidate[] = [];
    for (let i = 0; i < nodeCount; i += 1) {
      const angle = i * 0.173 + run * 0.119;
      const radius = 140 + (i % 220) * 0.65;
      const weight = 0.15 + ((i * 9301 + run * 49297) % 9973) / 9973;
      const candidate: LabelCandidate = {
        index: i,
        text: `Node ${i}`,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        opacity: 1,
        weight,
        fontSize: 12 + ((i + run) % 7),
        focus: i === run % Math.max(1, nodeCount),
        missing: false,
      };
      pushCandidateToPool(candidates, candidate, labelPoolSize);
    }
    pickVisibleLabels(candidates, visibleLabels);
    results.push(performance.now() - start);
  }
  return mean(results);
}

function benchmarkScenario(nodes: number, args: BenchmarkArgs, scenarioIndex: number): ScenarioMetrics {
  const generateStart = performance.now();
  const payload = createSyntheticGraphPayload({
    nodeCount: nodes,
    averageDegree: args.averageDegree,
    seed: 2026 + scenarioIndex,
  });
  const generateMs = performance.now() - generateStart;

  updateForceLayoutConfig({
    repelForce: 0,
    centerForce: 0,
    linkForce: 0,
    linkDistance: 1.6,
    iterations: 48,
  });

  const buildNoForceStart = performance.now();
  buildNarrativeGraphFromData(payload, { graphName: `bench-${nodes}-no-force` });
  const buildNoForceMs = performance.now() - buildNoForceStart;

  updateForceLayoutConfig({
    repelForce: 2.2,
    centerForce: 0.06,
    linkForce: 0.42,
    linkDistance: 1.6,
    iterations: 48,
  });

  const buildForceStart = performance.now();
  buildNarrativeGraphFromData(payload, { graphName: `bench-${nodes}-force` });
  const buildForceMs = performance.now() - buildForceStart;

  const rebuildTimes: number[] = [];
  for (let run = 0; run < args.rebuildRuns; run += 1) {
    const t0 = performance.now();
    buildNarrativeGraphFromData(payload, { graphName: `bench-${nodes}-rebuild-${run}` });
    rebuildTimes.push(performance.now() - t0);
  }

  const labelAvgMs = runLabelSelectionBenchmark(
    payload.nodes?.length ?? 0,
    args.rebuildRuns,
    args.labelPoolSize,
    args.visibleLabels
  );

  return {
    nodes,
    links: payload.links?.length ?? 0,
    generateMs,
    buildNoForceMs,
    buildForceMs,
    rebuildAvgMs: mean(rebuildTimes),
    labelAvgMs,
  };
}

function printReport(metrics: ScenarioMetrics[], args: BenchmarkArgs): void {
  console.log('# Graph Performance Benchmark');
  console.log('');
  console.log(`Scenarios: ${args.sizes.join(', ')} nodes | avg degree ${args.averageDegree.toFixed(1)} | rebuild runs ${args.rebuildRuns}`);
  console.log('');
  console.log('| Nodes | Links | Generate | Build (no force) | Build (force) | Rebuild avg | Label pipeline avg |');
  console.log('| ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  metrics.forEach((row) => {
    console.log(
      `| ${row.nodes} | ${row.links} | ${formatMs(row.generateMs)} | ${formatMs(row.buildNoForceMs)} | ${formatMs(row.buildForceMs)} | ${formatMs(row.rebuildAvgMs)} | ${formatMs(row.labelAvgMs)} |`
    );
  });
}

function main(): void {
  const args: BenchmarkArgs = {
    sizes: parseSizesArg([1200, 3000, 5000]),
    averageDegree: parseNumberArg('degree', 6),
    rebuildRuns: Math.max(1, Math.round(parseNumberArg('runs', 5))),
    labelPoolSize: Math.max(24, Math.round(parseNumberArg('label-pool', 160))),
    visibleLabels: Math.max(8, Math.round(parseNumberArg('visible-labels', 24))),
  };

  const metrics = args.sizes.map((nodes, index) => benchmarkScenario(nodes, args, index));
  updateForceLayoutConfig({
    repelForce: 0,
    centerForce: 0,
    linkForce: 0,
    linkDistance: 1.6,
    iterations: 48,
  });
  printReport(metrics, args);
}

main();
