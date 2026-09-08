# axis visualizer

a 3D interactive tool for visualizing freestyle skiing trick rotations. i built this to help explain how off-axis tricks actually work, what makes a cork different from a rodeo, why a bio isn't just a "forward cork", and what the set at the lip and the open up before landing actually do.

renders an articulated skier with real segment masses through a whole jump: approach, set on the lip, flight, spot, landing and ride out. the momentum vector, the live spin axis, the plane of rotation and the cork ribbon are drawn on the body so you can see why the skier turns the way they do.

## tricks

**on-axis:** spin, frontflip, backflip, lincoln loop

**off-axis (backward tilt):** cork, rodeo, d-spin

**off-axis (forward tilt):** bio, misty, flatspin

off axis tricks take a corks count, so a cork 1080 and a double cork 1080 can sit side by side.

## the axis model

once the skier leaves the lip the angular momentum vector `L` is fixed in the world. the spine precesses around `L` once per cork (that is the dip) while the body twists about its own long axis for the rest of the heading. a cork 720 is one precession plus one twist, a double cork 1080 is two precessions plus one twist. this is the yeadon twisting somersault model, and it reproduces the rotational degrees shortcut google measured on real corks: the body travels fewer degrees than the trick name says because precession and twist combine into a diagonal.

a double or triple is a chain of corks and you choose how the heading is shared between them, so a double cork 1080 can be a cork 7 into a cork 3 or a cork 3 into a cork 7. the twist rate changes between the corks, which is the arm adjustment the skier makes.

## what is modelled

- **the set.** the skier winds up on the approach, coils against the spin, then pops and throws on the lip. shoulders and arms sweep into the trick, the head leads, the hips coil and release, and the momentum builds through the set rather than appearing at takeoff. family specific throws follow snowbox: cork reaches the lead arm across and down, rodeo opens the chest, bio twists across the body, misty does the one arm seatbelt.
- **the body.** de leva segment lengths and masses for a 1.80 m, 75 kg athlete, skis and boots on the feet. the center of mass is computed from the posed body every frame and the figure orbits it. the moment of inertia about the spin axis is measured from the posed segments, so tucking speeds the rotation and opening slows it, and taking the skis off (trampoline) changes it.
- **the spot and the open up.** the head counter rotates against the spin and snaps to find the landing, then the tuck releases, the arms come wide, the knees extend and the cork tilt is pulled out so the skis come back under the hips.
- **the landing.** knees, hips and arms absorb on springs, then the skier rides out.
- **grabs.** safety, mute, tail, japan and truck driver, with the shoulders reaching first and the wrists arriving last.
- **google metrics.** rotational degrees (the quaternion path length) against the nominal, speed weighted axis tilt, peak angular velocity, and the cork ribbon of the instantaneous axis through the trick.

## features

- multi panel view, compare up to 4 tricks side by side
- cork split per panel for doubles and triples
- skis or trampoline scene per panel, same timing so panels stay in sync
- playback with scrubbing and speeds from 0.1x to 2x
- overlays: ghosts, momentum arrow, spin axis, rotation disk, body frame, center of mass, head path, cork ribbon, flight path
- switch stance and left or right side for every trick that has one
- live readout of phase, rotation so far, angular velocity, axis tilt, inertia and tuck

## docs

- `docs/research.md` the biomechanics and the google cloud x team usa measurements
- `docs/snowbox-model.md` what was ported from snowbox and how it works

## stack

**languages:** TypeScript

**frameworks:** n/a

**infra:** Vite

**libraries & API's:** Three.js

## run it

```bash
npm install
npm run dev
```
