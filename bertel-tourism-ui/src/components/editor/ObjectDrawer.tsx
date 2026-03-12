import { ObjectDrawerShell } from '../../features/object-drawer/ObjectDrawerShell';

interface ObjectDrawerProps {
  objectId: string | null;
}

export function ObjectDrawer({ objectId }: ObjectDrawerProps) {
  return <ObjectDrawerShell objectId={objectId} />;
}