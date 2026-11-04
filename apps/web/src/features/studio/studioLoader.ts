/** The single dynamic import of the licensed Studio widgets; reachable only from the dev-gated StudioPanel. */
export type StudioModule = typeof import("./StudioCharts.js");
export const loadStudioModule = (): Promise<StudioModule> => import("./StudioCharts.js");
