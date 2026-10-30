import { Check, Copy } from 'lucide-react';
import { Fragment, useState } from 'react';
import { LOCAL_PREREQUISITES, LOCAL_START_COMMAND, PREREQUISITE_ROWS } from './command.ts';

// The command split at spaces and after each slash. Each piece stays on one line (no break
// inside a token), and a line may break only at a space or after a slash. The text content is
// still exactly LOCAL_START_COMMAND.
const PIECES = LOCAL_START_COMMAND.split(' ').map((word) => word.split(/(?<=\/)/));

const link = 'text-ink underline underline-offset-2 hover:text-accent';

// LOCAL_PREREQUISITES, then one row per tool (what it needs, the command that prints the
// installed version in a code box that never wraps, the install link), then LOCAL_START_COMMAND
// with a Copy button. Every screen that shows the command shows it through this: the local-run
// panel and the runner-down screen.
export function LocalCommand() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(LOCAL_START_COMMAND);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div>
      <p data-testid="local-prerequisites" className="text-ink">
        {LOCAL_PREREQUISITES}
      </p>
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
      <div className="mt-2 flex items-start gap-2 rounded-md border border-line bg-surface p-2">
        <code data-testid="local-command" className="min-w-0 flex-1 font-mono text-xs leading-5 text-ink">
          {PIECES.map((parts, w) => (
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
          aria-label="Copy command"
          title="Copy command"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-ink pointer-coarse:h-11 pointer-coarse:w-11"
        >
          {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-accent" strokeWidth={2} /> : <Copy aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  );
}
