import { SkeletonBlock } from '../../../../../components/common/SkeletonBlock';

export default function ObjectEditLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Chargement de la fiche" className="editor-loading">
      <div className="editor-loading__topbar" aria-hidden="true">
        <SkeletonBlock className="h-6 w-48 rounded-shellSm" />
        <SkeletonBlock className="h-8 w-24 rounded-shellMd" />
      </div>
      <div className="editor-loading__body">
        <div className="editor-loading__rail" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <SkeletonBlock key={index} className="h-8 w-full rounded-shellSm" />
          ))}
        </div>
        <div className="editor-loading__form" aria-hidden="true">
          <SkeletonBlock className="h-40 w-full rounded-shellLg" />
          <SkeletonBlock className="h-24 w-full rounded-shellLg" />
          <SkeletonBlock className="h-24 w-full rounded-shellLg" />
        </div>
      </div>
    </div>
  );
}
