import { Check, Copy } from 'lucide-react';
import { Fragment, useState } from 'react';
import { LOCAL_PREREQUISITES, LOCAL_RESTART_COMMAND, LOCAL_START_COMMAND, PREREQUISITE_ROWS } from './command.ts';

// A command split at spaces and after each slash. Each piece stays on one line (no break inside
// a token), and a line may break only at a space or after a slash. The text content is still
// exactly the command.
const pieces = (command: string) => command.split(' ').map((word) => word.split(/(?<=\/)/));

const link = 'text-ink underline underline-offset-2 hover:text-accent';

// LOCAL_PREREQUISITES, then one row per tool (what it needs, the command that prints the
// installed version in a code box that never wraps, the install link), then LOCAL_START_COMMAND
// with a Copy button. Every screen that shows the command shows it through this: the local-run
// panel and the runner-down screen.
// local (P25u A12): the page comes from the local runner, so the reader already has the clone.
// Then the restart alone comes first, `pnpm start` in the clone with its own copy button; the
// prerequisites sentence stays (trace U12), and the rows and the clone command wait behind
// "On another computer".
export function LocalCommand({ local = false }: { local?: boolean }) {
  if (!local) {
    return (
      <div>
        <Prerequisites />
        <CommandBox command={LOCAL_START_COMMAND} testId="local-command" copyLabel="Copy command" />
      </div>
    );
  }
  return (
    <div>
      <p className="text-ink">In your clinical-agent-env folder, run</p>
      <CommandBox command={LOCAL_RESTART_COMMAND} testId="restart-command" copyLabel="Copy command" />
      <p data-testid="local-prerequisites" className="mt-3 text-xs text-ink-muted">{LOCAL_PREREQUISITES}</p>
      <details className="mt-1 text-xs text-ink-muted">
        <summary className="cursor-pointer pointer-coarse:py-2.5">On another computer</summary>
        <PrerequisiteRows />
        <CommandBox command={LOCAL_START_COMMAND} testId="local-command" copyLabel="Copy the clone command" />
      </details>
    </div>
  );
}

function Prerequisites() {
  return (
    <>
      <p data-testid="local-prerequisites" className="text-ink">
        {LOCAL_PREREQUISITES}
      </p>
      <PrerequisiteRows />
    </>
  );
}

function PrerequisiteRows() {
  return (
    <table className="mt-2 w-full text-left text-xs">
      <thead className="text-ink-muted">
        <tr>
          <th scope="col" className="pb-1 font-normal">
            Requirement
          </th>
          <th scope="col" className="px-2 pb-1 font-normal">
            Check
          </th>
          <th scope="col" className="pb-1 font-normal">
            Install
          </th>
        </tr>
      </thead>
      <tbody>
        {PREREQUISITE_ROWS.map((row) => (
          <tr key={row.check} data-testid="prerequisite" className="border-t border-line">
            <td className="py-1.5 text-ink">{row.requirement}</td>
            <td className="px-2 py-1.5">
              <code data-testid="check-command" className="whitespace-nowrap rounded-sm border border-line bg-canvas px-1.5 py-0.5 font-mono text-ink">
                {row.check}
              </code>
            </td>
            <td className="whitespace-nowrap py-1.5">
              <a href={row.install} target="_blank" rel="noreferrer" className={link}>
                {row.link}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The command in a box with its Copy button.
function CommandBox({ command, testId, copyLabel }: { command: string; testId: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-line bg-surface p-2">
      <code data-testid={testId} className="min-w-0 flex-1 font-mono text-xs leading-5 text-ink">
        {pieces(command).map((parts, w) => (
          <Fragment key={w}>
            {w > 0 && ' '}
            {parts.map((p, i) => (
              <Fragment key={i}>
                {i > 0 && <wbr />}
                <span data-piece className="whitespace-nowrap">
                  {p}
                </span>
              </Fragment>
            ))}
          </Fragment>
        ))}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copyLabel}
        title={copyLabel}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-ink pointer-coarse:h-11 pointer-coarse:w-11"
      >
        {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-accent" strokeWidth={2} /> : <Copy aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />}
      </button>
    </div>
  );
}
