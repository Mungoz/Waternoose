// Original dialogue written for this demo. Each entry: [text, mood, pose]
export const LINES = {
  greet: [
    ['Ah! There you are. Come in, come in. Mind the legs, they have a mind of their own.', 'happy', 'explain'],
  ],
  intro: [
    ['The city is running on fumes. Children these days just do not scream like they used to.', 'worried', 'shrug'],
    ['I need a good scream out of you. Use that microphone of yours, or hold the space bar if you are shy.', 'neutral', 'explain'],
  ],
  lowEnergy: [
    ['Rolling blackouts again. Do you know what that does to a CEO\'s blood pressure?', 'worried', 'shrug'],
    ['Three generations of Waternooses built this company. I will not be the one who turns off the lights.', 'worried', 'steeple'],
    ['Look out there. Half of Monstropolis is sitting in the dark.', 'worried', 'point'],
    ['The board meets in the morning. They will want numbers. I would very much like to give them some.', 'neutral', 'steeple'],
  ],
  midEnergy: [
    ['Now THAT is the spirit! My grandfather would have hired you on the spot.', 'happy', 'explain'],
    ['Hear that hum? That is the sound of lights coming back on all over the city.', 'happy', 'point'],
    ['Keep it coming. Every canister is a neighbourhood with the heating on.', 'happy', 'explain'],
  ],
  screaming: [
    ['Oh, that is the good stuff!', 'delighted', 'delight'],
    ['Magnificent! Simply magnificent!', 'delighted', 'delight'],
    ['Yes! YES! Fill those canisters!', 'delighted', 'delight'],
  ],
  full: [
    ['Quota met! I have not felt this good since the great brownout of seventy three!', 'delighted', 'delight'],
    ['The whole city is lit up. Take a look. You did that.', 'happy', 'point'],
  ],
  poke: [
    ['Please. I am a chief executive, not some petting zoo.', 'surprised', 'shrug'],
    ['That was one of my eyes. Well. One of the five.', 'surprised', 'explain'],
    ['Careful with the suit. It is tailored for six legs and that is NOT cheap.', 'neutral', 'explain'],
    ['Do you poke all your employers like this?', 'surprised', 'shrug'],
  ],
  pokeBelly: [
    ['Oho! Easy now. That is a lifetime of company lunches.', 'happy', 'shrug'],
    ['Watch the vest. It is older than you are.', 'neutral', 'explain'],
  ],
  villain: [
    ['Sometimes a company must make difficult decisions.', 'villain', 'steeple'],
    ['I will keep the lights on in this city. Whatever. It. Takes.', 'villain', 'steeple'],
    ['Do not worry. Nobody will ever know about the machine in the basement.', 'villain', 'steeple'],
    ['Profits are down, you see, and I am running out of patience.', 'villain', 'point'],
  ],
  unvillain: [
    ['Ahem. Where was I? Ah yes. Quarterly targets. Wonderful things.', 'happy', 'explain'],
  ],
  dance: [
    ['My father taught me this one. Six legs, and every one of them a left foot!', 'delighted', 'delight'],
    ['Not bad for a monster my age, eh?', 'happy', 'delight'],
  ],
  walk: [
    ['Walk with me.', 'neutral', 'behind'],
    ['Ah, the view. Every one of those windows runs on a scream, you know.', 'neutral', 'behind'],
    ['I do my best thinking on my feet. All six of them.', 'happy', 'behind'],
  ],
  idle: [
    ['Hmm. Quiet night.', 'neutral', 'steeple'],
    ['Still there? The canisters will not fill themselves, you know.', 'neutral', 'explain'],
    ['You know, I have been at this desk for forty years. It still feels like yesterday.', 'neutral', 'steeple'],
  ],
  scare: [
    ['And THAT is how it was done in my day.', 'happy', 'explain'],
    ['Still got it. Three generations of scarers, you know.', 'happy', 'shrug'],
    ['Pardon me. I get carried away.', 'happy', 'shrug'],
  ],
  micDenied: [['No microphone? Never mind. Hold the space bar and scream on my behalf.', 'neutral', 'explain']],

  // scream reviews
  gradeS: [
    ['Now THAT is a scream, my friend! Put that one in the company newsletter.', 'delighted', 'delight'],
    ['Extraordinary! I have not heard a scream like that in thirty years.', 'delighted', 'delight'],
  ],
  gradeA: [
    ['Excellent! Real terror in that one. Wonderful form.', 'happy', 'explain'],
    ['Very good. The board would be most impressed.', 'happy', 'explain'],
  ],
  gradeB: [
    ['Respectable. I have heard worse from professionals.', 'neutral', 'explain'],
    ['Not bad at all. A little more lungs next time.', 'neutral', 'explain'],
  ],
  gradeC: [
    ['Hmm. A little thin. Put your back into it.', 'neutral', 'shrug'],
    ['That might power a desk lamp, I suppose.', 'neutral', 'shrug'],
  ],
  gradeF: [
    ['Was that a scream, or a yawn?', 'worried', 'shrug'],
    ['I have heard louder screams from a doormat.', 'worried', 'shrug'],
  ],
  gradeKeys: [
    ['Hmm. That scream sounded suspiciously prerecorded. Try the microphone.', 'neutral', 'shrug'],
  ],

  pokeEye: [
    ['Ow! That one is my reading eye.', 'surprised', 'shrug'],
    ['Not the middle one, please.', 'surprised', 'shrug'],
    ['I need those for the quarterly reports!', 'surprised', 'shrug'],
  ],
  allEyes: [['That is all five of them. Are you quite finished?', 'neutral', 'shrug']],

  drive: [
    ['Where are we going?', 'surprised', 'behind'],
    ['Easy now! Six legs, not six wheels.', 'surprised', 'behind'],
    ['Mind the desk. It was my grandfather\'s.', 'worried', 'behind'],
  ],
  photo: [['A staff photo? Hold still, everyone. Smile, with all five eyes.', 'happy', 'explain']],
  photoDone: [['Splendid. Frame that one for the lobby.', 'happy', 'explain']],

  surge: [
    ['A power surge! Quickly, scream now. It counts double!', 'surprised', 'point'],
    ['The grid is surging! Right now, screams are worth twice as much!', 'surprised', 'point'],
  ],
  brownout: [
    ['Blackout on the east side! We are losing power!', 'worried', 'point'],
    ['The lights are failing! Somebody scream!', 'worried', 'point'],
  ],
  allAwards: [['Every award in the building. I may have to promote you.', 'delighted', 'delight']],

  // night shifts
  nightDone: [
    ['Splendid work tonight. Same time tomorrow?', 'happy', 'explain'],
    ['Another quota met. You are making an old monster very proud.', 'happy', 'explain'],
  ],
  nextNight: [
    ['Another night, another quota. And the city is hungrier than ever.', 'neutral', 'explain'],
    ['Back to work. The meters reset at midnight, and so do we.', 'neutral', 'steeple'],
    ['A new night. The board will be watching, so let us give them a show.', 'neutral', 'steeple'],
  ],
  wrongDoor: [
    ['Close that door! Do you want the CDA crawling all over my office?', 'surprised', 'point'],
    ['That door is for research purposes. Strictly research.', 'villain', 'steeple'],
    ['Careful! If one of them gets in here, we are all finished.', 'worried', 'point'],
  ],
  phoneRing: [['Would somebody please get that?', 'neutral', 'point']],
  phoneMissed: [['Hmm. Probably the board. They will call back. They always call back.', 'worried', 'shrug']],
};

