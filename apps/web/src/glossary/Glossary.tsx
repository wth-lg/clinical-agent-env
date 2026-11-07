// The Glossary (P25u J7b; the rail item S1 renames from "Attribution"): first the plain terms, one
// sentence each under its own anchor (terms.ts), then how failures are attributed:
// FAULT_DEFINITIONS with their criteria, CONFIRMATION_CRITERIA, the taxonomy, pass^k, the band
// verdict, the difficulty history and the run blocks, rendered from packages/core/outcomes.ts
// and summary.ts, the one place they are written (scripts/test/one-definition.test.ts fails on
// a copy). The exact rules with the names the code uses (PASS_DEFINITION, DENOMINATOR_RULE, the
// AUDIT_LABEL table and FAULT_PRECEDENCE_RULE) sit last, in a closed "Exact rules" disclosure
// (copy rule C1); a link to an anchor inside it opens it. Linked from Findings and from the help
// icon beside every fault label. The band verdict's rule is BAND_VERDICT_RULE, rendered beside
// bandVerdict, its one home (plan-amendment-w4 PW4-F). Every anchor id of the earlier page is
// kept (test/glossary-anchors.test.ts).
import { useEffect, type Ref } from 'react';
import { AUDIT_LABEL, CONFIRMATION_CRITERIA, CONFIRMATION_DEFINITIONS, FAULT_DEFINITIONS, FAULT_PRECEDENCE, FAULT_PRECEDENCE_RULE, RUN_BLOCKS, type Fault } from '../../../../packages/core/outcomes.ts';
import { TAXONOMY_TEXT } from '../../../../packages/core/explain.ts';
import { BAND_VERDICT_RULE, BAND_VERDICTS } from '../../../../packages/core/summary.ts';
import { kindWords, type FailureKind } from '../data/failures.ts';
import { Card, GlossaryLink, Page, PlainRules } from '../data/ui.tsx';
import { PLAIN_TERMS } from './terms.ts';

export const GLOSSARY_TITLE = 'Glossary';

// The fault in words for a card title (copy rule C4: infrastructure and environment in full).
const FAULT_WORDS: Record<Fault, string> = { infra: 'the infrastructure', grader: 'the grader', env: 'the environment', refusal: 'a refusal (the model declined)', model: 'the model' };

// A link to an anchor inside a closed <details> (the Exact rules) must show its target. Open the
// disclosure the target sits in: on load and on every hash change (a link from another view
// mounts the page with the hash set), and on a click on any link to such an anchor while the
// page is up (F5: GlossaryLink sets the hash with history.replaceState, which fires no
// hashchange; the click is seen in the capture phase, before the link's own handler scrolls).
function useOpenOnHash() {
  useEffect(() => {
    const reveal = (id: string, scroll: boolean) => {
      if (id === '') return;
      const target = document.getElementById(id);
      const details = target?.closest('details');
      if (target && details && !details.open) {
        details.open = true;
        if (scroll) target.scrollIntoView({ block: 'start' });
      }
    };
    const onHash = () => reveal(decodeURIComponent(location.hash.slice(1)), true);
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest('a[href]');
      if (!(a instanceof HTMLAnchorElement)) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && url.hash !== '') reveal(decodeURIComponent(url.hash.slice(1)), false);
    };
    onHash();
    addEventListener('hashchange', onHash);
    document.addEventListener('click', onClick, true);
    return () => {
      removeEventListener('hashchange', onHash);
      document.removeEventListener('click', onClick, true);
    };
  }, []);
}

