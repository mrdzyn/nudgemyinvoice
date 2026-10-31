import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocalSpeechController,
  VOICE_LANG,
  type LocalPackAvailability,
  type LocalSpeechConstructor,
  type LocalSpeechRecognizer,
  type LocalSpeechResult,
  type VoiceState,
} from "./localSpeech.js";

class FakeSpeech implements LocalSpeechRecognizer {
  static instances: FakeSpeech[] = [];
  static pack: LocalPackAvailability = "available";
  static installationOK = true;
  static checkFails = false;
  static installs: { langs: string[]; processLocally: true }[] = [];
  static checks: { langs: string[]; processLocally: true }[] = [];

  static async available(options: { langs: string[]; processLocally: true }) {
    FakeSpeech.checks.push(options);
    if (FakeSpeech.checkFails) throw new Error("policy blocked");
    return FakeSpeech.pack;
  }

  static async install(options: { langs: string[]; processLocally: true }) {
    FakeSpeech.installs.push(options);
    if (FakeSpeech.installationOK) FakeSpeech.pack = "available";
    return FakeSpeech.installationOK;
  }

  processLocally = false;
  lang = "";
  continuous = true;
  interimResults = true;
  maxAlternatives = 2;
  onresult: ((event: { results: ArrayLike<LocalSpeechResult> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  starts = 0;
  aborted = 0;

  constructor() {
    FakeSpeech.instances.push(this);
  }

  start(): void {
    this.starts++;
    // The constructor defaults to cloud-capable recognition; it must never be started that way.
    if (this.processLocally !== true) throw new Error("Cloud recognition attempted");
  }
  abort(): void {
    this.aborted++;
  }
  final(transcript: string): void {
    this.onresult?.({
      results: [{ isFinal: true, 0: { transcript } }],
    });
  }
}

function harness(getCtor: () => LocalSpeechConstructor | null = () => FakeSpeech) {
  const states: VoiceState[] = [];
  const transcripts: string[] = [];
  const controller = new LocalSpeechController(
    getCtor,
    (state) => states.push(state),
    (text) => transcripts.push(text),
  );
  return { controller, states, transcripts };
}

beforeEach(() => {
  FakeSpeech.instances.length = 0;
  FakeSpeech.pack = "available";
  FakeSpeech.installationOK = true;
  FakeSpeech.checkFails = false;
  FakeSpeech.installs.length = 0;
  FakeSpeech.checks.length = 0;
});

describe("V1 local-only speech recognition", () => {
  it("checks the local English model without starting a microphone and accepts only final transcripts", async () => {
    const { controller, transcripts } = harness();
    await controller.check();
    expect(controller.getSnapshot().kind).toBe("ready");
    expect(FakeSpeech.checks).toEqual([{ langs: [VOICE_LANG], processLocally: true }]);
    expect(FakeSpeech.instances.every((item) => item.starts === 0)).toBe(true);

    controller.start();
    const instance = FakeSpeech.instances.find((item) => item.starts === 1)!;
    expect(instance.processLocally).toBe(true);
    expect(instance.lang).toBe("en-US");
    expect(instance.interimResults).toBe(false);
    expect(instance.continuous).toBe(false);
    expect(controller.getSnapshot().kind).toBe("listening");
    instance.onresult?.({ results: [{ isFinal: false, 0: { transcript: "interim" } }] });
    expect(transcripts).toEqual([]);
    instance.final("  Remind me to follow up with Northwind tomorrow at 9 AM  ");
    instance.final("duplicate");
    expect(transcripts).toEqual(["Remind me to follow up with Northwind tomorrow at 9 AM"]);
    // A final transcript has no authority to call Ask or Save: no action callbacks are provided.
    controller.stop();
    expect(instance.aborted).toBe(1);
    expect(controller.getSnapshot().kind).toBe("ready");
  });

  it("never starts listening during local pack installation; requires a second Start gesture", async () => {
    FakeSpeech.pack = "downloadable";
    const { controller } = harness();
    await controller.check();
    expect(controller.getSnapshot().kind).toBe("downloadable");
    controller.start();
    expect(FakeSpeech.instances.every((i) => i.starts === 0)).toBe(true);
    await controller.install();
    expect(FakeSpeech.installs).toEqual([{ langs: ["en-US"], processLocally: true }]);
    expect(controller.getSnapshot().kind).toBe("ready");
    expect(FakeSpeech.instances.every((i) => i.starts === 0)).toBe(true);
    controller.start();
    expect(FakeSpeech.instances.filter((i) => i.starts === 1)).toHaveLength(1);
    controller.dispose();
  });

  it("does not invoke a local microphone when APIs, pack or policy cannot prove on-device processing", async () => {
    const missing = harness(() => null);
    await missing.controller.check();
    expect(missing.controller.getSnapshot().kind).toBe("unsupported");
    missing.controller.start();
    expect(FakeSpeech.instances).toHaveLength(0);

    FakeSpeech.pack = "unavailable";
    const unavailable = harness();
    await unavailable.controller.check();
    expect(unavailable.controller.getSnapshot().kind).toBe("unavailable");
    unavailable.controller.start();
    expect(FakeSpeech.instances.every((i) => i.starts === 0)).toBe(true);

    FakeSpeech.checkFails = true;
    const blocked = harness();
    await blocked.controller.check();
    expect(blocked.controller.getSnapshot().kind).toBe("unavailable");
    blocked.controller.start();
    expect(FakeSpeech.instances.every((i) => i.starts === 0)).toBe(true);
  });

  it("does not start after a failed local model installation", async () => {
    FakeSpeech.pack = "downloadable";
    FakeSpeech.installationOK = false;
    const { controller } = harness();
    await controller.check();
    await controller.install();
    expect(controller.getSnapshot().kind).toBe("error");
    controller.start();
    expect(FakeSpeech.instances.every((i) => i.starts === 0)).toBe(true);
  });

  it("aborts on Stop/dispose, ignoring callbacks already queued or arriving after sign-out", async () => {
    const { controller, transcripts } = harness();
    await controller.check();
    controller.start();
    const active = FakeSpeech.instances.find((i) => i.starts === 1)!;
    const late = active.onresult;
    controller.stop();
    late?.({ results: [{ isFinal: true, 0: { transcript: "should not appear" } }] });
    expect(transcripts).toEqual([]);
    controller.start();
    const second = FakeSpeech.instances.filter((i) => i.starts === 1).at(-1)!;
    const lateSignout = second.onresult;
    controller.dispose();
    lateSignout?.({ results: [{ isFinal: true, 0: { transcript: "after signout" } }] });
    expect(transcripts).toEqual([]);
    expect(second.aborted).toBe(1);
    controller.start();
    expect(FakeSpeech.instances.filter((i) => i.starts === 1)).toHaveLength(2);
  });

  it("shows a recoverable typed-input error for microphone denial with no cloud fallback", async () => {
    const { controller, transcripts } = harness();
    await controller.check();
    controller.start();
    const active = FakeSpeech.instances.find((i) => i.starts === 1)!;
    active.onerror?.({ error: "not-allowed" });
    expect(controller.getSnapshot()).toMatchObject({ kind: "error" });
    expect(controller.getSnapshot().message).toMatch(/denied/i);
    expect(active.aborted).toBe(1);
    expect(transcripts).toEqual([]);
    controller.start();
    expect(FakeSpeech.instances.filter((i) => i.starts === 1)).toHaveLength(1);
  });

  it("requires processLocally to read back true before calling start, even if a browser ignores the assignment", async () => {
    class LyingSpeech extends FakeSpeech {
      constructor() {
        super();
        Object.defineProperty(this, "processLocally", {
          configurable: true,
          get: () => false,
          set: () => undefined,
        });
      }
    }
    // Explicitly test unsupported browser behavior without attempting a cloud-capable start.
    const { controller } = harness(() => LyingSpeech);
    await controller.check();
    controller.start();
    expect(controller.getSnapshot().kind).toBe("unsupported");
    expect(FakeSpeech.instances.every((i) => i.starts === 0)).toBe(true);
  });

  it("ignores stale availability/install promises after unmount or superseding checks", async () => {
    let complete!: (result: LocalPackAvailability) => void;
    class DelayedSpeech extends FakeSpeech {
      static override async available(options: { langs: string[]; processLocally: true }) {
        FakeSpeech.checks.push(options);
        return new Promise<LocalPackAvailability>((resolve) => { complete = resolve; });
      }
    }
    const { controller, states } = harness(() => DelayedSpeech);
    const pending = controller.check();
    controller.dispose();
    complete("available");
    await pending;
    expect(states.some((s) => s.kind === "ready")).toBe(false);
  });
});
