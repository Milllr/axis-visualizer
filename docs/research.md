# research notes

notes gathered while rebuilding the trick model. two sources: the snowbox
trick physics (see `docs/snowbox-model.md`) and the biomechanics below.

## google cloud x team usa

source: cloud.google.com/blog/products/ai-machine-learning/measure-physics-of-freestyle-snowboarding-and-skiing
and sports.withgoogle.com/teamusa

- 3d skeleton per frame from monocular video (deepmind pose model, 63 joints)
- a rigid **body frame** is built from the spine axis and the shoulder axis,
  third axis orthogonal. orientation is stored as a quaternion.
- **rotational degrees**: sum of the relative rotation between consecutive
  frames. `q_rel = q(i+1) * inverse(q(i))`, `alpha_i = 2 * acos(|w|)`,
  `total = sum(alpha_i)`. this is the true path length through orientation
  space, not the trick name.
- **axis tilt**: angle between the instantaneous body frame rotation axis and
  world vertical, weighted by rotation speed so the fast middle of the trick
  dominates.
- **cork ribbon**: the instantaneous rotation axis traced through the trick,
  drawn as a ribbon so you see the shape of the cork.
- finding (merz et al 2024, sports biomechanics): corked tricks with the axis
  45 to 60 deg from vertical need fewer physical degrees than the name says.
  corks median shortcut 25 deg, flatspins median detour 21 deg. shaun white
  cab double cork 1440 measured 1122 deg, a 318 deg gap.
- the tool also reports peak rotational velocity, air time, tuck compression,
  cork angle. coaches use the skeleton to see "where they're leaning too much
  on one side" and "as they're using the shoulders for rotation".

## rigid body physics of twisting rotations

sources: yeadon, the biomechanics of twisting somersaults parts 1 to 4,
journal of sports sciences 1993. dullin and tong, twisting somersault,
arxiv 1510.08046.

- once airborne the angular momentum vector `L` is fixed in the world. only
  shape changes move the body relative to `L`.
- for a body that is roughly symmetric about its long axis, with transverse
  inertia `It` and longitudinal inertia `Il` (`Il` much smaller), and angle
  `a` between `L` and the long axis:
  - precession of the long axis around `L`: `phi_dot = L / It`
  - twist about the long axis: `psi_dot = L * cos(a) * (1/Il - 1/It)`
  - twists per precession: `cos(a) * (It/Il - 1)`
- yeadon measures tilt `theta` from the plane perpendicular to `L`, so
  `theta = 90 - a`. twist per somersault is `sin(theta) * (It/Il - 1)`.
- inertia ratio `It/Il` is about 16 with arms at the sides and 20 with one
  arm overhead. tucking drops `It` a lot (layout to tuck is roughly 3x), so
  both rates rise while tucked and fall when the athlete opens up.
- **contact twist**: tilt and twist created while still on the ground by
  asymmetric shoulder and arm action at takeoff. this is the skier's set.
- **aerial twist**: an asymmetric arm swing in the air shifts the long axis
  away from the plane perpendicular to `L`, starting twist. the reverse swing
  removes the tilt and stops it. this is how a skier cleans up a cork before
  landing.
- **wobble vs twist modes**: piking or opening the hips moves the body from the
  twisting mode to the wobbling mode, which also stops the twist.

## mapping to freeski trick families

the tilt of `L` from vertical is what freeskiers call the axis. the cone the
spine sweeps around `L` is what makes the head dip.

- **spin**: `L` vertical, long axis along `L`, no dip.
- **cork**: `L` tilted back over the tails. the skier leaves the lip leaning
  back and the head dips behind and below the shoulders once per precession.
  feet never pass over the head. cork 720 is one dip and two headings.
- **bio**: same geometry with `L` tilted forward. the lead shoulder dips
  toward the landing. feet stay off to the side.
- **rodeo**: backflip family. `L` tilted far enough back that the dip passes
  through inverted. thrown over one shoulder, rodeo 540 lands switch.
- **misty**: frontflip family. thrown forward over a dropped shoulder, reaches
  a sideways backdrop at halfway, misty 540 lands switch.
- **flatspin**: `L` near horizontal and the body stays flat, like a spinning
  cartwheel with the chest facing the sky at the apex.
- **d spin**: inverted cork thrown backward and sideways, between cork and
  rodeo in tilt.
- **lincoln loop**: cartwheel about the direction of travel.

## the set

the set is the moment of takeoff where all of `L` is created. what a coach
sees:

1. approach compressed, arms slightly behind, shoulders wound against the
   spin direction.
2. pop at the lip: legs extend, hips drive up and, for a cork, back.
3. shoulders and arms swing in the spin direction while the head turns to look
   over the lead shoulder. this is the throw and it fixes the yaw part of `L`.
4. the lean at the lip fixes the flip part of `L`. lean back for cork and
   rodeo, lean forward and drop a shoulder for bio and misty.
5. the skier leaves the lip already leaning with `L` set. nothing after this
   changes `L`.

## spotting and opening up

1. the head leads. during the rotation it counter rotates against the spin
   then snaps forward to find the landing, at most about 65 deg of neck yaw.
2. once the landing is spotted the arms come out of the grab and extend, the
   knees open, so inertia rises and the rotation slows.
3. an asymmetric arm action removes the cork tilt so the spine returns toward
   vertical and the skis come back under the hips.
4. absorb on impact, arms forward for balance.
