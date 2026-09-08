# snowbox trick model

what the visualizer ports from snowbox (cloned at `C:\code\snowpark`, the
game code is under `public/`). the live system is `NewTrickPhysics` in
`public/physics/newTrickPhysics.js` with `trickProfiles.js`,
`mistyPhysics.js` and `bodyAnimation.js`.

## frame

three.js, y up, +z forward, the figure faces +z. flip is rotation about x
(+x rotation pitches the head forward, so frontflip is +x and backflip is
-x). spin is about y (+y is a left spin). roll is about z. switch adds pi
of yaw under the trick and flips the sign of the flip momentum.

## families

only six exist: spin, flip, cork, misty, rodeo, bio. cork is back plus
right, rodeo back plus left, misty front plus left, bio front plus right.
degrees are not a separate profile, they are just how far the body turned,
rounded at naming time. "double" counts inversions.

## phases of normalized airtime

```
takeoff    0.00 0.08   pop and extension
axis_set   0.08 0.18   body sets the trick axis
main       0.18 0.68   full rotation
spot       0.68 0.82   head spots the landing
land_prep  0.82 0.94   skis square, body extends
absorb     0.94 1.00   final commit
```

`t = airTimer / estimatedAirtime`, airtime estimated as `2 vy / 9.81`
clamped to 0.4 to 4.0 s.

## rotation

angular momentum `L` is the source of truth and is conserved in the air.
`omega = L / I` with `I = lerp(2.8, 1.4, tuck)`. tuck for off axis tricks
comes from the profile tuck curve, capped at 0.92, and is released between
t 0.80 and 0.96, which is the only thing that slows the rotation before
landing. grabs shrink `I` by 8 percent. the quaternion is integrated with
`dq = 0.5 (0, omega) q dt`.

launch axis per family, from `distributeMomentum`, as (pitch, yaw, roll)
unit weights and tilt from vertical:

```
cork   0.568 0.669 0.479   48.0 deg
rodeo  0.747 0.472 0.468   61.8 deg
bio    0.808 0.491 0.326   60.6 deg
misty  closed form path, see below
```

signs: `x = pitch * flipSign`, `y = yaw * spinSign`,
`z = roll * spinSign * flipSign`. so a left cork leans back and to the
right, away from the spin.

the profile also feeds a body frame axis direction every frame, blended
into omega by direction only with strength `influence(t)` and written back
into `L`, which makes the axis wobble a little. there is no real
precession term.

## misty

misty does not integrate. orientation is a closed form of the flip
progress `phase = flip / 2pi` with twist ratio 0.5 and axis tilt 32 deg:

```
axis = (cos 32, 0, sin 32 * spinDir)
heading  = 2pi * 0.5 * phase * spinDir          about world up
backdrop = pi/2 * sin(pi * phase) * flipDir     about axis
carry    = spinDir * flipDir * (-20 deg sin(2pi phase) + 4 deg sin(4pi phase))
q = R(up, heading) * R(axis, backdrop) * R(up, carry)
```

one cycle is 540 deg of bookkeeping, heading advances 180 so it lands
switch, the body reaches a sideways backdrop at halfway without inverting.

## legacy fixed axis

the old `TrickSystem` in `public/tricks.js` used one fixed axis
`(sin t * fd, cos t * sd, 0.28 * fd * sd)` with tilt `t` of 0.82 cork,
0.65 misty, 1.00 rodeo, 0.55 bio radians, rotated by a constant rate
boosted 1.6x by tuck. that is the "pencil on a spindle" the game moved away
from.

## body pose channels

each family defines curves of normalized airtime built from `rampUp`,
`rampDown`, `trapezoid`, `sineHump`, `bellCurve`, `smoothstep`:

```
tuck          0 extended, 1 tucked
shoulderDrop  asymmetric shoulder, signed by spinDir
hipSet        hip rotation bias, signed by flipDir
headSpot      head tracks the landing, 0 to 1
armSet        arm asymmetry, signed by spinDir
skiCross      ski crossing
spineCounter  counter rotation of the torso
```

