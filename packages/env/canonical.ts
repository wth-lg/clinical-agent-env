// One key order for every resource (verifier P17i W0-1c V1). The overlays write a resource in the
// order their literals list its keys and Synthea in its own, and the read tools hand the agent the
// stored object, so the order of a dosage's keys alone told a planted order from a generated one.
// fixtures:build lists every key of every resource, at every depth, in FHIR element order: the order
// of the elements in the R4 StructureDefinitions (the bundle fixtures/definitions-pruned.json holds),
// resourceType first, a primitive's _extension after it, and a key no definition names last, by name.
type Json = Record<string, unknown>;
type Element = { path: string; type?: Array<{ code: string }>; contentReference?: string };
type Bundle = { entry: Array<{ resource: { resourceType: string; kind?: string; id?: string; snapshot?: { element: Element[] } } }> };
type Child = { name: string; choice: boolean; types: string[]; ref?: string };

export function fhirOrder(bundle: Bundle): <T>(resource: T) => T {
  // Each element path's children, in definition order: 'Dosage' -> sequence, text, ..., timing, ...
  const children = new Map<string, Child[]>();
  const resources = new Set<string>();
  for (const { resource: sd } of bundle.entry) {
    if (sd.resourceType !== 'StructureDefinition' || !sd.snapshot) continue;
    if (sd.kind === 'resource' && sd.id) resources.add(sd.id);
    for (const e of sd.snapshot.element) {
      const dot = e.path.lastIndexOf('.');
      if (dot < 0) continue;
      const parent = e.path.slice(0, dot);
      const name = e.path.slice(dot + 1);
      const list = children.get(parent) ?? [];
      list.push({ name: name.replace(/\[x\]$/, ''), choice: name.endsWith('[x]'), types: (e.type ?? []).map((t) => t.code), ...(e.contentReference ? { ref: e.contentReference.slice(e.contentReference.indexOf('#') + 1) } : {}) });
      children.set(parent, list);
    }
  }
  const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // The definition path a key's value is read against: a backbone element's own path, a complex
  // type's name, a contained resource's type; undefined for a primitive or an unknown key.
  function childPath(at: string, c: Child, key: string, value: unknown): string | undefined {
    if (c.ref) return c.ref;
    if (children.has(`${at}.${c.name}`)) return `${at}.${c.name}`;
    const type = c.choice ? c.types.find((t) => `${c.name}${upper(t)}` === key) : c.types[0];
    if (type === 'Resource' && value !== null && typeof value === 'object') return (value as Json).resourceType as string | undefined;
    return type && children.has(type) ? type : undefined;
  }

  function sort(v: unknown, at: string | undefined): unknown {
    if (Array.isArray(v)) return v.map((x) => sort(x, at));
    if (v === null || typeof v !== 'object') return v;
    const o = v as Json;
    const path = at ?? (typeof o.resourceType === 'string' && resources.has(o.resourceType) ? o.resourceType : undefined);
    const defs = path === undefined ? [] : (children.get(path) ?? []);
    const rank = new Map<string, { i: number; next: string | undefined }>();
    for (const k of Object.keys(o)) {
      const bare = k.startsWith('_') ? k.slice(1) : k;
      const i = defs.findIndex((c) => (c.choice ? c.types.some((t) => `${c.name}${upper(t)}` === bare) : c.name === bare));
      rank.set(k, { i: k === 'resourceType' ? -1 : i < 0 ? defs.length : i, next: i < 0 || k.startsWith('_') ? undefined : childPath(path!, defs[i]!, k, o[k]) });
    }
    const keys = Object.keys(o).sort((a, b) => {
      const [ra, rb] = [rank.get(a)!, rank.get(b)!];
      if (ra.i !== rb.i) return ra.i - rb.i;
      // The same element: the value before its _extension; two unknown keys by name.
      const [ba, bb] = [a.replace(/^_/, ''), b.replace(/^_/, '')];
      return ba !== bb ? (ba < bb ? -1 : 1) : a.startsWith('_') ? 1 : -1;
    });
    // A contained resource reads against its own type; an object under an unknown key, by name.
    return Object.fromEntries(keys.map((k) => [k, sort(o[k], rank.get(k)!.next)]));
  }
  return <T>(resource: T): T => sort(resource, undefined) as T;
}
