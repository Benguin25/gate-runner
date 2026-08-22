# Gate Runner

Casual crowd-multiplier runner for mobile. Full design is in SPEC.md. Read it before any task.

## Current phase
Android-first, testing in Expo Go on a physical Samsung. No iOS builds, no ads, no IAP, no native-only modules yet.

Do NOT install react-native-mmkv, react-native-google-mobile-ads, react-native-purchases, @sentry/react-native, or posthog-react-native until told to. Use @react-native-async-storage/async-storage for persistence for now.

## Stack
- Expo SDK latest stable, TypeScript strict mode, Expo Router
- @shopify/react-native-skia for rendering
- react-native-reanimated for the game loop (useFrameCallback)
- zustand for state, persisted via AsyncStorage
- expo-haptics, expo-av

## Rules
- The crowd count is an integer and is the single source of truth. Rendered units are visual only and interpolate toward formation slots. Never simulate real individual units.
- Fixed 60hz update step, interpolated render. The loop lives in /src/engine/GameCanvas.tsx and exposes onUpdate(dt) and onRender.
- All tunables (gate spacing, operator ranges, boss numbers, upgrade costs, speeds) live in /src/game/config.ts. No magic numbers in gameplay code.
- Levels are generated deterministically from a seed in /src/game/levels.ts.
- Run `npx tsc --noEmit` before finishing any task. Zero errors.
- Add dependencies with `npx expo install <pkg>`, never plain npm install. Run `npx expo-doctor` after adding anything.
- Only build what the current milestone asks for. If something else seems needed, ask first.
- Procedural Skia shapes only. No image assets.

## Folder layout
- /app — Expo Router routes
- /src/engine — game loop, timing, spatial helpers
- /src/game — game logic, config, level generation
- /src/render — Skia components
- /src/store — zustand stores
- /src/ui — menus, HUD, buttons
- /scripts — headless bot, tooling

## Milestones (one per session)
1. Scaffold + GameCanvas + bouncing circle on device + bot stub
2. Lane + crowd blob + drag steering + one gate pair
3. Operators + enemy clumps + boss
4. Level generator + 30 levels + endless
5. Shop (3 upgrades) + persistence
6. Juice pass
7. Ads + IAP + iOS (later, separate instructions)