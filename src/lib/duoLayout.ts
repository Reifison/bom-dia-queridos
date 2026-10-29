export interface LayoutRect { x: number; y: number; width: number; height: number }
export interface DuoLayoutGeometry {
  width: number;
  height: number;
  regions: (LayoutRect & { kind: 'division' | 'occlusion' })[];
}

/** Coordinates come from the hosting WKWebView, never a device model or pose. */
export function getDuoPanes(geometry: DuoLayoutGeometry) {
  const { width, height } = geometry;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const regions = geometry.regions.filter(r => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width >= 0 && r.height >= 0);
  const division = regions.find(r => r.kind === 'division' && (
    (r.height >= height / 2 && r.x > 0 && r.x + r.width < width) ||
    (r.width >= width / 2 && r.y > 0 && r.y + r.height < height)
  ));
  if (!division) return null;
  const vertical = division.height >= height / 2 && division.width < width / 2;
  let preview: LayoutRect = vertical
    ? { x: 0, y: 0, width: division.x, height }
    : { x: 0, y: 0, width, height: division.y };
  let commands: LayoutRect = vertical
    ? { x: division.x + division.width, y: 0, width: width - division.x - division.width, height }
    : { x: 0, y: division.y + division.height, width, height: height - division.y - division.height };
  // An occlusion can extend beyond a safe-area edge (for example a camera).
  // Keep each entire interactive pane inside an unobscured rectangle.
  for (const region of regions.filter(r => r.kind === 'occlusion')) {
    preview = avoidOcclusion(preview, region);
    commands = avoidOcclusion(commands, region);
  }
  return { preview, commands };
}

function avoidOcclusion(pane: LayoutRect, region: LayoutRect): LayoutRect {
  const right = pane.x + pane.width, bottom = pane.y + pane.height;
  const x1 = Math.max(pane.x, region.x), y1 = Math.max(pane.y, region.y);
  const x2 = Math.min(right, region.x + region.width), y2 = Math.min(bottom, region.y + region.height);
  if (x2 <= x1 || y2 <= y1) return pane;
  return [
    { ...pane, width: x1 - pane.x },
    { ...pane, x: x2, width: right - x2 },
    { ...pane, height: y1 - pane.y },
    { ...pane, y: y2, height: bottom - y2 },
  ].sort((a, b) => b.width * b.height - a.width * a.height)[0];
}
