/**
 * Iterative radix-2 FFT with precomputed twiddle factors and bit-reversal
 * table. Works on separate real/imaginary Float64Arrays, in place.
 */

export class FFT {
  readonly n: number;
  private readonly levels: number;
  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;
  private readonly rev: Uint32Array;

  constructor(n: number) {
    if (n <= 0 || (n & (n - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${n}`);
    }
    this.n = n;
    this.levels = Math.round(Math.log2(n));
    this.cosTable = new Float64Array(n / 2);
    this.sinTable = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cosTable[i] = Math.cos((2 * Math.PI * i) / n);
      this.sinTable[i] = Math.sin((2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let x = i;
      let r = 0;
      for (let j = 0; j < this.levels; j++) {
        r = (r << 1) | (x & 1);
        x >>= 1;
      }
      this.rev[i] = r;
    }
  }

  /**
   * In-place transform. Pass inverse=true for inverse transform
   * (includes the 1/n scaling).
   */
  transform(re: Float64Array, im: Float64Array, inverse = false): void {
    const n = this.n;
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let tmp = re[i];
        re[i] = re[j];
        re[j] = tmp;
        tmp = im[i];
        im[i] = im[j];
        im[j] = tmp;
      }
    }
    const cosTable = this.cosTable;
    const sinTable = this.sinTable;
    const sgn = inverse ? -1 : 1;
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const c = cosTable[k];
          const s = sgn * sinTable[k];
          const tpre = re[l] * c + im[l] * s;
          const tpim = -re[l] * s + im[l] * c;
          re[l] = re[j] - tpre;
          im[l] = im[j] - tpim;
          re[j] += tpre;
          im[j] += tpim;
        }
      }
    }
    if (inverse) {
      const inv = 1 / n;
      for (let i = 0; i < n; i++) {
        re[i] *= inv;
        im[i] *= inv;
      }
    }
  }
}
