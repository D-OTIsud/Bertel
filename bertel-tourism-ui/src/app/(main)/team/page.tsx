import { redirect } from 'next/navigation';

// 7.4 — l'administration d'équipe emménage dans Paramètres → Mon organisation → Équipe.
// La route /team est conservée comme redirection (signets) vers le panneau du rail.
export default function TeamRoute() {
  redirect('/settings?section=team');
}
