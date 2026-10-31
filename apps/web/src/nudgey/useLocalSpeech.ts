import { useEffect, useRef, useState } from "react";
import {
  LocalSpeechController,
  browserLocalSpeechConstructor,
  type VoiceState,
} from "./localSpeech.js";

/** Browser-only progressive enhancement. The Ask text field remains the source of truth. */
export function useLocalSpeech(onFinal: (text: string) => void) {
  const [state, setState] = useState<VoiceState>({
    kind: "checking",
    message: "Checking local voice support…",
  });
  const controller = useRef<LocalSpeechController | null>(null);
  const latestOnFinal = useRef(onFinal);
  latestOnFinal.current = onFinal;

  useEffect(() => {
    const speech = new LocalSpeechController(
      browserLocalSpeechConstructor,
      setState,
      (transcript) => latestOnFinal.current(transcript),
    );
    controller.current = speech;
    void speech.check();
    return () => {
      speech.dispose();
      if (controller.current === speech) controller.current = null;
    };
  }, []);

  return {
    state,
    start: () => controller.current?.start(),
    stop: () => controller.current?.stop(),
    install: () => void controller.current?.install(),
    check: () => void controller.current?.check(),
  };
}
