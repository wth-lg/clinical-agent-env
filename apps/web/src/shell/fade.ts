// The leave half of the hover fade (verifier-phase-P17i-UI-1-1 F5). app.css fades a link, button or
// summary while it is hovered or focused; when the pointer or focus leaves one, it carries
// data-fading for the length of the fade, so it fades back too. Only the control just left carries
// it, and a light/dark switch clears every mark, so the switch still repaints at once rather than
// fading through mixed colours (which axe would read as low contrast).
const CONTROL = 'a, button, summary';
const FADE_MS = 160;

export function installLeaveFade(doc: Document = document): void {
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  const clear = (el: Element) => {
    clearTimeout(timers.get(el));
    timers.delete(el);
    el.removeAttribute('data-fading');
  };
  const leave = (e: Event) => {
    const el = e.target instanceof Element ? e.target.closest(CONTROL) : null;
    // pointerout also fires when the pointer moves onto a child (an icon); that is not a leave.
    const to = (e as PointerEvent | FocusEvent).relatedTarget;
    if (el === null || (to instanceof Node && el.contains(to))) return;
    clearTimeout(timers.get(el));
    el.setAttribute('data-fading', '');
    timers.set(el, setTimeout(() => clear(el), FADE_MS));
  };
  doc.addEventListener('pointerout', leave, { passive: true });
  doc.addEventListener('focusout', leave);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => [...timers.keys()].forEach(clear));
}
