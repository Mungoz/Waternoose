// Shared measurements (metres). Used both by the sculpt (in workers) and by the
// rig (main thread) so joints line up with the geometry.
//
// Proportions were matched against film frames: the head is ~half the width
// of the crab belly, five small eyes sit in an arc ~40% down the head, the
// mouth runs almost ear to ear ~60% down, and a heavy wrinkled chin rests
// straight on the shirt front. Six thick crab legs, knuckles about belly height.
//
// Spaces:
//   root  — on the floor, facing +Z
//   body  — torso centre; sits BODY_HEIGHT above the floor
//   head  — base of the chin (see NECK in body space)
//   arm   — each bone hangs along -Y from its joint
//   leg   — each segment runs along +Y from its joint; tibia bows toward +X

export const BODY_HEIGHT = 1.18;
export const NECK = [0, 0.6, 0.18];
export const HEAD_SCALE = 1.12;
export const SHOULDER = [0.72, 0.32, -0.02];
export const UPPER_ARM = 0.5;
export const FORE_ARM = 0.45;
export const WRIST_OFFSET = -0.45; // along forearm bone

export const FEMUR = 0.5;
export const TIBIA = 1.06;
export const TIBIA_BOW = 0.32;
// hip placement on the underside of the belly (angle from +Z around Y)
export const HIPS = [
  { side: 1, angle: 0.62 },
  { side: 1, angle: 1.55 },
  { side: 1, angle: 2.45 },
  { side: -1, angle: 0.62 },
  { side: -1, angle: 1.55 },
  { side: -1, angle: 2.45 },
].map((h) => ({
  ...h,
  // body-space hip joint
  hip: [Math.sin(h.angle) * 0.7 * h.side, -0.42, Math.cos(h.angle) * 0.6],
  // root-space rest foot position
  foot: [Math.sin(h.angle) * 1.48 * h.side, 0, Math.cos(h.angle) * 1.34],
}));

// Five eyes in an arc across the brow, head space. dir = resting gaze.
export const EYES = [
  { name: 'innerL', pos: [0.12, 0.488, 0.322], r: 0.047, dir: [0.22, 0.04, 1] },
  { name: 'innerR', pos: [-0.12, 0.488, 0.322], r: 0.047, dir: [-0.22, 0.04, 1] },
  { name: 'centre', pos: [0, 0.537, 0.322], r: 0.036, dir: [0, 0.14, 1] },
  { name: 'outerL', pos: [0.236, 0.543, 0.226], r: 0.041, dir: [0.62, 0.12, 0.78] },
  { name: 'outerR', pos: [-0.236, 0.543, 0.226], r: 0.041, dir: [-0.62, 0.12, 0.78] },
];

export const MOUTH_Y = 0.37;
export const MOUTH_CURVE = 0.42; // frown: y drops by CURVE * x^2
export const MOUTH_HALF_W = 0.33;
export const JAW_HINGE = [0, 0.41, 0.0]; // head space

// Tailoring (body space)
export const JACKET_HEM = -0.2;
export const VEST_BUTTONS = [0.26, 0.11];
