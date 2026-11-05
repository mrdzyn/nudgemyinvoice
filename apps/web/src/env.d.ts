/**
 * P5 build variant, defined ONLY by vite.config.ts from the build-time NMI_WEB_STUDIO setting. Undefined in tests
 * and tools that do not load that config, which therefore behave as the Community build. Read it via
 * `studioLicensedBuild` (StudioSlot.tsx), never directly.
 */
declare const __NMI_STUDIO_LICENSED__: boolean | undefined;
