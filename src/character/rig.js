// Procedural animation for Mr. Waternoose. No keyframes: everything is driven
// by springs, IK and a few hand-authored arm poses.

import * as THREE from 'three';
import { charUniforms } from './materials.js';
import { BODY_HEIGHT, FEMUR, TIBIA, JAW_HINGE } from './anatomy.js';

const V = () => new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _basis = new THREE.Matrix4();
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const clamp = THREE.MathUtils.clamp;
const smooth = (t) => t * t * (3 - 2 * t);

// arm poses for his LEFT arm; the right is mirrored.
// [swingFwd, twist, abduct, elbow, wristX, wristY, wristZ]
// Solved numerically (scripts/posesolve.mjs) from elbow / wrist / fingertip
// targets measured off film frames.
const POSES = {
  idle: [-0.203, 0.349, 1.125, -2.088, 0.374, 0.021, -1.121],
  explain: [-0.728, 0.606, 1.261, -1.367, 0.362, -0.103, -0.215],
  shrug: [-0.262, 0.801, 1.037, -1.025, 0.335, 0.255, 0.088],
  delight: [-0.186, 1.287, 2.266, -0.456, -0.116, 0.04, 0.142],
  steeple: [-1.032, -0.193, 0.705, -1.393, -0.248, 0.142, 0.003],
  point: [-0.906, 0.487, 1.674, -0.929, 0.068, 0.045, -0.069],
  behind: [-0.041, 0.346, 0.965, -1.583, 0.428, -0.143, -0.98],
  jazzUp: [-0.265, 1.251, 2.149, -0.358, -0.103, 0.009, 0.159],
  jazzDown: [-0.292, 0.937, 0.996, -0.865, 0.178, 0.021, 0.103],
  scare: [-0.595, 0.937, 2.518, -0.278, -0.229, -0.068, -0.137],
};

// a bit of 1D value noise for idle motion
function n1(x) {
  const i = Math.floor(x), f = x - i;
  const h = (k) => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  return (h(i) + (h(i + 1) - h(i)) * smooth(f)) * 2 - 1;
}

export class WaternooseRig {
  constructor(ch) {
    this.ch = ch;
    this.POSES = POSES; // exposed for tuning
    this.time = 0;
    // locomotion
    this.target = null;
    this.speed = 0;
    this.heading = 0;
    this.turnRate = 0;
    this.maxSpeed = 1.05;
    this.bounds = { x: [-4.2, 4.2], z: [-3.2, 3.0] };
    this.vel = V();
    this.fwdSpeed = 0;
    this.sideSpeed = 0;
    this.drive = null; // { forward, strafe, turn } in -1..1 while the player steers
    this.obstacles = []; // [{ x, z, r }] world-space circles
    this.distanceWalked = 0;
    this.onFootstep = null;
    this.onArrive = null;
    // look
    this.lookTarget = V().set(0, 2, 5);
    this.headYaw = 0; this.headPitch = 0; this.headRoll = 0;
    this.saccade = V();
    this.nextSaccade = 0;
    // face
    this.blink = 0; this.nextBlink = 1.5; this.blinkT = -1; this.doubleBlink = false;
    this.jaw = 0;
    this.mouthFn = null;
    this.mood = 'neutral';
    this.expr = { brow: 0, furrow: 0.2, smile: 0, squint: 0, pupil: 0.2, glow: 0 };
    this.flinch = 0;
    this.jiggle = 0; this.jiggleV = 0;
    // arms
    this.pose = { L: 'idle', R: 'idle' };
    this.armCur = { L: POSES.idle.slice(), R: POSES.idle.slice() };
    this.talkGesture = 0;
    // dance
    this.dance = null; // { beat: () => beatPosition (float) }
    this.lastBeat = -1;
    this.celebrate = 0;
    this.scareT = -1;
    this.villain = 0;

    this._initLegs();
  }

