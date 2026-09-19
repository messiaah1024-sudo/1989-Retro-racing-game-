# NIGHTSHIFT '89

A browser-based, 1989-inspired arcade racer built with React, TypeScript, Vite, Tailwind CSS, and Framer Motion. The pseudo-3D racing engine uses Canvas 2D; optional engine sounds are synthesized with Web Audio.

## Play

- Press Enter or select **Start Your Engine**.
- Hold **Up / W** to accelerate and **Down / S** to brake.
- Use **Left / Right** or **A / D** to steer.
- Hold **Shift / Space** for rechargeable nitro.
- Press **Esc / P** to pause or resume.
- Touch controls appear on phones and other touch devices.

Finish ten laps before time runs out. Avoid traffic and stay on the road. The garage offers three cars with different performance characteristics and five paint finishes. The four circuits have distinct scenery, lengths, and curves — including the cactus-strewn neon desert of Mojave Starlight.

Settings include audio, a mellow synthesized relax-music loop, CRT scanlines, auto-acceleration, driver name, and three difficulty levels. Completed runs are saved to this browser's local storage. Built-in leaderboard entries are explicitly marked as house records, not online players.

## Development

- `npm run dev` starts the Vite development server.
- `npm run build` produces the production application in `dist/`.

## Main Files

- `src/App.tsx`: navigation, garage, tracks, leaderboard, settings, and persistence.
- `src/components/RaceGame.tsx`: game UI, keyboard/touch input, and fullscreen behavior.
- `src/game/engine.ts`: simulation, projection, traffic, collisions, and rendering.
- `src/game/sprites.ts`: original procedural pixel-car and roadside sprites.
- `src/game/audio.ts`: optional synthesized engine and arcade effects.
- `public/images/`: three original pixel-art environments.

No backend, API keys, accounts, or downloads are required. Google Fonts requires a network connection; system fonts are used as a fallback.