// Phone calls from the board. `who` is 'board' (heard down the line) or 'wn'.
export const CALLS = {
  low: [
    { who: 'board', text: 'Henry. The board has seen the overnight figures.' },
    { who: 'wn', text: 'Ah. Yes. A temporary dip, I assure you.', mood: 'worried', pose: 'shrug' },
    { who: 'board', text: 'Temporary? Half the city is dark, Henry. Fix it by morning.' },
    { who: 'wn', text: 'Of course. Leave it with me.', mood: 'worried', pose: 'steeple' },
  ],
  mid: [
    { who: 'board', text: 'Henry, the meters are finally moving. What changed?' },
    { who: 'wn', text: 'A new recruit. Extraordinary lungs.', mood: 'happy', pose: 'explain' },
    { who: 'board', text: 'Then keep them. And keep them screaming.' },
    { who: 'wn', text: 'That is the plan.', mood: 'happy', pose: 'steeple' },
  ],
  full: [
    { who: 'board', text: 'Henry! Every light in Monstropolis is on. How on earth?' },
    { who: 'wn', text: 'Old-fashioned hard work, and a very talented new employee.', mood: 'delighted', pose: 'explain' },
    { who: 'board', text: 'The board is impressed. Take the rest of the night off.' },
    { who: 'wn', text: 'Nonsense. The night is young.', mood: 'happy', pose: 'steeple' },
  ],
};

const used = {};
export function pickLine(kind) {
  const list = LINES[kind];
  if (!list) return null;
  used[kind] = (used[kind] ?? Math.floor(Math.random() * list.length)) + 1;
  return list[used[kind] % list.length];
}
