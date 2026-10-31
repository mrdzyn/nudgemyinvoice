# NMI-NDG-02 V1 — Optional on-device voice transcription

**State:** V1 implementation and remediation are on the separate Draft PR from owner-approved C2 main. Exact-HEAD independent audit and physical Chrome mic QA remain pending.
**Prerequisite:** SATISFIED. C2 independently audited and owner squash-merged PR #29 into `main` at `139cdea0b14524ac3997c54f7cb4d9a6d9fe11e0`.  
**Authority:** Owner decision recorded in PR #29 and `tasks/NMI-NDG-02-C2-natural-language-followup.md`.

## Objective

Offer optional voice entry beside the existing Ask Nudgey text field, using **on-device-only** speech transcription when the browser can prove local processing is supported and a local language pack is ready. Transcription fills the same editable text field. The operator must still choose **Ask** to submit; the transcript must never auto-submit, create a follow-up, or trigger scheduling.

Typed Ask Nudgey remains available on every browser. Unsupported or unverified speech recognition leaves the microphone disabled with a short explanation. There is no cloud speech recognition path or fallback.

## In-scope behavior

- Add one microphone control to the existing authenticated Ask Nudgey view; do not change the C2 command grammar, invoice lookup, scheduler, or save boundary.
- Feature-detect the browser's `SpeechRecognition` interface and the required local-processing APIs. At minimum, require `processLocally`, `available()`, `install()`, and a supported target language. Verify current browser compatibility when implementation begins because the API remains experimental and browser support changes.
- Before starting recognition, set `recognition.processLocally = true`; check `SpeechRecognition.available({ langs, processLocally: true })`. Never set `processLocally` to false. Never call `start()` after an unavailable, rejected, or ambiguous capability result.
- If the local language pack is missing but the browser reports it is locally downloadable, show the exact language and download requirement and ask for an explicit operator gesture/consent before `SpeechRecognition.install({ langs, processLocally: true })`. Do not begin recognition automatically after install; show ready state and require another explicit Start gesture. Honor blocked `on-device-speech-recognition` Permissions-Policy as unsupported.
- Start/stop/cancel only through visible controls. Request microphone access only after Start, make active state and errors accessible, and stop/abort recognition on Stop, Back, Close, Escape, navigation, sign-out, session expiry, or component disposal.
- Put final transcription into the ordinary Ask input as editable text. Preserve existing typed text safely (append or replace only under a visible, predictable interaction); the user can correct it. Never auto-click Ask, call `ChatSession.ask`, or mutate the follow-up store from a recognition result.
- Keep transcript and recognition state in component memory only. Do not use local/session storage, IndexedDB, analytics, logs, URLs, API calls, OpenAI STT, audio upload, telemetry, or browser cloud recognition. Clear transient state with the authenticated Nudgey view lifecycle. Only the operator's later explicit Ask sends text through the existing C1/C2 path.

## Out of scope

- Any browser cloud recognition, remote speech provider, OpenAI audio/transcription API, audio-file import, background listening, voice-activated Ask, voice-triggered invoice selection, or voice-triggered schedule/save.
- Transcription persistence, sharing, analytics, session recovery, or background recording.
- Expanding languages or platform support without verified local support.
- Altering C1/C2 authorization, session expiry, cancellation, candidate disambiguation, time-zone resolution, manual Save, C3 SMTP, PayPal behavior, or local follow-up storage.

## Acceptance criteria

1. When the API and local language pack are ready, a user gesture starts recognition with `processLocally === true`; only final text is copied into the editable Ask field.
2. The transcript remains unsent until the operator presses the existing Ask button or submits the form. A command transcript can only open the existing proposal flow, which still requires explicit invoice selection, review and Save.
3. Unsupported API, unavailable language, failed/denied install, blocked Permissions-Policy, microphone denial, and runtime error all leave typed Ask available and never start cloud recognition.
4. If installation is offered, the UI states the language and one-time download before consent; successful install does not automatically start listening.
5. Stop, Back, Close, Escape, navigation, sign-out, 401 and unmount stop the recorder and clear transient transcript/recognition state. A late recognition event cannot repopulate Ask or send a prompt.
6. Automated tests use a fake `SpeechRecognition` implementation and assert `processLocally: true`, API capability checks, unavailable/install failure handling, no implicit `start`, transcript editability, no `ask()`/follow-up write until explicit Ask/Save, and lifecycle cleanup. Include network spies that fail if audio or transcript is sent outside the existing explicit text Ask path.
7. Browser QA covers one real supported browser/device configuration only if local recognition is verifiably available; otherwise record it disabled. Test keyboard and screen-reader labels, focus, 390px mobile, reduced motion, errors, sign-out/401 cleanup, and no outbound audio/request boundary. Do not use provider tests or real customer speech.
8. Run focused tests, no-provider browser QA, both required hosted CI workflows and stop for independent exact-head audit. Keep the follow-on PR Draft; no merge, deployment, SMTP, OpenAI, PayPal or production database operations.

