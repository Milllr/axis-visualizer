# axis visualizer

a 3D interactive tool for visualizing freestyle skiing trick rotations. i built this to help explain how off-axis tricks actually work, what makes a cork different from a rodeo, why a bio isn't just a "forward cork," etc.

renders an animated stick figure skier with color-coded rotation axes so you can see how each trick's axis is tilted relative to the body.

## tricks

**on-axis:** spin, frontflip, backflip, lincoln loop

**off-axis (backward tilt):** cork (~22°), rodeo (~55°), d-spin (~75°)

**off-axis (forward tilt):** bio (~22°), misty (~55°), flatspin (~75°)

## features

- multi-panel view, compare up to 4 tricks side by side
- playback controls with adjustable speed (0.25x to 2x)
- ghost trail toggle to see the full rotation path
- switch stance support
- color-coded axis arrows per trick

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
