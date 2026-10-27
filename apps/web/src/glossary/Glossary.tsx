// How failures are attributed: FAULT_DEFINITIONS with their criteria, the AUDIT_LABEL mapping,
// PASS_DEFINITION and DENOMINATOR_RULE, rendered from packages/core/outcomes.ts, the one place
// they are written (scripts/test/one-definition.test.ts fails on a copy). Linked from Findings
// and from the help icon beside every fault label.
import type { Ref } from 'react';
import { AUDIT_LABEL, CONFIRMATION_CRITERIA, CONFIRMATION_DEFINITIONS, FAULT_DEFINITIONS, FAULT_PRECEDENCE, FAULT_PRECEDENCE_RULE, RUN_BLOCKS } from '../../../../packages/core/outcomes.ts';
import { TAXONOMY_TEXT } from '../../../../packages/core/explain.ts';
import { Card, Page, PlainRules } from '../data/ui.tsx';

export const GLOSSARY_TITLE = 'How failures are attributed';

export function Glossary({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  return (
    <Page title={GLOSSARY_TITLE} headingRef={headingRef} lead="Every trial gets one outcome. A non-pass trial gets the fault whose criterion holds first in the order below, and the fault gives its label.">
      <Card title="Pass and denominator" id="pass">
        <PlainRules ids={{ pass: 'glossary-pass', denominator: 'glossary-denominator' }} />
      </Card>
      <Card title="Labels">
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
      </Card>
      {FAULT_PRECEDENCE.map((f) => (
        <Card key={f} title={<span>Fault: {f}</span>} id={`fault-${f}`}>
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
      <Card title="pass^k" id="pass-k">
        <p className="text-ink-muted" data-testid="pass-k-text">
          pass^k is the chance that k trials of a task, drawn from its valid trials, all pass: C(c, k) / C(n, k) for c passes in n valid trials. It shows how
          reliably the model passes a task, not only how often. A task with fewer than k valid trials has no pass^k. The pass rate k/n and its Wilson 95%
          interval stay the main result.
        </p>
      </Card>
      <Card title="Kinds of model failure" id="taxonomy">
        <p className="text-ink-muted">A model failure also gets one of these kinds. The reason on a failed trial ends with it, for example "Kind: reasoning (Observation/obs-1 was read at step 6)", or "Kind: reasoning" when the why does not fit.</p>
        <dl className="mt-2 space-y-1.5" data-testid="taxonomy">
          {Object.entries(TAXONOMY_TEXT).map(([k, v]) => <div key={k} data-testid="taxonomy-row" data-taxonomy={k}><dt className="inline font-medium">{k.replace(/_/g, ' ')}: </dt><dd className="inline text-ink-muted">{v}</dd></div>)}
        </dl>
      </Card>
      <Card title="Confirming a label" id="confirmation">
        <ul className="space-y-1.5">
          {CONFIRMATION_CRITERIA.map((c) => <li key={c.id} id={`criterion-${c.id}`} className="scroll-mt-4 text-ink-muted"><span className="mr-1.5 font-medium text-ink">{c.id}</span>{c.text}</li>)}
        </ul>
        <dl className="mt-3 space-y-1.5">
          {Object.entries(CONFIRMATION_DEFINITIONS).map(([k, v]) => <div key={k}><dt className="inline font-medium">{k}: </dt><dd className="inline text-ink-muted">{v}</dd></div>)}
        </dl>
      </Card>
      <Card title="What blocks a whole run" id="run-blocks">
        <ul className="space-y-1.5">
          {RUN_BLOCKS.map((c) => <li key={c.id} id={`criterion-${c.id}`} className="scroll-mt-4 text-ink-muted"><span className="mr-1.5 font-medium text-ink">{c.id}</span>{c.text}</li>)}
        </ul>
      </Card>
    </Page>
  );
}
