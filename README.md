# Rubik Lab

A playable 3D Rubik's Cube in the browser.

Live: https://larry1337cat.github.io/rubik-cube/

![Preview](preview.png)

## Stack

- React + TypeScript + Vite
- Three.js via `@react-three/fiber` and `@react-three/drei`
- Zustand for state

## Features

- 3D cube with rounded cubies and stickers, soft studio lighting
- Turn faces via on-screen buttons or keyboard shortcuts
- Auto device detection: layout and tap-target size adapt for desktop vs. touch
- Collapsible control panel on desktop, positioned to the side so it doesn't cover the cube
- Timer, move counter, and undo
- Confetti + toast when the cube is solved
- Turn/solved sound effects.


## Project structure

- `src/cube/` - pure cube logic (cubie positions, move table, scramble, solved check). No rendering or React dependency.
- `src/store/` - Zustand store: current cube state, move queue/animation, history.
- `src/three/` - 3D rendering (scene, lighting, cube/cubie meshes).
- `src/ui/` - 2D overlay UI (controls, timer, solved celebration).
- `src/config/keybindings.ts` - keyboard shortcut mapping, edit this to change keys.
- `src/audio/` - sound playback.


## Known limitations

- No persistence: refreshing the page resets the cube to solved state. State is kept in memory only.
- No drag-to-turn on the cube itself — turning is done via buttons/keyboard only.
- No general solver: this project does not solve an arbitrary cube state.

## Deployment

Deploys automatically to GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`.

## License

MIT — see [LICENSE.md](./LICENSE.md).
