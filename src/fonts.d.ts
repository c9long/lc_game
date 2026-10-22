// Fontsource subpaths (e.g. '@fontsource/atkinson-hyperlegible/400') are stylesheets with no types.
// Kept out of app.d.ts: there, `export {}` makes these augmentations instead of ambient modules.
declare module '@fontsource/*';
declare module '@fontsource-variable/*';
