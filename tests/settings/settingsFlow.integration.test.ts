import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphRefreshScheduler } from '../../src/settings/graphRefreshScheduler';
import { visualSettingRefreshOptions } from '../../src/settings/visualSettingPolicy';

interface TimerTask {
  id: number;
  runAt: number;
  callback: () => void;
}

class FakeTimers {
  private now = 0;
  private nextId = 1;
  private tasks = new Map<number, TimerTask>();

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, {
      id,
      runAt: this.now + Math.max(0, delayMs),
      callback,
    });
    return id;
  }

  clearTimeout(id: number): void {
    this.tasks.delete(id);
  }

  advanceBy(delayMs: number): void {
    this.now += Math.max(0, delayMs);
    const due = Array.from(this.tasks.values())
      .filter((task) => task.runAt <= this.now)
      .sort((a, b) => a.runAt - b.runAt || a.id - b.id);
    due.forEach((task) => {
      this.tasks.delete(task.id);
      task.callback();
    });
  }
}

test('settings flow: theme switch schedules visual refresh only', () => {
  const timers = new FakeTimers();
  const refreshes: boolean[] = [];
  const scheduler = new GraphRefreshScheduler({
    setTimeout: (callback, delayMs) => timers.setTimeout(callback, delayMs),
    clearTimeout: (id) => timers.clearTimeout(id),
    onRefresh: (reloadGraph) => refreshes.push(reloadGraph),
  });

  scheduler.schedule(visualSettingRefreshOptions('theme').reloadGraph);
  timers.advanceBy(200);
  assert.deepEqual(refreshes, [false]);
});

test('settings flow: color rule changes require reload and dominate pending visual updates', () => {
  const timers = new FakeTimers();
  const refreshes: boolean[] = [];
  const scheduler = new GraphRefreshScheduler({
    setTimeout: (callback, delayMs) => timers.setTimeout(callback, delayMs),
    clearTimeout: (id) => timers.clearTimeout(id),
    onRefresh: (reloadGraph) => refreshes.push(reloadGraph),
  });

  scheduler.schedule(visualSettingRefreshOptions('theme').reloadGraph);
  timers.advanceBy(40);
  scheduler.schedule(visualSettingRefreshOptions('color-rules').reloadGraph);
  timers.advanceBy(600);
  assert.deepEqual(refreshes, [true]);
});

test('settings flow: existing-file toggle requires reload', () => {
  const timers = new FakeTimers();
  const refreshes: boolean[] = [];
  const scheduler = new GraphRefreshScheduler({
    setTimeout: (callback, delayMs) => timers.setTimeout(callback, delayMs),
    clearTimeout: (id) => timers.clearTimeout(id),
    onRefresh: (reloadGraph) => refreshes.push(reloadGraph),
  });

  scheduler.schedule(visualSettingRefreshOptions('show-only-existing-files').reloadGraph);
  timers.advanceBy(600);
  assert.deepEqual(refreshes, [true]);
});

test('settings flow: auto performance mode toggle stays visual-only', () => {
  const timers = new FakeTimers();
  const refreshes: boolean[] = [];
  const scheduler = new GraphRefreshScheduler({
    setTimeout: (callback, delayMs) => timers.setTimeout(callback, delayMs),
    clearTimeout: (id) => timers.clearTimeout(id),
    onRefresh: (reloadGraph) => refreshes.push(reloadGraph),
  });

  scheduler.schedule(visualSettingRefreshOptions('auto-performance-mode').reloadGraph);
  timers.advanceBy(200);
  assert.deepEqual(refreshes, [false]);
});
