import { asTrustedActor, type TrustedActor } from "@nmi/domain";

/**
 * The ONLY place a TrustedActor is constructed. It is built from a session that the database has
 * just validated (see plugins/auth.ts), never from a request body, header, model output or tool
 * argument. ESLint forbids importing `asTrustedActor` anywhere else outside tests.
 */
export function actorFromValidatedSession(session: { operatorId: string }): TrustedActor {
  return asTrustedActor(session.operatorId);
}
