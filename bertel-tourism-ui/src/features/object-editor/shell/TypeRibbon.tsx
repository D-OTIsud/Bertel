import type { ArchetypeMeta } from '../archetypes';

/** Accent band under the topbar: archetype identity + the type codes it covers. */
export function TypeRibbon({ meta }: { meta: ArchetypeMeta }) {
  return (
    <div className={`type-ribbon ${meta.accent}`}>
      <span className="blob" />
      <span>
        <strong>{meta.codeName}</strong> · {meta.family}
      </span>
      <span className="meta">{meta.covers}</span>
    </div>
  );
}
