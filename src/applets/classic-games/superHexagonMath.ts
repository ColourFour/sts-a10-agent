export type SuperHexagonWall = {
  gap: number;
  radius: number;
  rotation: number;
};

export const superHexagonPlayerRadius = 54;
export const superHexagonPlayerInnerRadius = 34;
export const superHexagonWallLineWidth = 12;
export const superHexagonPlayerHalfAngle = 0.16;

const fullTurn = Math.PI * 2;
const sectorAngle = Math.PI / 3;

export function normalizeAngle(angle: number): number {
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

export function sectorForAngle(angle: number, wallRotation: number): number {
  return Math.floor(normalizeAngle(angle - wallRotation) / sectorAngle) % 6;
}

export function wallRadiallyOverlapsPlayer(
  wallRadius: number,
  lineWidth = superHexagonWallLineWidth,
): boolean {
  const wallInner = wallRadius - lineWidth / 2;
  const wallOuter = wallRadius + lineWidth / 2;
  return wallOuter >= superHexagonPlayerInnerRadius && wallInner <= superHexagonPlayerRadius;
}

export function playerFullyInsideGap(
  playerAngle: number,
  wall: Pick<SuperHexagonWall, "gap" | "rotation">,
  halfAngle = superHexagonPlayerHalfAngle,
): boolean {
  return [playerAngle - halfAngle, playerAngle, playerAngle + halfAngle].every(
    (angle) => sectorForAngle(angle, wall.rotation) === wall.gap,
  );
}

export function isSuperHexagonCollision({
  playerAngle,
  walls,
}: {
  playerAngle: number;
  walls: SuperHexagonWall[];
}): boolean {
  return walls.some(
    (wall) => wallRadiallyOverlapsPlayer(wall.radius) && !playerFullyInsideGap(playerAngle, wall),
  );
}
