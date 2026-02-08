# Performance Baseline

This document tracks benchmark output from the synthetic graph harness.

## How to run

```bash
npm run bench:graph
```

Optional flags:

- `--sizes=1200,3000,5000`
- `--degree=6`
- `--runs=5`
- `--label-pool=160`
- `--visible-labels=24`

Example:

```bash
npm run bench:graph -- --sizes=2000,6000 --degree=7 --runs=8
```

## Baseline (February 8, 2026)

Command:

```bash
npm run bench:graph
```

Environment: local developer machine, default benchmark parameters.

| Nodes | Links | Generate | Build (no force) | Build (force) | Rebuild avg | Label pipeline avg |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1200 | 3600 | 2.81 ms | 6.42 ms | 37.97 ms | 18.11 ms | 0.71 ms |
| 3000 | 9000 | 3.26 ms | 5.97 ms | 34.95 ms | 50.00 ms | 1.03 ms |
| 5000 | 15000 | 5.78 ms | 13.10 ms | 34.90 ms | 36.35 ms | 1.18 ms |
