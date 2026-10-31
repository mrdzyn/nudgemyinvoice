# NMI-NDG-02 V1 local speech QA

## Automated component regression

**Run status:** PASS — 24/24 focused tests across `localSpeech.test.ts` and `NudgeyChat.test.tsx` at implementation commit `71a3f0e99c5afbb071718edae5527bddc2a7b1e2`.
**Environment:** Vitest + happy-dom; fake `SpeechRecognition`, no microphone or provider.
**Command:** `pnpm exec vitest run apps/web/src/nudgey/localSpeech.test.ts apps/web/src/nudgey/NudgeyChat.test.tsx`.
**Coverage:** local `processLocally` capability/start gate; final transcript inserted into the editable Ask field; transcript text does not call Ask, schedule/review callbacks, or `fetch`; explicit Ask sends only the edited text to the existing Ask callback; example Ask aborts recognition before calling Ask; captured late result cannot alter the new draft; unmount after Back, Close, sign-out, or session expiry (401) aborts and ignores queued late results.

The component tests observe application requests with a `fetch` spy. They do not claim that browser-native speech networking was physically observed; that remains a manual Chrome gate below.

**Hosted CI:** Project Baseline and Stack validation both passed on PR head `d350d3741a08c885293888905e2f9bf4116cfce6` (runs [41210442032](https://github.com/mrdzyn/nudgemyinvoice/actions/runs/41210442032), [41210442014](https://github.com/mrdzyn/nudgemyinvoice/actions/runs/41210442014)). This evidence is for that exact commit; the later documentation-only handoff commit must be checked independently.

## Physical Chrome microphone QA — owner report and independent observations

**Scoped closure verdict: PASS.** The owner-reported transcription/editability/network results are preserved as owner reports; the missing environment, permission, cancellation, auth-expiry, and redacted-network checks below were independently observed on 2026-10-31. This evidence note contains no transcript, customer text, credentials, audio file, screenshot, or HAR. Speech recognition was started and stopped silently for the independent lifecycle cases.

| Check | Status | Evidence / attribution |
|---|---|---|
| Tested app commit | PASS | `a90a19b2ba912f4a0a85ef8ddbf389570090b992` (code under test; this task changes documentation only) |
| Date / operator | PASS | 2026-10-31, owner Mac; QA performed in the owner's Chrome session |
| Chrome version | PASS | Chrome `156.0.8078.80`, Official Build, arm64, observed at `chrome://version/` |
| Chrome channel | NOT RUN | `chrome://version/` did not display a channel label; app bundle identifier observed as `com.google.Chrome` |
| macOS version | PASS | macOS `27.0.1`, build `26A434`, observed with `sw_vers` |
| Recognition language | PASS | `en-US`; UI and direct API probe |
| Local API capability and pack availability | PASS | On the non-emulated desktop page, `SpeechRecognition` and `processLocally` were present; `SpeechRecognition.available({langs:["en-US"],processLocally:true})` resolved to `available`. The probe returned no transcript. |
| Permissions-Policy for on-device speech | PASS | `document.featurePolicy.allowsFeature("on-device-speech-recognition")` returned `true`. `document.permissionsPolicy` was `undefined` in this Chrome build; recorded as an API limitation, not a blocked policy. |
| Microphone permission before Start | PASS | Chrome site settings for `http://localhost:5173` were reset to `Ask (default)` before the permission check. |
| Permission prompt timing | PASS | Chrome's “Use your microphones” prompt appeared only after explicit Speak. “Allow this time” was selected for the test; the persistent localhost permission was restored to Ask(default) afterward. |
| Microphone denial fallback | PASS | With the localhost permission set to Block, explicit Speak displayed “Microphone access or local speech was denied. You can type instead.” The Ask field remained usable. Permission was restored to Ask(default). |
| Synthetic speech transcription and editability | PASS — owner-reported | Owner confirmed a synthetic phrase transcribed into the editable field and was not submitted. The transcript was not reproduced or retained in this evidence. |
| No automatic Ask | PASS — owner-reported | Owner confirmed the transcript remained unsent absent explicit Ask. Independent silent-recognition checks did not enter or submit speech. |
| No automatic scheduling or Save | NOT RUN | No invoice/follow-up was created in this QA session. Existing deterministic fake-recognizer tests cover no automatic Ask/schedule/review callback; no physical Save was attempted. |
| Redacted application-origin Network observation | PASS — combined | Owner reports no application-origin request carried audio/transcript during their transcription. Independently, DevTools Network had Keep log enabled, was cleared, and filtered to `domain:localhost`; no local request row appeared during the short silent Start/Stop interval. No request bodies or HAR were inspected/exported. |
| Unrelated browser-extension traffic | PASS — disclosed | Chrome Console showed a third-party Sentry-ingest POST returning 403, with initiator `chrome-extension://…/content/index.js`. It was outside the application-origin filter, not attributed to NudgeMyInvoice, and its body was not inspected. No provider endpoint was contacted. |
| Stop cleanup | PASS | Independent silent Start → one Stop action returned the UI to the ready state and removed Chrome's microphone-recording indicator. Queued-result behavior was not exercised physically; deterministic regression tests cover stale callbacks. |
| Back cleanup | PASS | While listening, Back returned to Nudgey's action list and removed the active-recognition state. |
| Close cleanup | PASS | While listening, Close Nudgey returned to the dashboard and removed the active-recognition state. |
| Escape cleanup | PASS | While listening, Escape closed the Nudgey overlay and removed the active-recognition state. |
| App navigation cleanup | PASS | While listening, selecting Invoice drafts returned to the dashboard and removed the active-recognition state. |
| Sign-out cleanup | PASS | While listening, Sign out returned to Operator sign in; no recording indicator or active speech control remained. |
| HTTP 401 cleanup | PASS | With active silent recognition, the synthetic DB session was deleted; explicit read-only “Which follow-ups are due?” received `GET /api/follow-ups` → 401. The app returned to sign-in and removed recognition state. No response/request body was saved. |
| Local-model install prompt | NOT RUN | The local `en-US` model was already available, so no install was needed or attempted. |
| Blocked Permissions-Policy fallback | NOT RUN | The observed policy allowed on-device recognition; policy was not changed to simulate a block. |
| Retained evidence artifact | PASS | This redacted Markdown record is the retained evidence. No screenshot, audio, transcript, credentials, or HAR was saved. |
| Overall scoped physical QA | PASS | PASS combines the clearly labeled owner-reported transcription checks and independently observed missing checks. NOT RUN cases above remain outside this scoped closure and must not be described as executed. |

### Run procedure retained for future reruns

1. Use the owner's supported desktop Chrome profile and a local development build with synthetic test data. Do not enter customer speech, and do not configure or invoke OpenAI, PayPal, or SMTP.
2. Before granting microphone access, inspect the browser's on-device speech capability and record the exact `en-US` local-pack availability and Permissions-Policy. If the API does not prove local processing or the pack is unavailable, verify that Speak remains unavailable and stop this run without enabling a fallback.
3. Open DevTools Network with Preserve log enabled and clear the log. Record relevant app server request logs using a synthetic phrase only. Click Speak explicitly; confirm microphone permission is requested only then. Speak a short synthetic prompt, such as “show my pending invoices.”
4. Confirm the final transcript appears in the ordinary Ask input and can be edited. While listening and after transcription, verify no app Fetch/XHR/WebSocket request contains audio or transcript and no application request starts until explicit Ask. Do not infer the browser's native processing mode from the app request log alone; retain the local API/pack evidence and browser network observation together.
5. Test explicit Stop while listening. Repeat listening and exercise Back, Close, Escape, navigation, sign-out, and session expiry using the local test session. Verify capture stops and late events do not repopulate the Ask field. Verify permission denial or blocked policy leaves typed Ask usable and does not fall back to cloud recognition.
6. Save only redacted evidence showing UI states and network categories. Do not capture transcript text, customer data, cookies, request bodies, credentials, audio, or unrelated browsing activity. Record the exact tested commit, and mark every unexecuted case `NOT RUN`.

**Current result:** This scoped manual QA gate is closed at the SHA listed above. Owner reports and independent observations are distinguished in the table. Automated fake-recognizer regressions remain separate evidence; this record does not claim an install-prompt test, blocked-policy simulation, physical stale-callback injection, physical Save/schedule attempt, or an independent reproduction of the owner's spoken transcript. Do not retain raw speech or expose customer data while repeating any future check.
