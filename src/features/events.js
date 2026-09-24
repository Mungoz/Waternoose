// Random grid events keep the night lively:
//  - power surge: screams count double for a few seconds
//  - brownout: part of the city goes dark and the canisters leak energy

const EVENTS = {
  surge: { duration: 12, label: 'POWER SURGE', sub: 'Screams count double!', cls: 'surge' },
  brownout: { duration: 5.5, label: 'BROWNOUT', sub: 'The city is losing power', cls: 'brownout' },
};

export function createEvents(game) {
  const el = document.querySelector('#event');
  let next = 75 + Math.random() * 20; // the first one arrives after the intro has settled
  let active = null;
  let screamedInSurge = false;
  const fx = { surge: 0, brownout: 0 };

  function start(type) {
    const e = EVENTS[type];
    active = { type, t0: game.t, ...e };
    el.className = `event ${e.cls}`;
    el.querySelector('b').textContent = e.label;
    el.querySelector('small').textContent = e.sub;
    game.audio.powerSweep(type === 'surge');
    game.say(type, { force: !game.talk.queue.length });
    screamedInSurge = false;
    game.shifts?.onEvent(type);
  }
  function stop() {
    active = null;
    el.className = 'event hidden';
    next = game.t + (50 + Math.random() * 40) / (game.shifts?.difficulty || 1);
  }

  return {
    fx,
    get active() { return active?.type || null; },
    trigger: (type) => { if (!active) start(type); },
    // multiplier for energy gained from screaming right now
    get gainMult() { return active?.type === 'surge' ? 2 : 1; },
    update(dt, { screaming }) {
      const s = game.state;
      const blocked = !s.started || s.quota || s.villain || s.dancing || game.phoneBusy();
      fx.surge = active?.type === 'surge' ? 1 : 0;
      fx.brownout = active?.type === 'brownout' ? 1 : 0;
      if (active) {
        const left = active.duration - (game.t - active.t0);
        el.querySelector('i').style.width = `${Math.max(0, left / active.duration) * 100}%`;
        if (active.type === 'surge' && screaming && !screamedInSurge) { screamedInSurge = true; game.award('surge'); }
        if (active.type === 'brownout') s.energy = Math.max(0, s.energy - dt * 0.014 * (game.shifts?.difficulty || 1));
        if (left <= 0 || (blocked && active.type === 'brownout')) stop();
        return;
      }
      if (blocked) { next = Math.max(next, game.t + 20); return; }
      if (game.t > next) {
        const canBrown = s.energy > 0.22 && s.energy < 0.95;
        const pBrown = Math.min(0.6, 0.3 + 0.1 * ((game.shifts?.night || 1) - 1));
        start(canBrown && Math.random() < pBrown ? 'brownout' : 'surge');
      }
    },
  };
}
