# Android Design Profile

## Scope

Use this profile for Android products.

## Official design foundation

Use the current Material Design guidance and official Google/Figma resources where applicable:

- Material Design: https://m3.material.io/
- Android design guidance: https://developer.android.com/design

Prefer official libraries/resources over copied snapshots committed into this repository.

Convenience Figma reference supplied by the project owner:
- Material Design UI Kit: https://www.figma.com/design/SXmYqMxHv36eSjnDNHWatA/Material-Design-UI-Kit?node-id=0-1&t=02llKDGlyHSBDdcH-1

Treat current Material/Android documentation as authoritative and validate the Figma resource's freshness before relying on it. See `design/resources/DESIGN-RESOURCE-CATALOG.md`.

## Default approach

Use Material/platform conventions for:
- navigation;
- app bars;
- sheets/dialogs;
- menus;
- text fields;
- selection controls;
- snackbars/feedback;
- permissions;
- back navigation;
- edge-to-edge layout.

## Required design considerations

- support multiple screen sizes and density classes;
- design for edge-to-edge layouts and system insets;
- support system font scaling;
- define light/dark behavior where applicable;
- use semantic colors;
- use Material Symbols or approved product icons consistently;
- preserve predictable Android back behavior;
- validate accessibility with TalkBack for critical journeys.

## Dynamic color

Dynamic color may be adopted when it fits the product brand. Do not enable it automatically if it undermines required brand or contrast behavior.

## Required states

Design relevant:
- loading;
- empty;
- error;
- offline;
- permission denied;
- disabled;
- destructive confirmation;
- large-text layout;
- dark appearance.

## Release-signing handoff

Android UI guidance and Android release signing are separate concerns. For any Flutter, React Native, or native Android/Kotlin project that builds production Android artifacts, also follow `release/android-signing.md`.

Do not infer that a successful debug build proves release signing is configured.

## Implementation handoff

State:
- minimum Android/API target assumptions;
- supported form factors;
- Material/native vs custom component choices;
- navigation/back behavior;
- theme/dynamic color policy;
- accessibility requirements;
- Figma/design references.