cork for example: `tuck = trapezoid(t, 0.10, 0.76) * 1.02`,
`shoulderDrop = sineHump(t, 0.02, 0.34) * 0.9 + trapezoid(t, 0.18, 0.7) * 0.48`,
`hipSet = sineHump(t, 0.04, 0.32) * 0.62`,
`headSpot = smoothstep((t - 0.62) / 0.3)`,
`armSet = trapezoid(t, 0.07, 0.75) * 0.92`,
`skiCross = trapezoid(t, 0.18, 0.72) * 0.48`,
`spineCounter = trapezoid(t, 0.10, 0.80) * 0.56`.
per family multipliers scale these (cork tuck 1.34, shoulderDrop 1.30 ...).

## the throw at launch

`bodyAnimation.onLaunch` starts a 0.5 s throw. envelope is fast attack
(`sin` over the first 30 percent) and slow release. two coil envelopes wind
the spine and hips against the trick for the first 20 to 25 percent and
then release with it:

```
coilEarly = t < 0.25 ? -sin(t / 0.25 * pi/2) : sin((t - 0.25) / 0.75 * pi) * 0.6
coilLate  = t < 0.2  ? -sin(t / 0.2  * pi/2) : sin((t - 0.2)  / 0.8  * pi) * 0.7
```

cork: lead arm reaches across and down, trailing arm sweeps up, spine
coils on x by coilEarly and on y by coilLate, shoulder drops toward the
spin. rodeo: arms sweep wide and back opening the chest, spine arches.
bio: cross body twist, lead arm across, trailing arm behind. misty: one
arm starts high and outside then sweeps across the chest to the opposite
hip, the seatbelt, raised until 12 to 36 percent of the throw, pull 8 to 54
percent. knees compress hard for the first 15 percent then extend past
neutral. arms overshoot on a spring (stiffness 90, damping 0.55).

## head spotting

`public/character/headSpotting.js`: the head counter rotates against the
spin up to 65 deg of neck yaw then snaps to the opposite limit. pursuit
rate 22 for 0.18 s after a snap, else 8. fades out from t 0.72 to 0.92.
the profile `headSpot` curve also pitches the chin toward the flip
direction and centers the head from t about 0.6.

## opening up and landing

between t 0.76 and 0.96 the tuck releases, knees go to -0.25, hips to rest,
shoulders to about -0.12 x and 0.35 z abduction, elbows to -0.3, spine to
0.12, ski cross fades. on touchdown a slerp of about 0.22 s takes the body
to the ground pose, and springs absorb: knees -1.8 times impact, hip drops
0.4, arms out then settle. landing quality is tilt plus 0.08 of the yaw
residual plus a velocity penalty, clean under 22 deg, sketchy under 40,
stumble under 60, crash above.

## center of mass

rotation is applied to a pivot placed at the com offset with the body
offset back by the same amount, so the model orbits its com. com height
0.76 standing, 0.36 to 0.43 tucked depending on family, plus small x and z
shifts from shoulder drop, hip set and ski cross. the fbx path measures a
mass weighted centroid of the joints with weights hip 0.26, spine 0.26,
neck 0.09, shoulders 0.035, elbows 0.022, wrists 0.012, hips 0.05, knees
0.035, ankles 0.02.

## grabs

no runtime ik. grabs are stored joint targets applied with a reach cascade,
shoulders first (blend 1.4x), elbows (1.0x), wrists last (0.7x). safety is
right hand to right ski under the boot, mute is left hand across to the
right ski, tail is right hand behind to the right tail, japan is left hand
behind the back to the left ski, truck driver is both hands. grab blend in
at 14 per second, out at 6, fading from t 0.82.

## debug overlays worth copying

`motionDebug.js` draws on the player: com ring and dot, the spin axis line
through the com colored green for vertical, cyan for 45 deg, red for
horizontal, a body up line, the `L` arrow, a translucent tilt disk
perpendicular to omega whose opacity grows with tilt, a throw direction
arrow and a world space trail of the com. `skierDebugPanel.js` reports axis
tilt as `acos(|axis.y|)` and axis drift between the live axis and the
profile axis.