## Validation notes and references

These official references were checked on 2026-10-31; recheck at implementation start:

- MDN describes `processLocally` as the requirement that recognition be performed locally when true; false is the default and permits remote processing: [SpeechRecognition.processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally).
- For `available()`, `processLocally: true` means the language pack is installed locally; `available`, `downloadable`, `downloading`, and `unavailable` require distinct handling: [SpeechRecognition.available()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static).
- A local language pack may require `install()`, which is gated by `on-device-speech-recognition` Permissions-Policy: [SpeechRecognition.install()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/install_static).
- MDN marks these features experimental and notes that the ordinary Web Speech API usually processes audio through an online service unless on-device operation is explicitly requested: [Using the Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API).
- Current Edge guidance reports the local model limited to Edge Canary/Dev 150.0.4076 or later, requiring explicit enablement and a one-time model download; this is not sufficient evidence that the owner's target production browser supports V1: [Microsoft Edge local SpeechRecognition guide](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api).

**Required implementation note:** Browser support and available languages are unstable. Record the actual tested browser/version, operating system, language, local model availability state, and Permissions-Policy in the follow-on QA evidence. If the target browser cannot prove that processing remains on-device, keep the microphone disabled.

## V1 implementation decision — small additive control

The operator already approved strict on-device-only STT and verified desktop Chrome on macOS: `en-US` model installation returned `true`, and `SpeechRecognition.available({langs:["en-US"],processLocally:true})` returned `available`. This confirms **model availability only**, not a working mic or correct transcription.

**UI design gate:** This is a low-risk additive button plus inline status in the already owner-approved Ask Nudgey field, not a new screen or flow; preserve the existing input, transcript editability and explicit Ask/Save boundaries. Approval to add optional voice, with no changes to existing navigation, provides the design direction; new shell visual states remain subject to owner's physical browser inspection before merge.

**Implementation approach:** browser-only `LocalSpeechController` with a strict unprefixed `SpeechRecognition` feature gate, on-device language-pack availability and explicit install, an abort-and-dispose lifecycle, and final-only transcript callback; small `useLocalSpeech` React hook and optional inline control. Fallback is text only. English (`en-US`) is the only scope. No external API, new dependency, provider, database migration or device-speech fallback is permitted. No tests may claim actual mic QA based solely on fake recognizers or hosted CI.

**QA handoff:** test local pack installed + no cloud fallback, mic permission denial, final-only recognition, stop/close/escape/sign-out/401 cleanup, prompt editability, explicit Ask and Save, 390px keyboard/VoiceOver. Required Chrome mic QA must be performed on the owner's actual supported Chrome profile after implementation checkout; do not assume test runners have an on-device pack.

## Audit remediation record

- Example-question Ask actions stop and invalidate active recognition before starting the new Ask draft. The same controller generation guard rejects any callback already queued by the browser.
- React DOM component regressions use an injected fake local recognizer and application `fetch` spy. They verify transcript editability, no automatic Ask/schedule/review or request, explicit Ask behavior, example-Ask cancellation and stale-result rejection, plus cleanup after Back, Close, sign-out, and session expiry (401).
- The physical Chrome procedure and an evidence template are maintained in [`design/evidence/NMI-NDG-02-V1/QA-RESULTS.md`](../design/evidence/NMI-NDG-02-V1/QA-RESULTS.md). Physical mic, actual transcription, permission, and browser network QA remain **NOT RUN / PENDING** until performed on the supported owner device. Automated fake-recognizer tests do not satisfy that manual gate.
