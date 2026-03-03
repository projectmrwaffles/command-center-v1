import { getServiceClient } from "@/lib/agent-auth";

export type LlmTimeoutLog = {
  provider?: string;
  model?: string;
  endpoint?: string;
  requestChars?: number;
  retryCount: number;
  fallbackUsed: boolean;
  error: string;
};

export type Checkpoint = {
  task: string;
  nextStep: string;
  inputs: Record<string, unknown>;
};

/**
 * Checkpoint before expensive operations so timeouts can resume.
 */
export async function writeCheckpoint(
  agentId: string,
  checkpoint: Checkpoint
): Promise<void> {
  const svc = getServiceClient();
  await svc.from("agent_events").insert({
    agent_id: agentId,
    event_type: "CHECKPOINT",
    payload: checkpoint,
    timestamp: new Date().toISOString(),
  });
}

export async function logLlmTimeout(agentId: string, log: LlmTimeoutLog): Promise<void> {
  const svc = getServiceClient();
  await svc.from("agent_events").insert({
    agent_id: agentId,
    event_type: "LLM_TIMEOUT",
    payload: log,
    timestamp: new Date().toISOString(),
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type CallOpts<T> = {
  agentId: string;
  task: string;
  nextStep: string;
  inputs: Record<string, unknown>;
  call: (attempt: number, mode: "normal" | "shrunk" | "fallback") => Promise<T>;
  shrinkInputs?: (inputs: Record<string, unknown>) => Record<string, unknown>;
  fallbackCall?: (attempt: number) => Promise<T>;
};

/**
 * Standard timeout recovery loop:
 * - 2 retries with backoff (2s, 8s)
 * - shrink context on retry
 * - optional fallback routing after 2 failures
 */
export async function callWithResilience<T>(opts: CallOpts<T>): Promise<T> {
  const { agentId } = opts;

  // checkpoint first
  await writeCheckpoint(agentId, {
    task: opts.task,
    nextStep: opts.nextStep,
    inputs: opts.inputs,
  });

  const backoffs = [2000, 8000];
  let lastErr: unknown = null;

  for (let i = 0; i < 3; i++) {
    const attempt = i + 1;
    const mode: "normal" | "shrunk" | "fallback" = i === 0 ? "normal" : "shrunk";

    try {
      return await opts.call(attempt, mode);
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message ?? String(err);

      // log timeout-ish errors
      await logLlmTimeout(agentId, {
        retryCount: i,
        fallbackUsed: false,
        error: msg,
      });

      if (i < 2) {
        // shrink inputs on retry if provided
        if (opts.shrinkInputs) {
          opts.inputs = opts.shrinkInputs(opts.inputs);
        }
        await sleep(backoffs[i]);
        continue;
      }
    }
  }

  // fallback
  if (opts.fallbackCall) {
    try {
      const res = await opts.fallbackCall(1);
      await logLlmTimeout(agentId, {
        retryCount: 2,
        fallbackUsed: true,
        error: "fallback_used",
      });
      return res;
    } catch (err: any) {
      await logLlmTimeout(agentId, {
        retryCount: 2,
        fallbackUsed: true,
        error: err?.message ?? String(err),
      });
      throw err;
    }
  }

  throw lastErr;
}
