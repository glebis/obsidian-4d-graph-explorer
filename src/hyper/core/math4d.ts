export type Vec4 = [number, number, number, number];
export type Vec3 = [number, number, number];
export type RotationPlane = 'xy' | 'xz' | 'xw' | 'yz' | 'yw' | 'zw';
export type RotationAngles = Partial<Record<RotationPlane, number>>;

export const AXES: ReadonlyArray<'x' | 'y' | 'z' | 'w'> = ['x', 'y', 'z', 'w'];

export function identity4(): Float32Array {
  return Float32Array.from([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(16);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[row * 4 + k] * b[k * 4 + col];
      }
      result[row * 4 + col] = sum;
    }
  }
  return result;
}

export function applyMatrix(vec: Vec4, mat: Float32Array): Vec4 {
  const [x, y, z, w] = vec;
  return [
    mat[0] * x + mat[1] * y + mat[2] * z + mat[3] * w,
    mat[4] * x + mat[5] * y + mat[6] * z + mat[7] * w,
    mat[8] * x + mat[9] * y + mat[10] * z + mat[11] * w,
    mat[12] * x + mat[13] * y + mat[14] * z + mat[15] * w,
  ];
}

export function rotationMatrix(angle: number, axisA: number, axisB: number): Float32Array {
  const mat = identity4();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ia = axisA;
  const ib = axisB;
  mat[ia * 4 + ia] = c;
  mat[ib * 4 + ib] = c;
  mat[ia * 4 + ib] = -s;
  mat[ib * 4 + ia] = s;
  return mat;
}

export function composeRotation(angles: RotationAngles): Float32Array {
  let result = identity4();
  const sequence: Array<[RotationPlane, number, number]> = [
    ['xy', 0, 1],
    ['xz', 0, 2],
    ['xw', 0, 3],
    ['yz', 1, 2],
    ['yw', 1, 3],
    ['zw', 2, 3],
  ];
  for (const [key, a, b] of sequence) {
    const angle = angles[key] ?? 0;
    if (angle !== 0) {
      result = multiplyMatrices(rotationMatrix(angle, a, b), result);
    }
  }
  return result;
}

interface PerspectiveOptions {
  wCamera?: number;
  scale?: number;
}

export function projectPerspective(vec: Vec4, { wCamera = 3.2, scale = 1.2 }: PerspectiveOptions = {}): Vec3 {
  const [x, y, z, w] = vec;
  const denom = Math.max(0.05, wCamera - w);
  const factor = scale / denom;
  return [x * factor, y * factor, z * factor];
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function intersectHyperplane(p1: Vec4, p2: Vec4, axis = 3, value = 0): Vec4 | null {
  const d1 = p1[axis] - value;
  const d2 = p2[axis] - value;
  const denom = d1 - d2;
  if (Math.abs(denom) < 1e-6) {
    return null;
  }
  const t = d1 / denom;
  if (t < 0 || t > 1) {
    return null;
  }
  return [
    lerp(p1[0], p2[0], t),
    lerp(p1[1], p2[1], t),
    lerp(p1[2], p2[2], t),
    lerp(p1[3], p2[3], t),
  ];
}

export function normalize(vec: Vec4): Vec4 {
  const len = Math.hypot(vec[0], vec[1], vec[2], vec[3]);
  if (len === 0) return [0, 0, 0, 0];
  return [vec[0] / len, vec[1] / len, vec[2] / len, vec[3] / len];
}

export function rotateVector(vec: Vec4, deltas: RotationAngles): Vec4 {
  const mat = composeRotation(deltas);
  return applyMatrix(vec, mat);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
