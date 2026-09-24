// Desktop extra: WASD / arrows to walk and turn, Q / E to scuttle sideways
// like a crab, or a gamepad. (On touch screens you tap the floor instead.)
// The camera rides along while you drive.

import * as THREE from 'three';

const KEYMAP = {
  KeyW: ['forward', 1], ArrowUp: ['forward', 1], KeyS: ['forward', -1], ArrowDown: ['forward', -1],
  KeyA: ['turn', -1], ArrowLeft: ['turn', -1], KeyD: ['turn', 1], ArrowRight: ['turn', 1],
  KeyQ: ['strafe', -1], KeyE: ['strafe', 1],
};
const dz = (v, d = 0.18) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

export function createDrive(game) {
  const held = new Set();
  const pad = { prev: [] };
  let lastInput = -99, announced = -99;
  const lastRoot = new THREE.Vector3();
  let following = false;

  addEventListener('keydown', (e) => {
    if (!(e.code in KEYMAP) || e.target.tagName === 'INPUT') return;
    if (e.code.startsWith('Arrow')) e.preventDefault();
    held.add(e.code);
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());

  function readGamepad() {
    const gp = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (!gp) return null;
    const b = gp.buttons.map((x) => x.pressed);
    const edge = (i) => b[i] && !pad.prev[i];
    // A talk, B scare, X dance, Y villain, RT scream
    if (edge(0)) game.actions.talk();
    if (edge(1)) game.actions.scare();
    if (edge(2)) game.actions.dance();
    if (edge(3)) game.actions.villain();
    game.actions.padScream(!!b[7]);
    pad.prev = b;
    return { forward: -dz(gp.axes[1] || 0), strafe: dz(gp.axes[0] || 0), turn: dz(gp.axes[2] || 0) };
  }

  return {
    update(dt) {
      const rig = game.rig;
      if (!rig) return;
      const t = game.t;
      const input = { forward: 0, strafe: 0, turn: 0 };
      for (const code of held) { const [k, v] = KEYMAP[code]; input[k] += v; }
      const g = readGamepad();
      if (g) for (const k in input) input[k] += g[k];
      for (const k in input) input[k] = THREE.MathUtils.clamp(input[k], -1, 1);
      const any = Math.abs(input.forward) + Math.abs(input.turn) + Math.abs(input.strafe) > 0.05;

      if (any) {
        if (!rig.drive) {
          if (game.state.dancing) game.actions.dance();
          rig.target = null;
          if (t - announced > 40) { announced = t; game.say('drive'); }
        }
        rig.drive = input;
        lastInput = t;
        game.state.lastInteract = t;
      } else if (rig.drive && t - lastInput > 0.35) {
        rig.drive = null;
      }


      // chase camera: carry the orbit along with him while driving
      const root = rig.ch.root.position;
      const follow = !!rig.drive || t - lastInput < 1.2;
      if (follow && following) {
        const d = root.clone().sub(lastRoot).setY(0);
        game.camera.position.add(d);
        game.controls.target.add(d);
      }
      following = follow;
      lastRoot.copy(root);
    },
  };
}
