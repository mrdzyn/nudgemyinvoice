/**
 * NMI-NDG-02 V1: fail-closed, local-only browser speech recognition.
 * No microphone or network access is performed by this module except native SpeechRecognition.
 * Cloud-capable default recognition is NEVER started.
 */
export const VOICE_LANG = "en-US";
export const LOCAL_OPTIONS = { langs: [VOICE_LANG], processLocally: true } as const;

export type LocalPackAvailability = "available" | "downloadable" | "downloading" | "unavailable";

export interface LocalSpeechResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

export interface LocalSpeechRecognizer {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<LocalSpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

export interface LocalSpeechConstructor {
  new (): LocalSpeechRecognizer;
  available(options: { langs: string[]; processLocally: true }): Promise<LocalPackAvailability>;
  install(options: { langs: string[]; processLocally: true }): Promise<boolean>;
}

export type VoiceState =
  | { kind: "checking"; message: string }
  | { kind: "ready"; message: string }
  | { kind: "listening"; message: string }
  | { kind: "downloadable"; message: string }
  | { kind: "downloading"; message: string }
  | { kind: "unsupported"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

const READY: VoiceState = {
  kind: "ready",
  message: "English (en-US) is ready for on-device recognition. Tap Speak to begin.",
};
const UNSUPPORTED: VoiceState = {
  kind: "unsupported",
  message: "On-device voice recognition is not supported here. You can still type.",
};

export class LocalSpeechController {
  private state: VoiceState = { kind: "checking", message: "Checking local voice support…" };
  private current: LocalSpeechRecognizer | null = null;
  private generation = 0;
  private disposed = false;

  constructor(
    private readonly getConstructor: () => LocalSpeechConstructor | null,
    private readonly onState: (state: VoiceState) => void,
    private readonly onFinal: (transcript: string) => void,
  ) {}

  getSnapshot(): VoiceState {
    return this.state;
  }

  private set(next: VoiceState): void {
    if (this.disposed) return;
    this.state = next;
    this.onState(next);
  }

  private constructorIfLocal(): LocalSpeechConstructor | null {
    try {
      const Ctor = this.getConstructor();
      if (!Ctor || typeof Ctor.available !== "function" || typeof Ctor.install !== "function")
        return null;
      const probe = new Ctor();
      return "processLocally" in probe &&
        typeof probe.start === "function" &&
        typeof probe.abort === "function"
        ? Ctor
        : null;
    } catch {
      return null;
    }
  }

  async check(): Promise<void> {
    if (this.disposed) return;
    const token = ++this.generation;
    const Ctor = this.constructorIfLocal();
    if (!Ctor) {
      this.set(UNSUPPORTED);
      return;
    }
    this.set({ kind: "checking", message: "Checking installed on-device English model…" });
    try {
      const status = await Ctor.available({ langs: [VOICE_LANG], processLocally: true });
      if (this.disposed || token !== this.generation) return;
      switch (status) {
        case "available":
          this.set(READY);
          break;
        case "downloadable":
          this.set({
            kind: "downloadable",
            message:
              "English (en-US) needs a one-time language-pack download. No microphone will start.",
          });
          break;
        case "downloading":
          this.set({
            kind: "downloading",
            message:
              "The English on-device language pack is downloading. Check again when complete.",
          });
          break;
        default:
          this.set({
            kind: "unavailable",
            message: "A local English speech model is unavailable. Type your request instead.",
          });
      }
    } catch {
      this.set({
        kind: "unavailable",
        message:
          "Chrome could not verify local recognition (possibly blocked by browser policy). Type instead.",
      });
    }
  }

  /** Explicit user action only. Installs a language pack; never starts the microphone. */
  async install(): Promise<void> {
    if (this.disposed || this.state.kind !== "downloadable") return;
    const Ctor = this.constructorIfLocal();
    if (!Ctor) {
      this.set(UNSUPPORTED);
      return;
    }
    const token = ++this.generation;
    this.set({
      kind: "downloading",
      message: "Installing the English on-device model. Listening has not started.",
    });
    try {
      const installed = await Ctor.install({ langs: [VOICE_LANG], processLocally: true });
      if (this.disposed || token !== this.generation) return;
      if (!installed) {
        this.set({
          kind: "error",
          message: "The local model could not be installed. Type instead.",
        });
        return;
      }
      await this.check();
    } catch {
      if (this.disposed || token !== this.generation) return;
      this.set({
        kind: "error",
        message: "Local model installation was blocked or failed. Type instead.",
      });
    }
  }

  /** Must be called directly by a user click while the locally installed model is confirmed ready. */
  start(): void {
    if (this.disposed || this.state.kind !== "ready") return;
    const Ctor = this.constructorIfLocal();
    if (!Ctor) {
      this.set(UNSUPPORTED);
      return;
    }
    let recognition: LocalSpeechRecognizer;
    try {
      recognition = new Ctor();
      // Critical: default recognition is potentially CLOUD-backed. Never start it.
      if (!("processLocally" in recognition)) {
        this.set(UNSUPPORTED);
        return;
      }
      recognition.processLocally = true;
      if (recognition.processLocally !== true) {
        this.set(UNSUPPORTED);
        return;
      }
      recognition.lang = VOICE_LANG;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
    } catch {
      this.set({ kind: "error", message: "Could not initialize local recognition. Type instead." });
      return;
    }

    const token = ++this.generation;
    let delivered = false;
    const active = () =>
      !this.disposed && token === this.generation && this.current === recognition;
    recognition.onresult = (event) => {
      if (!active() || delivered) return;
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.isFinal ? result[0]?.transcript?.trim() : undefined;
        if (!transcript) continue;
        delivered = true;
        this.onFinal(transcript);
        break;
      }
    };
    recognition.onerror = (event) => {
      if (!active()) return;
      this.release();
      const message =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access or local speech was denied. You can type instead."
          : event.error === "language-not-supported"
            ? "Local English recognition is no longer installed. Check the model again."
            : event.error === "no-speech"
              ? "No speech detected. Tap Speak to try again."
              : "On-device recognition stopped. You can type or try again.";
      this.set({ kind: "error", message });
    };
    recognition.onend = () => {
      if (!active()) return;
      this.release();
      this.set(READY);
    };
    this.current = recognition;
    try {
      recognition.start();
      this.set({ kind: "listening", message: "Listening locally. Tap Stop to cancel." });
    } catch {
      this.release();
      this.set({ kind: "error", message: "Could not start on-device speech. Type instead." });
    }
  }

  private release(): void {
    ++this.generation;
    const active = this.current;
    this.current = null;
    if (!active) return;
    active.onresult = null;
    active.onerror = null;
    active.onend = null;
    try {
      active.abort();
    } catch {
      // Microphone was already released; never retry with a cloud path.
    }
  }

  /** Stop/Back/Close/Escape/sign-out: discard unfinished recognition, not already edited text. */
  stop(): void {
    if (this.disposed) return;
    this.release();
    this.set(READY);
  }

  dispose(): void {
    this.release();
    this.disposed = true;
  }
}

/** Deliberately ignore prefixed Web Speech APIs: their local-only guarantees are not verified. */
export function browserLocalSpeechConstructor(): LocalSpeechConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate: unknown = (window as unknown as { SpeechRecognition?: unknown })
    .SpeechRecognition;
  return typeof candidate === "function" ? (candidate as LocalSpeechConstructor) : null;
}
