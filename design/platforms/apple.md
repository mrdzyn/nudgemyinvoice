# Apple Platform Design Profile

## Scope

Use this profile for Apple-platform products including iOS, iPadOS, macOS, and other Apple platforms as applicable.

## Official design foundation

Use the current official Apple resources rather than copying a frozen UI kit into this repository:

- Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Design Resources: https://developer.apple.com/design/resources/
- Official Apple UI kits through Figma's supported UI-kit/library workflow.
- SF Symbols for platform-consistent iconography where appropriate.

Vendor resources may have separate license terms. Reference/enable them through the official channel rather than redistributing them in this repository.

## Default approach

Prefer native platform conventions for:

- navigation;
- tab structures;
- sheets and dialogs;
- menus/context menus;
- text input;
- pickers and selectors;
- alerts;
- destructive actions;
- system permissions;
- search;
- platform gestures;
- keyboard behavior;
- safe areas.

Brand the experience primarily through semantic color, typography choices allowed by the platform, imagery, content, motion, and product-specific components.

## Required design considerations

### Layout
- respect safe areas;
- adapt across supported device classes;
- account for orientation where supported;
- design for keyboard/input presentation;
- avoid fixed layouts that break at larger text sizes.

### Typography
- prefer semantic platform text styles where practical;
- support Dynamic Type/text scaling;
- test long/localized text;
- avoid encoding hierarchy only through font size.

### Iconography
- prefer SF Symbols where the symbol semantics fit;
- use consistent rendering mode/weight;
- provide custom icons only when needed for product-specific concepts.

### Appearance
- define light/dark behavior when the product supports both;
- use semantic colors rather than hard-coded appearance-specific colors;
- account for increased contrast and accessibility settings.

### Interaction
- preserve familiar Apple gestures and control behavior;
- avoid custom gestures without discoverability or fallback;
- use haptics deliberately rather than decoratively.

## Required states

For key screens consider:
- loading;
- empty;
- error;
- offline;
- permission denied;
- destructive confirmation;
- disabled;
- large-text layout;
- dark appearance.

## Figma

Convenience reference supplied by the project owner:
- iOS and iPadOS 27 community Figma reference: https://www.figma.com/design/qJPYTfp23vwgel0TOt7pfB/iOS-and-iPadOS-27--Community-?node-id=221-56229&t=PsolzLDOkOTNK013-1

Treat Apple Human Interface Guidelines and Apple Design Resources as authoritative. Community Figma files are convenience references only and must not override current Apple guidance or approved product behavior. See `design/resources/DESIGN-RESOURCE-CATALOG.md`.

Enable the current official Apple UI kit for the target platform in the product's Figma file. Use it as a platform reference and foundation, not as a requirement to make every screen look like a system app.

## Implementation handoff

A UI task targeting Apple should state:
- minimum supported OS/version;
- supported devices/form factors;
- navigation model;
- appearance support;
- accessibility/text-scaling expectations;
- use of native vs custom components;
- required permission/system flows;
- Figma frames or prototypes where applicable.