  _initLegs() {
    const { root } = this.ch;
    root.updateMatrixWorld(true);
    this.ch.legs.forEach((l, i) => {
      l.foot = l.restLocal.clone().applyMatrix4(root.matrixWorld);
      l.stepping = false;
      l.t = 0;
      l.from = V(); l.to = V();
      l.group = [0, 4, 2].includes(i) ? 0 : 1;
      l.hipW = V(); l.knee = V();
    });
    this.lastGroup = 1;
    this.idleTime = 0;
  }

  // teleport (used on load / reset)
  place(x, z, heading = 0) {
    const r = this.ch.root;
    r.position.set(x, 0, z);
    this.heading = heading;
    r.rotation.y = heading;
    this.target = null;
    this.speed = 0;
    this._initLegs();
  }

  walkTo(p) {
    this.target = new THREE.Vector3(
      clamp(p.x, this.bounds.x[0], this.bounds.x[1]), 0,
      clamp(p.z, this.bounds.z[0], this.bounds.z[1]),
    );
    this._avoid(this.target);
  }

  // keep his body (and most of his legs) out of the furniture
  _avoid(p) {
    for (const o of this.obstacles) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz), min = o.r + 1.0;
      if (d < min && d > 1e-4) { p.x = o.x + (dx / d) * min; p.z = o.z + (dz / d) * min; }
    }
  }

  setMood(m) { this.mood = m; }
  setPose(l, r = l) { this.pose.L = l; this.pose.R = r; }
  scare() { this.scareT = 0; }
  poke(where) {
    if (where === 'face') { this.flinch = 1; this.blinkT = 0; }
    else { this.jiggleV += 3.5; }
  }

  // ----------------------------------------------------------------------------
  update(dt, cameraPos) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const t = this.time;
    const { root, body, neck, arms } = this.ch;

    // ---- locomotion ----------------------------------------------------------
    let desiredSpeed = 0;
    if (this.target && !this.dance) {
      const dx = this.target.x - root.position.x, dz = this.target.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) {
        this.target = null;
        this.onArrive?.();
      } else {
        const want = Math.atan2(dx, dz);
        let err = want - this.heading;
        err = Math.atan2(Math.sin(err), Math.cos(err));
        const turn = clamp(err * 3.0, -1.6, 1.6);
        this.turnRate = damp(this.turnRate, turn, 6, dt);
        const align = Math.max(0, Math.cos(err));
        desiredSpeed = this.maxSpeed * align * align * clamp(dist / 0.7, 0.15, 1);
      }
    } else if (this.dance) {
      this.turnRate = damp(this.turnRate, 0.6 * Math.sin(t * 0.4), 2, dt);
    } else if (this.drive) {
      this.turnRate = damp(this.turnRate, -this.drive.turn * 1.7, 5, dt);
    } else {
      this.turnRate = damp(this.turnRate, 0, 6, dt);
    }
    this.heading += this.turnRate * dt;
    root.rotation.y = this.heading;
    const fwd = V().set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = V().set(-fwd.z, 0, fwd.x);
    if (this.drive && !this.dance) {
      // direct control: forward/back plus crab-style sidestepping
      const want = V().addScaledVector(fwd, this.drive.forward * this.maxSpeed)
        .addScaledVector(right, this.drive.strafe * this.maxSpeed * 0.85);
      this.vel.lerp(want, 1 - Math.exp(-3.5 * dt));
      this.speed = this.vel.length();
    } else {
      this.speed = damp(this.speed, desiredSpeed, 3.2, dt);
      this.vel.copy(fwd).multiplyScalar(this.speed);
    }
    // lean into forward speed and sideways motion
    this.fwdSpeed = this.vel.dot(fwd);
    this.sideSpeed = this.vel.dot(right);
    root.position.addScaledVector(this.vel, dt);
    this.distanceWalked += this.speed * dt;
    root.position.x = clamp(root.position.x, this.bounds.x[0] - 0.3, this.bounds.x[1] + 0.3);
    root.position.z = clamp(root.position.z, this.bounds.z[0] - 0.3, this.bounds.z[1] + 0.3);
    this._avoid(root.position);
    root.updateMatrixWorld(true);

    // ---- dance beat ------------------------------------------------------------
    let beatPhase = 0, beatIndex = -1;
    if (this.dance) {
      const b = this.dance.beat();
      beatIndex = Math.floor(b);
      beatPhase = b - beatIndex;
    }

    // ---- gait -----------------------------------------------------------------
    this._gait(dt, beatIndex);

    // ---- scare timeline: wind up, rear up and roar, settle ----------------------
    let rear = 0;
    if (this.scareT >= 0) {
      this.scareT += dt;
      const s = this.scareT;
      rear = s < 0.35 ? -0.4 * (s / 0.35) : s < 0.55 ? -0.4 + 1.4 * ((s - 0.35) / 0.2) : s < 1.5 ? 1 : Math.max(0, 1 - (s - 1.5) / 0.5);
      if (s > 2.0) this.scareT = -1;
    }
    this.rear = rear;

    // ---- body -------------------------------------------------------------------
    let lift = 0, stepping = 0;
    for (const l of this.ch.legs) if (l.stepping) { lift += Math.sin(Math.PI * l.t); stepping++; }
    const breath = Math.sin(t * 1.35);
    let bob = -0.035 * (stepping ? lift / stepping : 0) + 0.006 * breath;
    let danceTwist = 0, danceRoll = 0;
    if (this.dance) {
      const pulse = Math.pow(1 - beatPhase, 3);
      bob += -0.07 * pulse + 0.02;
      danceTwist = Math.sin((beatIndex + beatPhase) * Math.PI * 0.5) * 0.28;
      danceRoll = Math.sin((beatIndex + beatPhase) * Math.PI) * 0.06;
    }
    body.position.y = damp(body.position.y, BODY_HEIGHT + bob - this.villain * 0.06 + Math.max(0, rear) * 0.2 - Math.max(0, -rear) * 0.12, 14, dt);
    body.rotation.x = damp(body.rotation.x, this.fwdSpeed * 0.08 + this.villain * 0.1 + 0.02 * breath - rear * 0.18, rear ? 10 : 4, dt);
    body.rotation.z = damp(body.rotation.z, -this.turnRate * 0.05 - this.sideSpeed * 0.07 + danceRoll + n1(t * 0.3) * 0.015, 4, dt);
    body.rotation.y = damp(body.rotation.y, danceTwist + n1(t * 0.23 + 5) * 0.03, 6, dt);
    // belly jiggle spring
    this.jiggleV += (-this.jiggle * 90 - this.jiggleV * 7) * dt;
    this.jiggle += this.jiggleV * dt;
    const sq = this.jiggle * 0.05 + breath * 0.006;
    body.scale.set(1 + sq, 1 - sq * 0.8, 1 + sq);

    // ---- head look -------------------------------------------------------------
    body.updateMatrixWorld(true);
    const neckW = neck.getWorldPosition(V());
    if (t > this.nextSaccade) {
      this.saccade.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.15, 0);
      this.nextSaccade = t + 0.6 + Math.random() * 2.2;
    }
    const lt = (this.lookTarget || cameraPos).clone().add(this.saccade);
    if (this.speed > 0.15) {
      const ahead = root.position.clone().addScaledVector(fwd, 3).setY(2.0);
      lt.lerp(ahead, clamp((this.speed - 0.15) * 2, 0, 0.85));
    }
    const local = body.worldToLocal(lt.clone()).sub(neck.position);
    let yaw = Math.atan2(local.x, local.z);
    let pitch = -Math.atan2(local.y - 0.35, Math.hypot(local.x, local.z));
    yaw = clamp(yaw, -0.75, 0.75);
    pitch = clamp(pitch, -0.3, 0.35);
    // flinch: snap back
    this.flinch = damp(this.flinch, 0, 3, dt);
    let nod = 0;
    if (this.dance) nod = Math.sin(beatPhase * Math.PI * 2) * 0.09;
    const talkNod = this.mouthFn ? n1(t * 3.1) * 0.05 : 0;
    this.headYaw = damp(this.headYaw, yaw * 0.85 + n1(t * 0.5) * 0.04, 3.5, dt);
    this.headPitch = damp(this.headPitch, pitch * 0.8 + nod + talkNod - this.flinch * 0.25 + this.villain * 0.12, 4, dt);
    this.headRoll = damp(this.headRoll, n1(t * 0.37 + 9) * 0.05 + (this.dance ? Math.sin((beatIndex + beatPhase) * Math.PI) * 0.12 : 0), 3, dt);
    neck.rotation.set(this.headPitch, this.headYaw, this.headRoll, 'YXZ');
    neck.position.z = 0.03 - this.flinch * 0.05;
    neck.updateMatrixWorld(true);
    void neckW;

    // ---- eyes -----------------------------------------------------------------
    for (let i = 0; i < this.ch.eyes.length; i++) {
      const e = this.ch.eyes[i];
      const lp = e.socket.worldToLocal(lt.clone()).normalize();
      // clamp gaze cone
      const maxA = i < 2 ? 0.55 : 0.4;
      const ang = lp.angleTo(Z);
      if (ang > maxA) lp.lerp(Z, 1 - maxA / ang).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(Z, lp);
      e.ball.quaternion.slerp(q, 1 - Math.exp(-(i < 2 ? 18 : 9) * dt));
    }

    // ---- blink & lids -----------------------------------------------------------
    if (t > this.nextBlink && this.blinkT < 0) {
      this.blinkT = 0;
      this.doubleBlink = Math.random() < 0.2;
      this.nextBlink = t + 1.8 + Math.random() * 4;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const d = 0.16;
      const u = this.blinkT / d;
      this.blink = u < 0.4 ? u / 0.4 : Math.max(0, 1 - (u - 0.4) / 0.6);
      if (u >= 1) {
        if (this.doubleBlink) { this.doubleBlink = false; this.blinkT = 0; }
        else { this.blinkT = -1; this.blink = 0; }
      }
    }
    this._expression(dt);
    const sqz = this.expr.squint;
    for (let i = 0; i < this.ch.eyes.length; i++) {
      const e = this.ch.eyes[i];
      // lids ride along with vertical gaze a little
      const gazeY = new THREE.Vector3(0, 0, 1).applyQuaternion(e.ball.quaternion).y;
      const b = Math.max(this.blink, this.flinch * 0.9);
      // hooded lids: the top of each eye is always a little covered
      const upOpen = -0.5 + sqz * 0.35 - gazeY * 0.35;
      const loOpen = 0.78 - sqz * 0.28 - gazeY * 0.15;
      e.upper.rotation.x = THREE.MathUtils.lerp(upOpen, 0.08, b);
      e.lower.rotation.x = THREE.MathUtils.lerp(loOpen, 0.02, b);
    }

    // ---- jaw -------------------------------------------------------------------
    const mouth = Math.max(this.mouthFn ? this.mouthFn() : 0, Math.max(0, this.rear || 0) * 1.6);
    const jawTarget = mouth * 0.14 + this.celebrate * 0.08 + 0.003;
    this.jaw = damp(this.jaw, jawTarget, 22, dt);
    this.ch.jaw.rotation.x = this.jaw;
    charUniforms.uJaw.value = this.jaw;
    // teeth hide inside the lips when the mouth is shut
    const open = clamp(this.jaw / 0.035, 0, 1);
    this.ch.upperTeeth.position.y = (1 - open) * 0.022;
    this.ch.lowerTeeth.position.y = -JAW_HINGE[1] - (1 - open) * 0.02;
    this.ch.tongue.position.y = -JAW_HINGE[1] - (1 - open) * 0.035;
    const shown = this.jaw > 0.012;
    this.ch.upperTeeth.visible = this.ch.lowerTeeth.visible = this.ch.tongue.visible = shown;

    // ---- arms ------------------------------------------------------------------
    this._arms(dt, beatIndex, beatPhase, mouth);

    // ---- legs to meshes --------------------------------------------------------
    this._legIK();
    this.celebrate = damp(this.celebrate, 0, 0.6, dt);
  }

  _expression(dt) {
    const E = {
      neutral: { brow: 0.1, furrow: 0.25, smile: -0.1, squint: 0.05, pupil: 0.2, glow: 0 },
      happy: { brow: 0.6, furrow: -0.1, smile: 1.0, squint: 0.2, pupil: 0.24, glow: 0 },
      worried: { brow: 0.4, furrow: -0.8, smile: -0.8, squint: 0, pupil: 0.18, glow: 0 },
      delighted: { brow: 1.0, furrow: -0.3, smile: 1.3, squint: 0.35, pupil: 0.27, glow: 0 },
      villain: { brow: -0.5, furrow: 1.2, smile: 0.7, squint: 0.45, pupil: 0.1, glow: 0.8 },
      surprised: { brow: 1.2, furrow: -0.4, smile: -0.3, squint: -0.3, pupil: 0.14, glow: 0 },
    }[this.mood] || {};
    for (const k in this.expr) this.expr[k] = damp(this.expr[k], E[k] ?? this.expr[k], 5, dt);
    const rr = Math.max(0, this.rear || 0);
    if (rr > 0) { this.expr.furrow = Math.max(this.expr.furrow, rr * 1.3); this.expr.brow = Math.min(this.expr.brow, -rr * 0.6); this.expr.pupil = 0.12; this.expr.squint = rr * 0.4; }
    const u = charUniforms;
    u.uBrow.value = this.expr.brow + this.flinch * 0.8;
    u.uFurrow.value = this.expr.furrow;
    u.uSmile.value = this.expr.smile;
    u.uPupil.value = this.expr.pupil;
    u.uEyeGlow.value = this.expr.glow;
    this.villain = damp(this.villain, this.mood === 'villain' ? 1 : 0, 3, dt);
  }

  _arms(dt, beatIndex, beatPhase, mouth) {
    const t = this.time;
    this.talkGesture = damp(this.talkGesture, this.mouthFn ? 1 : 0, 2, dt);
    for (const key of ['L', 'R']) {
      const arm = this.ch.arms[key];
      const s = arm.side;
      let target = POSES[this.pose[key]] || POSES.idle;
      if ((this.rear || 0) > 0.05) target = POSES.scare;
      if (this.dance) {
        const b = beatIndex + beatPhase;
        const up = (Math.floor(b / 2) + (key === 'L' ? 0 : 1)) % 2 === 0;
        target = up ? POSES.jazzUp : POSES.jazzDown;
      }
      const cur = this.armCur[key];
      const rate = this.dance ? 9 : (this.rear || 0) > 0.05 ? 12 : 4;
      for (let i = 0; i < 7; i++) cur[i] = damp(cur[i], target[i], rate, dt);
      // additive motion: breathing sway, talk gestures, walk swing
      const ph = key === 'L' ? 0 : 1.7;
      const talk = this.talkGesture * (n1(t * 1.6 + ph) * 0.35 + mouth * 0.12);
      const swing = this.speed * 0.25 * Math.sin(t * 5.5 + (key === 'L' ? 0 : Math.PI));
      const shake = this.dance ? Math.sin(t * 28 + ph) * 0.25 : 0;
      arm.shoulder.rotation.set(
        cur[0] + talk * 0.8 + swing + Math.sin(t * 1.35) * 0.02,
        (cur[1] + talk * 0.3) * s,
        (cur[2] + Math.abs(talk) * 0.2) * s,
      );
      arm.elbow.rotation.x = cur[3] - talk * 0.5;
      arm.wrist.rotation.set(cur[4] + talk * 0.3, (cur[5] + shake) * s, cur[6] * s);
    }
  }

  _gait(dt, beatIndex) {
    const { root } = this.ch;
    const legs = this.ch.legs;
    const moving = this.speed > 0.05 || Math.abs(this.turnRate) > 0.12;
    this.idleTime = moving ? 0 : this.idleTime + dt;
    const stepDur = this.dance ? 0.22 : clamp(0.34 - this.speed * 0.1, 0.2, 0.34);
    const stepH = this.dance ? 0.16 : 0.13 + this.speed * 0.06;

    // advance active steps
    for (const l of legs) {
      if (!l.stepping) continue;
      l.t = Math.min(1, l.t + dt / stepDur);
      const e = smooth(l.t);
      l.foot.lerpVectors(l.from, l.to, e);
      l.foot.y = Math.sin(Math.PI * l.t) * stepH;
      if (l.t >= 1) {
        l.stepping = false;
        l.foot.y = 0;
        this.onFootstep?.(l.foot, this.dance ? 1 : 0.5 + this.speed * 0.5);
      }
    }

    // desired foot placements
    const lead = this.vel.clone().multiplyScalar(stepDur * 0.9);
    const turnLead = this.turnRate * stepDur * 0.6;
    const errs = [0, 0];
    const tg = legs.map((l) => {
      const p = l.restLocal.clone();
      if (turnLead) p.applyAxisAngle(Y, turnLead);
      if (this.dance) {
        const k = Math.floor(beatIndex / 2) + l.index;
        p.x += Math.sin(k * 1.7) * 0.07;
        p.z += Math.cos(k * 2.3) * 0.07;
      }
      p.applyMatrix4(root.matrixWorld).add(lead);
      p.y = 0;
      const err = p.distanceTo(V().set(l.foot.x, 0, l.foot.z));
      if (!l.stepping) errs[l.group] = Math.max(errs[l.group], err);
      return { p, err };
    });

    const anyStepping = (g) => legs.some((l) => l.stepping && l.group === g && l.t < 0.7);
    let threshold = moving ? 0.1 : this.idleTime > 0.25 ? 0.03 : 1e9;
    // dance: every beat, the other tripod taps
    let forceGroup = -1;
    if (this.dance && beatIndex !== this.lastBeat && beatIndex >= 0) {
      this.lastBeat = beatIndex;
      forceGroup = beatIndex % 2;
    }
    for (const g of [this.lastGroup ^ 1, this.lastGroup]) {
      const other = g ^ 1;
      if (anyStepping(g) || anyStepping(other)) continue;
      if (g === forceGroup || errs[g] > threshold) {
        for (let i = 0; i < legs.length; i++) {
          const l = legs[i];
          if (l.group !== g || l.stepping) continue;
          if (g !== forceGroup && tg[i].err < threshold * 0.3) continue;
          l.stepping = true;
          l.t = 0;
          l.from.set(l.foot.x, 0, l.foot.z);
          l.to.copy(tg[i].p);
        }
        this.lastGroup = g;
        break;
      }
    }
  }

  _legIK() {
    const { body } = this.ch;
    body.updateMatrixWorld(true);
    const L1 = FEMUR, L2 = TIBIA;
    const bodyCenter = body.getWorldPosition(V());
    for (const l of this.ch.legs) {
      const H = l.hipW.copy(l.hipLocal).applyMatrix4(body.matrixWorld);
      const F = l.foot;
      const toF = V().subVectors(F, H);
      let d = toF.length();
      const dir = toF.clone().divideScalar(d || 1);
      d = clamp(d, Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.01);
      // bend: knees up and out, like a crab
      const out = V().subVectors(H, bodyCenter).setY(0).normalize();
      const pole = out.multiplyScalar(0.7).add(V().set(0, 1.0, 0));
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const a = (L1 * L1 + d * d - L2 * L2) / (2 * d);
      const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const K = l.knee.copy(H).addScaledVector(dir, a).addScaledVector(pole, h);
      // segments run along +Y; +X (the bow of the tibia, the tubercles) faces away from the body
      const outward = V().subVectors(H, bodyCenter).setY(0).normalize();
      const orient = (mesh, from, to) => {
        const yA = V().subVectors(to, from).normalize();
        const xA = outward.clone().addScaledVector(yA, -outward.dot(yA)).normalize();
        const zA = V().crossVectors(xA, yA);
        mesh.position.copy(from);
        mesh.quaternion.setFromRotationMatrix(_basis.makeBasis(xA, yA, zA));
      };
      orient(l.femur, H, K);
      orient(l.tibia, K, F);
      const len = K.distanceTo(F);
      l.tibia.scale.set(1, len / L2, 1);
    }
  }
}
