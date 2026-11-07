import { TAB_ACTIVE } from '../data/ui.tsx';
import { VIEWS, viewHref, type View } from './views.ts';

// The views. From sm up, the 76px icon rail; below sm, a grid of four columns under the top bar,
// so all seven views are on screen in two rows (P25u V5: the strip scrolled sideways and hid
// three views behind a fade). Links carry ?view= so a view can be shared and survives a refresh.
// Each link's name is its visible label, in full (WCAG 2.5.3), and each is at least 44px tall.
// The label is 11px with normal tracking; the longest, "Environment", is 65px, so the rail item is
// 70px and the rail 76px (verifier-phase-P17i-UI-1-1 F2: at 64px it touched both edges). The
// active one is the shared pill (data/ui.tsx TAB_ACTIVE, stone-200 at 80%, as the reference
// sidebar's active button), with a 2px accent bar on its left edge on the rail and its bottom
// edge on the grid.
export function Rail({ active, onNavigate }: { active: View; onNavigate: (id: string) => void }) {
  return (
    <nav aria-label="Views" className="shrink-0 border-b border-line bg-surface sm:w-[76px] sm:border-r sm:border-b-0">
      <div className="grid grid-cols-4 gap-1 px-2 py-1 sm:flex sm:flex-col sm:items-center sm:px-0 sm:py-2">
        {VIEWS.map((v) => {
          const current = v.id === active.id;
          const Icon = v.icon;
          return (
            <a
              key={v.id}
              href={viewHref(location.href, v.id)}
              aria-current={current ? 'page' : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onNavigate(v.id);
              }}
              className={`relative flex h-11 min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 text-[11px] leading-none before:absolute before:rounded-full before:bg-accent sm:w-[70px] sm:px-0 ${
                current
                  ? `${TAB_ACTIVE} before:inset-x-3 before:bottom-0 before:h-0.5 sm:before:inset-x-auto sm:before:inset-y-2 sm:before:left-0 sm:before:h-auto sm:before:w-0.5`
                  : 'text-ink-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              <Icon aria-hidden className={`h-4 w-4 shrink-0 ${current ? 'text-accent' : ''}`} strokeWidth={1.75} />
              <span>{v.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
