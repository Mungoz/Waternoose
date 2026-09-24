// Night shifts. Meeting the quota ends the night with a report card; the next
// night starts from a dark city, drains faster and has more brownouts.

const BEST = 'wn-best-night-v1';
const readBest = () => { try { return Number(localStorage.getItem(BEST)) || 1; } catch { return 1; } };

export function createShifts(game) {
  const card = document.querySelector('#nightCard');
  let night = 1;
  let nightStart = 0;
  let stats = { surges: 0, brownouts: 0, bestScore: 0 };
  let best = readBest();

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function showReport() {
    const s = game.state;
    card.querySelector('h2').textContent = `Night ${night} complete`;
    card.querySelector('.stats').innerHTML = [
      ['Time to quota', fmtTime(game.t - nightStart)],
      ['Best scream tonight', stats.bestScore ? `${game.gradeFor(stats.bestScore).g} (${stats.bestScore})` : 'none'],
      ['Power surges', stats.surges],
      ['Brownouts survived', stats.brownouts],
      ['Awards', `${game.awards.count} / ${game.awards.total}`],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    card.querySelector('.next').textContent = `Start night ${night + 1}`;
    card.classList.remove('hidden');
    void s;
  }

  card.querySelector('.next').onclick = () => { card.classList.add('hidden'); startNext(); };
  card.querySelector('.stay').onclick = () => card.classList.add('hidden');

  function startNext() {
    const s = game.state;
    night++;
    if (night > best) { best = night; try { localStorage.setItem(BEST, String(best)); } catch { /* ignore */ } }
    if (night >= 3) game.award('night3');
    stats = { surges: 0, brownouts: 0, bestScore: 0 };
    nightStart = game.t;
    if (s.dancing) game.actions.dance();
    // power drains away over a few seconds, then the new quota begins
    const from = s.energy, t0 = performance.now();
    const drain = () => {
      const k = Math.min(1, (performance.now() - t0) / 2500);
      s.energy = from + (0.04 - from) * k * k;
      if (k < 1) requestAnimationFrame(drain);
      else { s.quota = false; s.cellsDone = 0; }
    };
    drain();
    game.audio.powerSweep(false);
    setTimeout(() => game.say('nextNight', { force: true }), 1800);
  }

  return {
    get night() { return night; },
    get best() { return best; },
    // how much harder this night is: 1 on night one
    get difficulty() { return 1 + 0.6 * (night - 1); },
    begin() { nightStart = game.t; },
    onGrade(score) { stats.bestScore = Math.max(stats.bestScore, score); },
    onEvent(type) { if (type === 'surge') stats.surges++; else stats.brownouts++; },
    onQuota() {
      setTimeout(() => {
        game.say('nightDone', { force: true });
        setTimeout(showReport, 2600);
      }, 15000);
    },
  };
}
