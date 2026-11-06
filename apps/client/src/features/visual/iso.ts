/**
 * Isometric projection for the illustrated views. Drawings are described in a unit cube
 * (x to the right-front, y to the left-front, z up); this turns a 3-D point into screen
 * coordinates, with the cube's top-back corner at (originX, originY − size).
 */
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

export function isoProjector(originX: number, originY: number, size: number) {
  const point = (x: number, y: number, z: number) => ({
    x: originX + (x - y) * size * COS30,
    y: originY + (x + y) * size * SIN30 - z * size,
  });
  /** SVG "points" attribute of a polygon given as 3-D points. */
  const polygon = (...corners: Array<[number, number, number]>) =>
    corners
      .map(([x, y, z]) => point(x, y, z))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  return { point, polygon };
}
