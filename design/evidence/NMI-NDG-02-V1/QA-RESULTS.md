# NMI-NDG-02 V1 local speech QA

## Automated component regression

**Run status:** PASS — 24/24 focused tests across `localSpeech.test.ts` and `NudgeyChat.test.tsx` at implementation commit `71a3f0e99c5afbb071718edae5527bddc2a7b1e2`.
**Environment:** Vitest + happy-dom; fake `SpeechRecognition`, no microphone or provider.
**Command:** `pnpm exec vitest run apps/web/src/nudgey/localSpeech.test.ts apps/web/src/nudgey/NudgeyChat.test.tsx`.
**Coverage:** local `processLocally` capability/start gate; final transcript inserted into the editable Ask field; transcript text does not call Ask, schedule/review callbacks, or `fetch`; explicit Ask sends only the edited text to the existing Ask callback; example Ask aborts recognition before calling Ask; captured late result cannot alter the new draft; unmount after Back, Close, sign-out, or session expiry (401) aborts and ignores queued late results.

The component tests observe application requests with a `fetch` spy. They do not claim that browser-native speech networking was physically observed; that remains a manual Chrome gate below.

**Hosted CI:** Project Baseline and Stack validation both passed on PR head `d350d3741a08c885293888905e2f9bf4116cfce6` (runs [41210442032](https://github.com/mrdzyn/nudgemyinvoice/actions/runs/41210442032), [41210442014](https://github.com/mrdzyn/nudgemyinvoice/actions/runs/41210442014)). This evidence is for that exact commit; the later documentation-only handoff commit must be checked independently.

## Physical Chrome microphone QA — owner execution required

**Status: NOT RUN / PENDING.** The owner's earlier report that the Chrome `en-US` pack is installed and `available` establishes pack availability only. It does not establish actual microphone capture/transcription or runtime network behavior. Do not mark this section PASS based on fake recognition or CI.

Fill this record during execution:

| Field | Result |
|---|---|
| Tested commit SHA | `PENDING` |
| Date and operator | `PENDING` |
| Chrome version and channel | `PENDING` |
| macOS version/device | `PENDING` |
| Recognition language | `en-US` |
| `available({langs:["en-US"], processLocally:true})` result | `PENDING` |
| `en-US` pack already installed; install prompt/result if applicable | `PENDING` |
| `on-device-speech-recognition` policy result | `PENDING` |
| Microphone permission before Start | `PENDING` |
| Permission prompt appeared only after explicit Speak | `PENDING` |
| Synthetic phrase transcribed locally and remained editable | `PENDING` |
| No Ask request until explicit Ask; no schedule/save until explicit operator actions | `PENDING` |
| Network observation (DevTools Fetch/XHR/WS + app request log, redacted) | `PENDING` |
| Stop cancellation aborts and drops queued results | `PENDING` |
| Back, Close, Escape, navigation, sign-out and session-expiry cleanup | `PENDING` |
| Permission denial / unavailable policy recovery | `PENDING` |
| Evidence file(s) (no transcript/customer data) | `PENDING` |
| Overall physical QA verdict | `PENDING` |

### Run procedure

1. Use the owner's supported desktop Chrome profile and a local development build with synthetic test data. Do not enter customer speech, and do not configure or invoke OpenAI, PayPal, or SMTP.
2. Before granting microphone access, inspect the browser's on-device speech capability and record the exact `en-US` local-pack availability and Permissions-Policy. If the API does not prove local processing or the pack is unavailable, verify that Speak remains unavailable and stop this run without enabling a fallback.
3. Open DevTools Network with Preserve log enabled and clear the log. Record relevant app server request logs using a synthetic phrase only. Click Speak explicitly; confirm microphone permission is requested only then. Speak a short synthetic prompt, such as “show my pending invoices.”
4. Confirm the final transcript appears in the ordinary Ask input and can be edited. While listening and after transcription, verify no app Fetch/XHR/WebSocket request contains audio or transcript and no application request starts until explicit Ask. Do not infer the browser's native processing mode from the app request log alone; retain the local API/pack evidence and browser network observation together.
5. Test explicit Stop while listening. Repeat listening and exercise Back, Close, Escape, navigation, sign-out, and session expiry using the local test session. Verify capture stops and late events do not repopulate the Ask field. Verify permission denial or blocked policy leaves typed Ask usable and does not fall back to cloud recognition.
6. Save redacted screenshots or a short evidence note showing UI states and network categories only. Do not capture transcript text, customer data, cookies, request bodies, credentials, or unrelated browsing activity. Complete the table above, name the exact tested commit, and leave any unexecuted case `PENDING`.

**Current result:** Only automated fake-recognizer regressions are eligible for agent execution in this task. Physical microphone QA remains pending owner execution and independent review; no actual microphone test is claimed here.
