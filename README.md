# After Hours with Mr. Waternoose

A scream-powered real-time tech demo in three.js. It's the night shift in the
CEO's office and Monstropolis is in a blackout. Scream into your microphone (or
hold Space) to fill the scream canisters and bring the city's lights back on,
while Mr. Waternoose reacts, talks, strolls around on six crab legs, dances, and
occasionally shows his villainous side.

**What's in it**

- **Built for phones.** Big touch controls: tap the floor to walk, tap him to poke, hold to scream.
- **His office, furnished.** A monster-mouth fireplace, fur armchairs with horns, eyeball lamps that watch him, snapping pot plants, a canister chandelier that brightens as the power returns, the family portraits, a Top Scarers board with your score on it, and a child's closet door you really shouldn't open.
- **Scream reviews.** Every scream gets a letter grade (S to F) and a spoken verdict. Keyboard screams top out at B.
- **Night shifts.** Meet the quota to finish the night and get a report card. Each night drains faster and has more brownouts.
- **Grid events.** Power surges (screams count double) and brownouts (the city goes dark and energy leaks away).
- **The board calls.** The desk phone rings. Pick up to hear a two-voice conversation that changes with how the night is going.
- **Desktop extra:** drive him yourself with WASD or a gamepad. Q / E makes him scuttle sideways like a crab.
- **Staff photo.** He poses, and you get a downloadable "Employee of the Month" poster.
- **13 awards** to unlock, and five eyes to poke.
- **Fully voiced.** 85 lines recorded with a local neural TTS, with the jaw lip-synced to each clip's loudness.

**There is no model file.** Mr. Waternoose is sculpted from ~540 signed distance
field primitives and polygonized with Surface Nets across Web Workers when the
page loads. Colour, pores, wrinkles, fabric weave and the vest pattern are all
procedural shader code. The whole game is about 2.5 MB, almost all of it recorded dialogue.

## Controls

| Input | Action |
| --- | --- |
| Hold **Space** / hold the scream button | Scream (fills the canisters) |
| **Enable mic** | Scream for real |
| Tap / click the floor | Send him walking there |
| **W A S D** / arrows, **Q E** | Drive him yourself; Q / E scuttle sideways |
| Click him | Poke him (face, belly, or each of his five eyes) |
| Tap the desk phone (or **F**) | Answer when the board calls |
| Tap the closet door | Open it (he won't like it) |
| **P** | Staff photo ("Employee of the Month" poster) |
| **T** | Chat |
| **B** | Crab dance |
| **V** | Villain mode |
| **R** | Scare demo |
| **Tab** | Director's chair: lighting, render modes (clay, normals, baked AO, wireframe), camera shots, post FX |
| **C** | Cycle camera shots |
| **1–4** | Lighting presets |
| **H** | Photo mode (hide UI) |
| Gamepad | Sticks drive · RT scream · A chat · B scare · X dance · Y villain |

## Tech

- **Sculpt**: SDF closures (ellipsoids, round cones, smooth unions, domain warps), block-sparse sampling, Surface Nets, Newton projection onto the surface, analytic normals, baked SDF ambient occlusion.
- **Rig**: tripod gait with two-bone IK for six legs, head and eye tracking, blinks, a vertex-shader jaw with brow and mouth-corner deformers, and arm poses solved numerically from measured targets.
- **Shading**: patched `MeshPhysicalMaterial` with per-pixel procedural albedo, roughness and bump, wrap-lighting subsurface, and sheen for cloth.
- **Post**: MSAA HDR target, GTAO, bloom, ACES, grain, vignette and chromatic aberration. Quality scales down automatically on weaker GPUs.
- **Voice**: every line is pre-recorded offline by `scripts/voice.mjs` with Kokoro (a local neural TTS). His voice is pitched down about 11% for a bigger, older sound. The board's voice goes through a telephone filter. Each clip is round-trip checked with Whisper speech recognition. The jaw follows a per-clip loudness envelope stored in `public/voice/manifest.json`.
- **Audio**: everything else is synthesized in WebAudio: the scream, the roar, the phone bell, surge sweeps, a swing-jazz sequencer, and leg taps.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run zip        # builds and writes waternoose-itch.zip
npm run voice      # re-record any changed dialogue (add -- --check to verify with Whisper)
```

Dialogue lives in `src/lines.js`. After editing it, run `npm run voice`: only new or changed lines are re-recorded. The first run downloads the Kokoro model (~90 MB) into the Hugging Face cache.

## Uploading to itch.io

1. `npm run zip` (or use the included `waternoose-itch.zip`).
2. On itch.io: **Create new project**. Set **Kind of project** to **HTML**.
3. Upload `waternoose-itch.zip` and tick **This file will be played in the browser**.
4. **Embed options**: viewport **1280 × 720**, tick **Fullscreen button**, and tick **Mobile friendly** (the layout is built for phones in portrait; landscape works too).
5. Leave **SharedArrayBuffer support** off; it isn't needed.
6. Save and view the page. itch's iframe already allows microphone access; players get the browser's permission prompt when they press **Enable mic**.

## Legal

Unofficial, non-commercial fan tribute. Mr. Waternoose and Monsters, Inc. belong
to Disney/Pixar. This project contains no Disney/Pixar assets; everything is
generated procedurally. Don't sell it. Mark it as fan work on itch.io.
