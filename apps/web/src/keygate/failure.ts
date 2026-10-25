// What the key gate says about a failed Validate. Every failure starts with one plain sentence
// (lead), then what to do when there is something to do (next), then the API's or runner's own
// line (detail), which the gate shows in small mono. org-CORS and network failures show the
// command to run the environment locally.
// The failure types live here, not in direct.ts or runner.ts, so this file imports nothing and
// its unit test does not pull browser code into a program without the DOM types.

// An api failure keeps the HTTP status (null when no response came back), which picks the first
// sentence.
export type DirectFailure = { kind: 'org-cors' | 'network' | 'cap'; message: string } | { kind: 'api'; status: number | null; message: string };
// cause says what went wrong with a local-runner call: no token in the page, no answer, a 200
// whose body did not parse, or an error status (with the runner's status and message).
export type RunnerFailure = { cause: 'no-token' | 'no-answer' | 'bad-body' | 'error'; message: string; status?: number; refusal?: string };

export type Failure = DirectFailure | (RunnerFailure & { kind: 'runner' }) | { kind: 'notice'; message: string };

export interface FailureText {
  lead: string;
  next?: string;
  detail?: string;
  // True when the next step is running the environment locally.
  local: boolean;
}

const LOCAL = 'Run the environment locally instead. It opens this UI and keeps the key on your machine:';

// The API's answer by HTTP status, the same sentence on both surfaces.
function apiLead(status: number | null): { lead: string; next?: string } {
  if (status === null) return { lead: 'The browser did not send the request to the API.' };
  if (status === 401) return { lead: 'The API did not accept this key.' };
  if (status === 403) return { lead: 'The API does not let this key use the model.' };
  if (status === 404) return { lead: 'The API did not find the model for this key.' };
  if (status === 429) return { lead: 'The API is limiting requests for this key.', next: 'Wait a minute, then press Validate again.' };
  if (status >= 500) return { lead: 'The API is not available at the moment.', next: 'Press Validate again in a few minutes.' };
  if (status >= 400) return { lead: 'The API did not accept the request.' };
  return { lead: 'The API sent an answer that this page cannot use.' };
}

function runnerLead(f: RunnerFailure): { lead: string; next?: string } {
  if (f.refusal !== undefined) return { lead: f.refusal };
  if (f.cause === 'no-token') return { lead: 'This page has no runner token.', next: 'Open the UI at the address that the runner printed, then try again.' };
  if (f.cause === 'no-answer') return { lead: 'The local runner did not answer.', next: 'Make sure that the runner is running, then press Validate again.' };
  if (f.cause === 'bad-body') return { lead: 'The local runner sent an answer that this page cannot read.' };
  // The runner relays these three API answers with their own status (apps/runner/server.ts).
  if (f.status === 401 || f.status === 403 || f.status === 429) return { lead: apiLead(f.status).lead };
  if (f.status === 502) return { lead: 'The local runner could not check the key with the API.' };
  if (f.status !== undefined && f.status >= 500) return { lead: 'The local runner had an internal error.' };
  return { lead: 'The local runner did not accept the key.' };
}

export function describeFailure(f: Failure): FailureText {
  switch (f.kind) {
    case 'org-cors':
      return { lead: "This key's organization does not allow browser access.", next: LOCAL, detail: f.message, local: true };
    case 'network':
      return { lead: 'The browser could not reach the API from this page.', next: LOCAL, detail: f.message, local: true };
    case 'cap':
      return { lead: 'The session spend cap does not allow this check.', next: 'To continue, set a higher session spend cap.', detail: f.message, local: false };
    case 'api': {
      const { lead, next } = apiLead(f.status);
      return { lead, ...(next === undefined ? {} : { next }), detail: f.message, local: false };
    }
    case 'runner': {
      const { lead, next } = runnerLead(f);
      return { lead, ...(next === undefined ? {} : { next }), ...(f.cause === 'no-token' ? {} : { detail: f.message }), local: false };
    }
    case 'notice':
      return { lead: f.message, local: false };
  }
}
