// A task's id registry (packages/env/overlay.ts, "Planted ids"), as graders, solutions and tests
// use it: id(key) is the world id of the planted resource the registry key names, ref('Type/key')
// its reference. An unknown key is a type error, and throws.
export type PlantedIds = Readonly<Record<string, string>>;

export function planted<const T extends PlantedIds>(ids: T) {
  type Key = keyof T & string;
  const id = (key: Key): string => {
    if (!Object.hasOwn(ids, key)) throw new Error(`no planted resource '${key}' in the registry`);
    return ids[key]!;
  };
  const ref = (reference: `${string}/${Key}`): string => {
    const slash = reference.indexOf('/');
    return `${reference.slice(0, slash)}/${id(reference.slice(slash + 1) as Key)}`;
  };
  return { id, ref };
}
