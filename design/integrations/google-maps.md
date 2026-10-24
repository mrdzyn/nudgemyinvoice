# Google Maps / Places UI Integration Profile

## When to use

Read this profile only when the product uses Google Maps Platform or the Places UI Kit.

Do not apply it to products that merely display a generic map or use a different maps provider.

## Official references

- Places UI Kit overview:
  https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview
- Owner-supplied machine-readable reference:
  https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview.md.txt

## Maturity / production-readiness gate

Google currently identifies Places UI Kit as **Experimental (pre-GA)**. Pre-GA status can mean limited support and incompatible changes.

Before production adoption:
- verify the current launch stage in the official documentation;
- confirm owner acceptance of pre-GA risk;
- document fallback/migration strategy;
- avoid making a pre-GA component an irreversible architectural dependency without an explicit decision.

Do not freeze the current maturity label forever; re-check it when the project implements or releases the integration.

## Integration principles

When using Google-provided Places UI components:

- treat Google's current API/component documentation as authoritative for supported behavior;
- preserve required attribution/branding and terms;
- do not visually restyle a vendor component beyond supported customization mechanisms;
- verify loading, empty, denied-permission, network-error, unavailable-place, and quota/error states;
- ensure keyboard, focus, touch, and screen-reader behavior remains usable;
- keep application-specific navigation, surrounding layout, and brand tokens in the project's own design system;
- document whether the product uses Google's provided UI components or a custom UI over Places data.

## Handoff requirements

A task using the Places UI Kit should state:

- Google Maps/Places product(s) in use;
- relevant API keys/configuration boundaries;
- target platforms/browsers;
- component(s) used;
- supported customization;
- attribution requirements;
- location-permission behavior;
- error/degraded-mode behavior;
- Figma/design reference if a surrounding product flow exists.

## Engineering boundary

Design guidance does not replace API security controls. Restrict API keys appropriately, avoid exposing server-only credentials, and follow the product's security/architecture documentation.
