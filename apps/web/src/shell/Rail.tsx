import { VIEWS, viewHref, type View } from './views.ts';

// The views. From sm up, the 76px icon rail; below sm, a strip under the top bar that scrolls
// sideways, with a fade at its right edge so the hidden items read as more to scroll (ui-polish
// 1.5). Links carry ?view= so a view can be shared and survives a refresh. Each link's name is its
// visible label, in full (WCAG 2.5.3), and each is at least 44px tall. On the rail the label is
// 11px with normal tracking; the longest, "Environment", is 65px, so the item is 70px and the rail
// 76px (verifier-phase-P17i-UI-1-1 F2: at 64px it touched both edges). The strip has 4px above
// and below its links, so a focus ring is not clipped by its sideways scroll (F1). The active one is stone-200
// at 80% (bg-line/80), as the reference sidebar's active button, with a 2px accent bar on its left
// edge on the rail and its bottom edge on the strip.
export function Rail({ active, onNavigate }: { active: View; onNavigate: (id: string) => void }) {
  return (
    <nav aria-label="Views" className="shrink-0 border-b border-line bg-surface sm:w-[76px] sm:border-r sm:border-b-0">
      <div className="flex gap-1 overflow-x-auto px-2 py-1 pr-8 [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] sm:flex-col sm:items-center sm:overflow-visible sm:px-0 sm:py-2 sm:[mask-image:none]">
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
              className={`relative flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs before:absolute before:rounded-full before:bg-accent sm:w-[70px] sm:flex-col sm:justify-center sm:gap-1 sm:px-0 sm:text-[11px] sm:leading-none ${
                current
                  ? 'bg-line/80 font-medium text-ink before:inset-x-3 before:bottom-0 before:h-0.5 sm:before:inset-x-auto sm:before:inset-y-2 sm:before:left-0 sm:before:h-auto sm:before:w-0.5 dark:bg-line'
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
