// The board calls. The desk phone rings every few minutes; pick it up (click
// it, or press F) to hear a two-voice conversation that depends on how the
// night is going.

import * as THREE from 'three';
import { CALLS } from '../lines.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RING_EVERY = 2.6;
const MAX_RINGS = 5;

export function createPhone(game) {
  const { group, handset, light } = game.office.phone;
  const hint = document.querySelector('#phoneHint');
  let mode = 'idle';
  let next = 120 + Math.random() * 40;
  let rings = 0, lastRing = 0, lastScript = null;
  const phonePos = new THREE.Vector3();

  function canRing() {
    const s = game.state;
    return s.started && !s.dancing && !s.villain && !game.photoBusy() && !game.talk.queue.length
      && game.t > game.talk.until + 1.5 && !game.rig.drive;
  }

  function pickScript() {
    const s = game.state;
    let key = s.energy >= 0.99 ? 'full' : s.energy < 0.35 ? 'low' : 'mid';
    lastScript = key;
    return CALLS[key];
  }

  async function runCall() {
    mode = 'call';
    hint.classList.add('hidden');
    game.audio.pickup();
    game.award('phone');
    group.getWorldPosition(phonePos);
    const listenAt = phonePos.clone().add(new THREE.Vector3(0, 0.2, 0));
    for (const line of pickScript()) {
      let d;
      if (line.who === 'board') {
        game.lookAt(listenAt);
        game.rig.setMood('neutral');
        d = game.sayBoard(line.text);
      } else {
        game.lookAt('camera');
        d = game.say([line.text, line.mood || 'neutral', line.pose || 'explain'], { force: true, fromChain: true });
      }
      await wait((d || 2) * 1000 + 350);
      if (mode !== 'call') return;
    }
    game.audio.pickup();
    game.lookAt(null);
    mode = 'idle';
    next = game.t + 150 + Math.random() * 70;
  }

  return {
    get ringing() { return mode === 'ringing'; },
    get busy() { return mode !== 'idle'; },
    answer() { if (mode === 'ringing') runCall(); },
    hitTest(raycaster) { return raycaster.intersectObject(group, true).length > 0; },
    ring() { if (mode === 'idle') { mode = 'ringing'; rings = 0; lastRing = -99; } },
    update(dt) {
      const t = game.t;
      // handset rattles while ringing, lifts during a call
      const ringing = mode === 'ringing';
      handset.position.y = THREE.MathUtils.lerp(handset.position.y, mode === 'call' ? 0.15 : 0.105, 1 - Math.exp(-8 * dt));
      handset.rotation.x = mode === 'call' ? 0.35 : ringing && (t - lastRing) % RING_EVERY < 1.2 ? Math.sin(t * 60) * 0.05 : 0;
      light.material.color.setHex(ringing ? ((t * 4) % 1 < 0.5 ? 0xff2020 : 0x220000) : mode === 'call' ? 0x30ff60 : 0x220000);

      if (mode === 'idle') {
        if (t > next && canRing()) { mode = 'ringing'; rings = 0; lastRing = -99; }
        else if (t > next) next = t + 10;
        return;
      }
      if (mode === 'ringing') {
        if (t - lastRing > RING_EVERY) {
          lastRing = t;
          rings++;
          if (rings > MAX_RINGS) {
            mode = 'idle';
            hint.classList.add('hidden');
            game.lookAt(null);
            game.say('phoneMissed');
            next = t + 110 + Math.random() * 40;
            return;
          }
          game.audio.ring();
          hint.classList.remove('hidden');
          if (rings === 2) game.say('phoneRing');
        }
        group.getWorldPosition(phonePos);
        game.lookAt(phonePos);
      }
    },
  };
}
