import { boxCorners, fitProjection, type Plan } from "./kit/iso-kit";

export const WIDTH = 680;
export const HEIGHT = 360;

export const BED_PLAN: Plan = { x: 0, y: 0, w: 300, d: 184, r: 8 };
export const Z_GROUND = 0;
export const Z_BED_BOTTOM = 4;
export const Z_BED_TOP = 10;
export const Z_RAIL_TOP = 13;

const SCENE_ENVELOPE: Plan = { x: -8, y: -8, w: 314, d: 196, r: 0 };

export const P = fitProjection(
  boxCorners(SCENE_ENVELOPE, 0, 52),
  WIDTH,
  HEIGHT,
  { pad: 16, headroom: 18, azimuth: 48, elevation: 31 },
);
