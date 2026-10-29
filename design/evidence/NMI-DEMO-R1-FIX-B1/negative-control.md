## NEGATIVE CONTROL: 401 resend re-enabled for create (mutation removes the effect === "read" condition)
   × a draft create is sent AT MOST ONCE per call (FIX-B1) > create HTTP 401 sends exactly ONE create POST, never refreshes-and-resends, and is outcome UNKNOWN (not rejected) 2ms
   × a draft create is sent AT MOST ONCE per call (FIX-B1) > a 401 on the create does not refresh even when a later read would 0ms
   × a draft create is sent AT MOST ONCE per call (FIX-B1) > a mutating call has no default that allows a resend: the call helper requires an explicit effect 1ms
   × PayPal create is never resent and never blindly recreated (real PostgreSQL) > create HTTP 401: ONE create POST, state unknown, attempts=1, nothing linked; a second browser request only reconciles 12ms
   × PayPal create is never resent and never blindly recreated (real PostgreSQL) > a 401 on the reconciliation search refreshes the token once (safe read) and still creates nothing 8ms
   × PayPal create is never resent and never blindly recreated (real PostgreSQL) > service level: the same 401 gives unknown, and the next invocation never calls create 5ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  2 failed | 3 passed (5)
      Tests  6 failed | 109 passed (115)

## NEGATIVE CONTROL 2: create 401 classified as definite rejection (a rejected operation can be claimed for create again)
   × a draft create is sent AT MOST ONCE per call (FIX-B1) > create HTTP 401 sends exactly ONE create POST, never refreshes-and-resends, and is outcome UNKNOWN (not rejected) 2ms
   × a draft create is sent AT MOST ONCE per call (FIX-B1) > a 401 on the create does not refresh even when a later read would 0ms
   × PayPal create is never resent and never blindly recreated (real PostgreSQL) > create HTTP 401: ONE create POST, state unknown, attempts=1, nothing linked; a second browser request only reconciles 13ms
   × PayPal create is never resent and never blindly recreated (real PostgreSQL) > a 401 on the reconciliation search refreshes the token once (safe read) and still creates nothing 8ms
   × PayPal create is never resent and never blindly recreated (real PostgreSQL) > service level: the same 401 gives unknown, and the next invocation never calls create 3ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  2 failed | 3 passed (5)
      Tests  5 failed | 110 passed (115)
