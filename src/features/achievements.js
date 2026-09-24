// Awards: small goals that point players at everything the demo can do.
// Progress is a per-browser convenience (localStorage) and fails soft.

export const AWARDS = [
  { id: 'clockin', title: 'Clocked In', desc: 'Start the night shift.' },
  { id: 'firstScream', title: 'Vocal Warm-up', desc: 'Scream for the first time.' },
  { id: 'quota', title: 'Quota Met', desc: 'Fill all five scream canisters.' },
  { id: 'sRank', title: 'Top Scarer', desc: 'Earn an S-rank scream review.' },
  { id: 'allEyes', title: 'Staring Contest', desc: 'Poke all five of his eyes.' },
  { id: 'dance', title: 'Crab Dancer', desc: 'Dance with him for 20 seconds.' },
  { id: 'villain', title: 'The Dark Side', desc: 'Find out what he is really like.' },
  { id: 'stroll', title: 'Walk With Me', desc: 'Send him walking around his office.' },
  { id: 'photo', title: 'Employee of the Month', desc: 'Take a staff photo.' },
  { id: 'wrongDoor', title: 'Wrong Door', desc: 'Open the closet door he keeps in his office.' },
  { id: 'surge', title: 'Surge Protector', desc: 'Scream during a power surge.' },
  { id: 'phone', title: 'Board Meeting', desc: 'Pick up when the board calls (tap the desk phone).' },
  { id: 'night3', title: 'Graveyard Shift', desc: 'Make it to night 3.' },
];

const KEY = 'wn-awards-v1';
const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } };
const save = (set) => { try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* private mode */ } };

const TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v3H8v-3h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1 1.7V7zm10 0v2.7A2 2 0 0 0 18 8V7h-1z"/></svg>';

export function createAchievements(game) {
  const got = load();
  const toasts = document.createElement('div');
  toasts.id = 'toasts';
  document.body.appendChild(toasts);

  const panel = document.querySelector('#awards');
  const list = panel.querySelector('.list');
  const btn = document.querySelector('#dock [data-act="awards"]');

  function render() {
    list.innerHTML = AWARDS.map((a) => `
      <li class="${got.has(a.id) ? 'got' : ''}">
        <span class="ico">${TROPHY}</span>
        <span><b>${a.title}</b><small>${got.has(a.id) ? a.desc : a.desc.replace(/\(.*?\)/, '').trim()}</small></span>
      </li>`).join('');
    panel.querySelector('.count').textContent = `${got.size} / ${AWARDS.length}`;
    btn.querySelector('small').textContent = `${got.size}/${AWARDS.length}`;
  }

  function toast(a) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="ico">${TROPHY}</span><span><em>Award unlocked</em><b>${a.title}</b><small>${a.desc}</small></span>`;
    toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }

  function unlock(id) {
    if (got.has(id)) return false;
    const a = AWARDS.find((x) => x.id === id);
    if (!a) return false;
    got.add(id);
    save(got);
    toast(a);
    game.audio.chime();
    render();
    if (got.size === AWARDS.length) setTimeout(() => game.say('allAwards', { force: true }), 2500);
    return true;
  }

  panel.querySelector('.reset').onclick = () => {
    got.clear();
    save(got);
    render();
  };

  render();
  return {
    unlock,
    has: (id) => got.has(id),
    get count() { return got.size; },
    total: AWARDS.length,
    toggle() {
      panel.classList.toggle('hidden');
      btn.classList.toggle('on', !panel.classList.contains('hidden'));
    },
  };
}