export function Glossary({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  useOpenOnHash();
  return (
    <Page title={GLOSSARY_TITLE} headingRef={headingRef} lead="The words the other pages use, one sentence each. Then how failures are attributed: every trial gets one outcome, and a non-pass trial gets the fault whose criterion holds first in the order below.">
      <Card title="Plain terms" id="plain-terms">
        <dl className="space-y-2" data-testid="plain-terms">
          {PLAIN_TERMS.map((t) => (
            <div key={t.id} id={t.id} data-testid="plain-term" data-term={t.id} className="scroll-mt-4">
              <dt className="inline font-medium text-ink">{t.term}: </dt>
              <dd className="inline text-ink-muted">{t.text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-muted" data-testid="plain-terms-exact">The exact pass rule and the fault-label table, with the names the code uses, are under <GlossaryLink anchor="pass">Exact rules</GlossaryLink> at the end of this page.</p>
      </Card>
      {FAULT_PRECEDENCE.map((f) => (
        <Card key={f} title={<span>Fault: {FAULT_WORDS[f]}</span>} id={`fault-${f}`}>
          <p data-testid="fault-sentence" data-fault={f}>{FAULT_DEFINITIONS[f].sentence}</p>
          <ul className="mt-2 space-y-1.5">
            {FAULT_DEFINITIONS[f].criteria.map((c) => (
              <li key={c.id} id={`criterion-${c.id}`} data-testid="criterion" data-id={c.id} className="scroll-mt-4 text-ink-muted">
                <span className="mr-1.5 font-medium text-ink">{c.id}</span>
                <span data-testid="criterion-text">{c.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <Card title="Confirming a label" id="confirmation">
        {/* Who performs the audit is said here, where M5 is defined (eval-p25u-1 defect 1; the
            run's README and docs/findings.md next step 10 record the fact). */}
        <p className="text-ink-muted">A model fault is confirmed when the record meets M1 to M4 and the audit agrees (M5). In the published run the audit was done by LLM sessions, not by clinicians: one session labelled each failure, a second session double-labelled a blinded sample, and a blinded LLM auditor checked every label (a trial's Attribution tab shows its verdict as "LLM auditor agrees"). A clinician's read is a next step in Findings. Findings and Overview count both: the failures the record confirms, and the failures the audit agrees with.</p>
        <ul className="mt-2 space-y-1.5">
          {CONFIRMATION_CRITERIA.map((c) => <li key={c.id} id={`criterion-${c.id}`} className="scroll-mt-4 text-ink-muted"><span className="mr-1.5 font-medium text-ink">{c.id}</span>{c.text}</li>)}
        </ul>
        <dl className="mt-3 space-y-1.5">
          {Object.entries(CONFIRMATION_DEFINITIONS).map(([k, v]) => <div key={k}><dt className="inline font-medium">{k}: </dt><dd className="inline text-ink-muted">{v}</dd></div>)}
        </dl>
      </Card>
      <Card title="Kinds of model failure" id="taxonomy">
        <p className="text-ink-muted">A model failure also gets one of these kinds. The reason on a failed trial ends with it, for example "Kind: reasoning (Observation/obs-1 was read at step 6)", or "Kind: reasoning" when the why does not fit.</p>
        <dl className="mt-2 space-y-1.5" data-testid="taxonomy">
          {(Object.entries(TAXONOMY_TEXT) as Array<[FailureKind, string]>).map(([k, v]) => <div key={k} data-testid="taxonomy-row" data-taxonomy={k}><dt className="inline font-medium" data-testid="taxonomy-term">{kindWords(k) === k ? k : `${kindWords(k)} (${k})`}: </dt><dd className="inline text-ink-muted">{v}</dd></div>)}
        </dl>
      </Card>
      <Card title="pass^k" id="pass-k">
        <p className="text-ink-muted" data-testid="pass-k-text">
          pass^k is the chance that k trials of a task, drawn from its valid trials, all pass: C(c, k) / C(n, k) for c passes in n valid trials. It shows how
          reliably the model passes a task, not only how often. A task with fewer than k valid trials has no pass^k. The pass rate k/n and its Wilson 95%
          interval stay the main result.
        </p>
      </Card>
      <Card title="Band verdict" id="band-verdict">
        <p className="text-ink-muted" data-testid="band-verdict-rule">{BAND_VERDICT_RULE}</p>
        <p className="mt-2 text-ink-muted">The verdict is one of {BAND_VERDICTS.join(', ')}. Overview, Findings and the command-line result card (pnpm cli result-card) all compute it with the same function, so they always agree.</p>
      </Card>
      <Card title="Difficulty history and tasks with no failures" id="difficulty-history">
        <p className="text-ink-muted">The difficulty history on Findings gives each task's pass count and verdict in every committed run, pilots first and the final run last. A task with no failed trial gets a line saying so, with a link to its grader checks: the reference solution passes and every validation probe gets the verdict it declares. This shows that the grader fails wrong answers, so a task with no failures is not a lenient grader.</p>
      </Card>
      <Card title="What blocks a whole run" id="run-blocks">
        <ul className="space-y-1.5">
          {RUN_BLOCKS.map((c) => <li key={c.id} id={`criterion-${c.id}`} className="scroll-mt-4 text-ink-muted"><span className="mr-1.5 font-medium text-ink">{c.id}</span>{c.text}</li>)}
        </ul>
      </Card>
      <Card title="Exact rules" id="exact-rules-card">
        <p className="text-ink-muted">The rules as the code states them, with the outcome names it uses. The plain terms above say the same in words.</p>
        <details data-testid="exact-rules" className="mt-2">
          <summary className="cursor-pointer font-medium text-ink">Exact rules, with the names the code uses</summary>
          <div id="pass" className="mt-3 scroll-mt-4">
            <h3 className="mb-1.5 text-sm font-semibold text-ink">Pass and denominator</h3>
            <PlainRules ids={{ pass: 'glossary-pass', denominator: 'glossary-denominator' }} />
          </div>
          <div id="fault-labels" className="mt-4 scroll-mt-4">
            <h3 className="mb-1.5 text-sm font-semibold text-ink">Fault labels</h3>
            <table className="w-full text-left" data-testid="audit-label-table">
              <thead className="text-xs text-ink-muted"><tr><th scope="col" className="py-1 font-medium">Fault</th><th scope="col" className="py-1 font-medium">Label</th></tr></thead>
              <tbody>
                {FAULT_PRECEDENCE.map((f) => {
                  const l = AUDIT_LABEL[f];
                  return (
                    <tr key={f} data-testid="audit-label-row" data-fault={f} className="border-t border-line">
                      <td className="py-1.5">{f}</td>
                      <td className="py-1.5" data-testid="audit-label">{l === null ? 'no label: excluded and rerun' : `${l.label}${l.subtype ? ` (subtype ${l.subtype})` : ''}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-ink-muted" data-testid="precedence">{FAULT_PRECEDENCE_RULE}</p>
          </div>
        </details>
      </Card>
    </Page>
  );
}
