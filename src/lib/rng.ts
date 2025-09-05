// Lightweight reproducible RNG (XorShift32)
// Deterministic given the same 32-bit seed; returns floats in [0,1).

export class XorShift32 {
  private state: number;

  constructor(seed: number) {
    // Force into 32-bit unsigned range and avoid zero
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  next(): number {
    // xorshift32 algorithm
    let x = this.state >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  nextFloat(): number {
    // Scale to [0,1)
    return (this.next() >>> 0) / 0x100000000;
  }

  nextRange(min: number, max: number): number {
    return min + (max - min) * this.nextFloat();
  }
}

export function mixSeed(a: number, b: number): number {
  // Simple 32-bit mix of two seeds
  let x = (a ^ (b + 0x9e3779b9 + (a << 6) + (a >>> 2))) >>> 0;
  // Ensure non-zero
  return x || 0x85ebca6b;
}

