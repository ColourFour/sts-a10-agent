import { describe, expect, it } from "vitest";
import {
  isSuperHexagonCollision,
  normalizeAngle,
  playerFullyInsideGap,
  sectorForAngle,
  wallRadiallyOverlapsPlayer,
} from "./superHexagonMath";

describe("Super Hexagon collision math", () => {
  it("does not collide when the player is fully inside the wall gap", () => {
    expect(
      isSuperHexagonCollision({
        playerAngle: Math.PI / 6,
        walls: [{ gap: 0, radius: 50, rotation: 0 }],
      }),
    ).toBe(false);
  });

  it("collides when the player angle overlaps a wall segment at player radius", () => {
    expect(
      isSuperHexagonCollision({
        playerAngle: Math.PI / 2,
        walls: [{ gap: 0, radius: 50, rotation: 0 }],
      }),
    ).toBe(true);
  });

  it("handles gap wraparound near zero and two pi", () => {
    const wall = { gap: 5, radius: 50, rotation: 0 };

    expect(playerFullyInsideGap(normalizeAngle(Math.PI * 2 - Math.PI / 6), wall)).toBe(true);
    expect(sectorForAngle(-0.01, 0)).toBe(5);
  });

  it("does not collide after reset-style empty wall state", () => {
    expect(isSuperHexagonCollision({ playerAngle: 0, walls: [] })).toBe(false);
  });

  it("only checks angular collision while the wall overlaps the player radius band", () => {
    expect(wallRadiallyOverlapsPlayer(80)).toBe(false);
    expect(wallRadiallyOverlapsPlayer(50)).toBe(true);
    expect(wallRadiallyOverlapsPlayer(20)).toBe(false);
  });
});
