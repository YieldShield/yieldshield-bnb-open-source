import type { ActionEligibility } from "@yieldshield/core";

type Observation = { evaluatedAt?: bigint; validUntil?: bigint };

/** Cached display checks expire independently of the mandatory transaction simulation. */
export function actionBlocker(
  observation: Observation | undefined,
  action: ActionEligibility | undefined,
  now: bigint,
): string | null {
  const stale = observationBlocker(observation, now);
  if (stale) return stale;
  if (!action || action.state !== "available" || action.blockers.length > 0)
    return action?.blockers[0]?.message ?? "This action is currently unavailable.";
  return null;
}

export function observationBlocker(observation: Observation | undefined, now: bigint): string | null {
  if (
    observation?.evaluatedAt === undefined ||
    observation.validUntil === undefined ||
    now < observation.evaluatedAt ||
    now >= observation.validUntil
  )
    return "Waiting for fresh on-chain data. Refresh before continuing.";
  return null;
}
