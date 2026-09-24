// Every scream gets a performance review: a letter grade, a card on screen and
// a spoken verdict. Keyboard screams are capped at B; the mic can reach S.

const GRADES = [
  { g: 'S', min: 88, line: 'gradeS', color: '#ffd84a' },
  { g: 'A', min: 75, line: 'gradeA', color: '#7fe3a8' },
  { g: 'B', min: 58, line: 'gradeB', color: '#7fc4ff' },
  { g: 'C', min: 38, line: 'gradeC', color: '#d8c6a0' },
  { g: 'D', min: 20, line: 'gradeF', color: '#e59a7a' },
  { g: 'F', min: -1, line: 'gradeF', color: '#e0616d' },
];
const KEYBOARD_CAP = 74;
const BEST = 'wn-best-scream-v1';
const loadBest = () => { try { return Number(localStorage.getItem(BEST)) || 0; } catch { return 0; } };

export const gradeFor = (score) => GRADES.find((x) => score >= x.min);

export function createGrading(game) {
  let session = null;
  let best = loadBest();
  const card = document.querySelector('#grade');
  let hideTimer = 0;

  function finish(s) {
    if (s.t < 0.6) return;
    let score = 100 * (1 - Math.exp(-s.sum / 1.1)) * (0.7 + 0.3 * s.peak);
    const capped = !s.mic && score > KEYBOARD_CAP;
    if (!s.mic) score = Math.min(score, KEYBOARD_CAP);
    score = Math.round(score);
    const G = gradeFor(score);
    const isBest = score > best;
    if (isBest) { best = score; try { localStorage.setItem(BEST, String(best)); } catch { /* ignore */ } }

    card.style.setProperty('--gc', G.color);
    card.querySelector('.letter').textContent = G.g;
    card.querySelector('.score').textContent = `${score}`;
    card.querySelector('.meta').textContent = `${s.t.toFixed(1)}s · peak ${Math.round(s.peak * 100)}% · ${s.mic ? 'microphone' : 'keyboard'}`;
    card.querySelector('.best').textContent = isBest ? 'NEW PERSONAL BEST' : `best: ${gradeFor(best).g} (${best})`;
    card.classList.remove('hidden', 'pop');
    void card.offsetWidth;
    card.classList.add('pop');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => card.classList.add('hidden'), 5200);

    if (G.g === 'S') game.award('sRank');
    // his verdict, unless he's busy with something scripted
    if (!game.talk.queue.length && !game.state.villain) {
      setTimeout(() => game.say(capped ? 'gradeKeys' : G.line, { force: true }), 350);
    }
    game.shifts?.onGrade(score);
  }

  return {
    get best() { return best; },
    // called every frame with the current scream strength (0..1)
    update(dt, strength, fromMic) {
      if (strength > 0.12) {
        if (!session) session = { t: 0, sum: 0, peak: 0, mic: false, quiet: 0 };
        session.t += dt;
        session.sum += strength * dt;
        session.peak = Math.max(session.peak, strength);
        session.mic ||= fromMic;
        session.quiet = 0;
      } else if (session) {
        session.quiet += dt;
        if (session.quiet > 0.45) { finish(session); session = null; }
      }
    },
  };
}
