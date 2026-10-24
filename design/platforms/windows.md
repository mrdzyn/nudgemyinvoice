# Windows Platform Design Profile

Use this profile for Windows desktop products regardless of whether the implementation uses WinUI 3, WPF, WinForms, Flutter, Electron, Qt, or another supported desktop stack.

The goal is **Windows-native behavior and accessibility**, not mandatory use of a specific UI framework.

## Official references

- Windows design overview: https://learn.microsoft.com/en-us/windows/apps/design/
- Windows design resources/downloads: https://learn.microsoft.com/en-us/windows/apps/design/downloads/
- Windows design guidelines: https://learn.microsoft.com/en-us/windows/apps/design/guidelines-overview
- Windows App SDK: https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/
- Modern WinUI 3 app structure: https://learn.microsoft.com/en-us/windows/apps/develop/ui/windows-app-sdk-app-structure
- Windows accessibility: https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessibility
- Windowing: https://learn.microsoft.com/en-us/windows/apps/develop/ui/windowing-overview
- Title bar guidance: https://learn.microsoft.com/en-us/windows/apps/design/basics/titlebar-design
- NavigationView guidance: https://learn.microsoft.com/en-us/windows/apps/design/controls/navigationview

Treat WinUI 3 / Windows App SDK as the native reference behavior for new Windows desktop experiences, not as a mandatory dependency for cross-platform projects.

## Design-kit references

Use the Microsoft Windows design downloads page as the preferred discovery point for current Windows design kits and store-asset guidance.

Owner-supplied Figma convenience references:
- Microsoft Store Asset Guidance: https://www.figma.com/design/0AFpAFi6Kk1QfqccdKKxh5/Microsoft-Store-Asset-Guidance--Community-?node-id=1-5&t=PhhH8kdOflAUvnvR-1
- Windows UI kit: https://www.figma.com/design/P97PJm1e1kF25j18oRQPyE/Windows-UI-kit--Community-?node-id=2434-129659&t=QGGyms1W74pbFgj4-1

Because these are Figma Community URLs, verify their current publisher/status against Microsoft's official design resources before treating them as authoritative. See `design/resources/DESIGN-RESOURCE-CATALOG.md`.

## Experience contract

Windows UI work should deliberately consider:

- resizable windows and meaningful minimum sizes;
- minimize, maximize/restore, close, Snap layouts, and multi-monitor use;
- standard title-bar behavior, drag regions, caption controls, and system window menu;
- mouse, keyboard, touch, trackpad, and focus behavior;
- keyboard shortcuts and keyboard-only operation;
- context menus, command surfaces, tooltips, and pointer hover states;
- adaptive desktop navigation and information density;
- light, dark, high-contrast, system accent, and text/display scaling;
- Fluent materials such as Mica/Acrylic only where they improve hierarchy and remain accessible;
- Windows notifications, taskbar/system-tray behavior, file pickers, permissions, protocol/file activation, and restore-state behavior when relevant;
- screen-reader/UI Automation semantics and Narrator;
- reduced-motion and non-color-only communication.

## Windowing and title bars

Prefer standard Windows window behavior. Customize chrome only when product value justifies it.

A custom title bar must preserve:
- draggable regions;
- minimize/maximize/restore/close behavior;
- system caption-button expectations;
- right-click/system-window-menu behavior;
- active/inactive state;
- high-contrast and theme behavior;
- text scaling;
- keyboard accessibility.

Test narrow, normal, maximized, snapped, and multi-monitor layouts where the product supports them.

## Navigation and commands

Use Windows/Fluent conventions as the reference for navigation, command bars, menus, dialogs, InfoBars, settings, and contextual actions. Do not mechanically copy mobile navigation into desktop windows.

## Desktop-specific product states

In addition to the shared component catalog, consider:
- first launch / model or asset preparation;
- minimized/background/tray state;
- offline/degraded capability;
- microphone/camera/device permission state;
- unavailable hardware capability;
- update available / restart required;
- secondary-window state;
- interrupted operation / app restoration.

## Accessibility validation

Validate:
- Narrator or equivalent UI Automation exposure;
- keyboard-only navigation;
- visible focus;
- high contrast;
- text and display scaling;
- semantic names/roles/states;
- sufficient target sizes;
- no critical information conveyed by color alone.

## Framework rule

Project-specific implementation docs may map these expectations to Flutter, WinUI, WPF, Electron, or another framework. The master template does not require a Windows framework.

**Principle:** use the platform as the behavioral reference even when the implementation is cross-platform.
