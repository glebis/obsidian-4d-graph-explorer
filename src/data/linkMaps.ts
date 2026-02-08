export type ResolvedLinks = Record<string, Record<string, number>>;

export interface DegreeMaps {
  outgoing: Map<string, number>;
  incoming: Map<string, number>;
}

export interface ResolvedLinkDerived {
  degreeMaps: DegreeMaps;
  reverseLinks: Map<string, Set<string>>;
}

function buildResolvedLinkDerived(resolvedLinks: ResolvedLinks): ResolvedLinkDerived {
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  const reverseLinks = new Map<string, Set<string>>();

  Object.entries(resolvedLinks).forEach(([source, targets]) => {
    let totalOutgoing = 0;
    Object.entries(targets).forEach(([target, count]) => {
      const numericCount = Number.isFinite(count) ? Number(count) : 0;
      totalOutgoing += numericCount;
      incoming.set(target, (incoming.get(target) ?? 0) + numericCount);
      if (!reverseLinks.has(target)) reverseLinks.set(target, new Set());
      reverseLinks.get(target)!.add(source);
    });
    outgoing.set(source, totalOutgoing);
  });

  return {
    degreeMaps: { outgoing, incoming },
    reverseLinks,
  };
}

export class ResolvedLinkDerivedCache {
  private cache = new WeakMap<ResolvedLinks, ResolvedLinkDerived>();

  get(resolvedLinks: ResolvedLinks): ResolvedLinkDerived {
    const cached = this.cache.get(resolvedLinks);
    if (cached) {
      return cached;
    }
    const derived = buildResolvedLinkDerived(resolvedLinks);
    this.cache.set(resolvedLinks, derived);
    return derived;
  }

  clear(): void {
    this.cache = new WeakMap<ResolvedLinks, ResolvedLinkDerived>();
  }
}

export const resolvedLinkDerivedCache = new ResolvedLinkDerivedCache();
