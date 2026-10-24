# Google Workspace Add-on Integration Profile

## When to use

Read this profile only for Google Workspace add-ons or embedded experiences that must visually and behaviorally integrate with Google Workspace host applications.

## Official references

- Google Workspace add-on style guide:
  https://developers.google.com/workspace/add-ons/guides/workspace-style
- Owner-supplied machine-readable reference:
  https://developers.google.com/workspace/add-ons/guides/workspace-style.md.txt

## Integration principles

A Workspace add-on should feel coherent with its host application while retaining only the amount of product branding that the host environment supports.

For add-on UI:

- follow current Workspace add-on layout and component constraints;
- use supported host UI primitives rather than recreating arbitrary web-app patterns inside the add-on;
- keep actions concise and context-relevant;
- avoid visual treatments that make the add-on appear disconnected from the host;
- design loading, empty, error, authorization, unavailable-data, and permission states;
- account for constrained panel width and host-controlled navigation;
- ensure labels/actions remain understandable without relying only on icons or color;
- preserve the project's privacy/security requirements for Workspace data.

## Handoff requirements

A Workspace add-on task should identify:

- target host applications, such as Gmail, Calendar, Drive, Docs, Sheets, or Slides;
- card/surface and interaction flow;
- authorization/scopes required;
- data displayed or modified;
- host-triggered contextual behavior;
- error/permission states;
- applicable project Figma frames;
- any intentional deviation from Workspace style guidance.

## Engineering boundary

UI conformance does not authorize broader OAuth scopes or data access. Scope selection and Workspace data handling remain subject to the project's security, privacy, and architecture controls.
