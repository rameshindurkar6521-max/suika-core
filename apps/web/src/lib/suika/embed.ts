/**
 * SUIKA X — Embedding pipeline.
 *
 * A deterministic hashed projection used to produce a fixed-dimension vector
 * for memory retrieval (simulating a dense embedding model). Provides cosine
 * similarity for hybrid (semantic + lexical) search. Deterministic so that
 * identical inputs always map to the same vector, enabling stable retrieval.
 */

const DIM = 64;

function hashStr(s: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Convert to unsigned 32-bit
  return h >>> 0;
}

export function embed(text: string): number[] {
  const vec = new Array(DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/g)
    .filter(Boolean);
  for (const tok of tokens) {
    for (let s = 0; s < 4; s++) {
      const h = hashStr(tok, s);
      const idx = h % DIM;
      const sign = (h >> 31) & 1 ? 1 : -1;
      vec[idx] += sign;
    }
  }
  // L2 normalize
  let norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // vectors are pre-normalized
}

/**
 * Hybrid retrieval score: weighted combination of semantic similarity and
 * lexical (token overlap) similarity.
 */
export function hybridScore(
  queryVec: number[],
  queryTokens: Set<string>,
  targetVec: number[],
  targetText: string,
  semanticWeight = 0.6
): number {
  const sem = cosine(queryVec, targetVec);
  const targetTokens = new Set(
    targetText
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/g)
      .filter(Boolean)
  );
  let overlap = 0;
  for (const t of queryTokens) if (targetTokens.has(t)) overlap++;
  const lex = queryTokens.size ? overlap / queryTokens.size : 0;
  return semanticWeight * sem + (1 - semanticWeight) * lex;
}

export function tokenizeSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/g)
      .filter(Boolean)
  );
}
