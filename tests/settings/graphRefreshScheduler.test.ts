import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphRefreshScheduler } from '../../src/settings/graphRefreshScheduler';

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

test('GraphRefreshScheduler debounces visual-only updates at short delay', () => {
  const timers = new FakeTimers();
  const refreshes: boolean[] = [];
  const scheduler = new GraphRefreshScheduler({
    setTimeout: (callback, delayMs) => timers.setTimeout(callback, delayMs),
    clearTimeout: (id) => timers.clearTimeout(id),
    onRefresh: (reloadGraph) => refreshes.push(reloadGraph),
  });

  scheduler.schedule(false);
  timers.advanceBy(199);
  assert.deepEqual(refreshes, []);
  timers.advanceBy(1);
  assert.deepEqual(refreshes, [false]);
});

test('GraphRefreshScheduler preserves reload intent across mixed updates', () => {
  const timers = new FakeTimers();
  const refreshes: boolean[] = [];
  const scheduler = new GraphRefreshScheduler({
    setTimeout: (callback, delayMs) => timers.setTimeout(callback, delayMs),
    clearTimeout: (id) => timers.clearTimeout(id),
    onRefresh: (reloadGraph) => refreshes.push(reloadGraph),
  });

  scheduler.schedule(false);
  timers.advanceBy(80);
  scheduler.schedule(true);
  timers.advanceBy(599);
  assert.deepEqual(refreshes, []);
  timers.advanceBy(1);
  assert.deepEqual(refreshes, [true]);
});

test('GraphRefreshScheduler dispose cancels pending work', () => {
  const timers = new FakeTimers();
  const refreshes: boolean[] = [];
  const scheduler = new GraphRefreshScheduler({
    setTimeout: (callback, delayMs) => timers.setTimeout(callback, delayMs),
    clearTimeout: (id) => timers.clearTimeout(id),
    onRefresh: (reloadGraph) => refreshes.push(reloadGraph),
  });

  scheduler.schedule(true);
  scheduler.dispose();
  timers.advanceBy(1000);
  assert.deepEqual(refreshes, []);
});
