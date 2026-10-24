import { Check, Copy } from 'lucide-react';
import { Fragment, useState } from 'react';
import { LOCAL_PREREQUISITES, LOCAL_START_COMMAND, NODE_CHECK_COMMAND, NODE_INSTALL_URL, PNPM_CHECK_COMMAND, PNPM_INSTALL_URL } from './command.ts';

// The command split at spaces and after each slash. Each piece stays on one line (no break
// inside a token), and a line may break only at a space or after a slash. The text content is
// still exactly LOCAL_START_COMMAND.
const PIECES = LOCAL_START_COMMAND.split(' ').map((word) => word.split(/(?<=\/)/));

const link = 'text-ink underline underline-offset-2 hover:text-accent';

// LOCAL_PREREQUISITES with the two install links and the version checks, then
// LOCAL_START_COMMAND with a Copy button. Every screen that shows the command shows it through
// this: the local-run panel, the org-CORS note and the runner-down screen.
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
      <p className="mt-1 text-xs text-ink-muted">
        <a href={NODE_INSTALL_URL} target="_blank" rel="noreferrer" className={link}>
          Install Node.js
        </a>
        {' · '}
        <a href={PNPM_INSTALL_URL} target="_blank" rel="noreferrer" className={link}>
          Install pnpm
        </a>
        {' · '}
        To see the installed versions, run <code className="font-mono">{NODE_CHECK_COMMAND}</code> and <code className="font-mono">{PNPM_CHECK_COMMAND}</code>.
      </p>
      <div className="mt-2 flex items-start gap-2 rounded-sm border border-line bg-surface p-2">
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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-canvas hover:text-ink"
        >
          {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-accent" strokeWidth={2} /> : <Copy aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  );
}
