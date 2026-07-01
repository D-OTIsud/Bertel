'use client';

// Module Listes — composition d'une liste (métadonnées + lieux + partage). Lecture/écriture
// via les RPC DEFINER (get_list / update_list / set_list_items / share_list / delete_list).
// Le rendu brandé OTI (carnet/grille/itinéraire) + l'email arrivent dans une passe ultérieure ;
// ici : éditer, partager par lien, imprimer.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, Link2, Loader2, Printer, Trash2, X } from 'lucide-react';
import {
  deleteList,
  getList,
  setListItems,
  shareList,
  updateList,
  type ObjectListItem,
} from '@/services/lists';
import { cn } from '@/lib/utils';

interface Props {
  listId: string;
}

export default function ListComposeView({ listId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({ queryKey: ['list', listId], queryFn: () => getList(listId) });
  const detail = detailQuery.data ?? null;

  const [name, setName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [intro, setIntro] = useState('');
  const [items, setItems] = useState<ObjectListItem[]>([]);
  const [copied, setCopied] = useState(false);

  // Sync l'état local quand la liste (re)charge.
  useEffect(() => {
    if (!detail) return;
    setName(detail.name);
    setRecipient(detail.recipientLabel ?? '');
    setIntro(detail.lang === 'en' ? (detail.introEn ?? '') : (detail.introFr ?? ''));
    setItems(detail.items);
  }, [detail]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['list', listId] });
    void queryClient.invalidateQueries({ queryKey: ['my-lists'] });
  };

  const updateMeta = useMutation({
    mutationFn: (patch: Parameters<typeof updateList>[1]) => updateList(listId, patch),
    onSuccess: invalidate,
  });
  const saveItems = useMutation({
    mutationFn: () =>
      setListItems(
        listId,
        items.map((it, i) => ({
          object_id: it.objectId,
          position: i,
          note_fr: it.noteFr,
          note_en: it.noteEn,
        })),
      ),
    onSuccess: invalidate,
  });
  const share = useMutation({
    mutationFn: (enable: boolean) => shareList(listId, enable),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => deleteList(listId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-lists'] });
      router.push('/listes');
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-ink/50">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement de la liste…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink/60">
        <p>Liste introuvable ou inaccessible.</p>
        <Link href="/listes" className="font-semibold text-orange hover:underline">
          ← Retour aux listes
        </Link>
      </div>
    );
  }

  const isDynamic = detail.kind === 'dynamic';
  const shareUrl =
    detail.shareEnabled && detail.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/l/${detail.shareToken}`
      : null;

  function copyLink() {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function removeItem(objectId: string) {
    setItems((prev) => prev.filter((it) => it.objectId !== objectId));
  }
  function setNote(objectId: string, value: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.objectId === objectId
          ? { ...it, ...(detail?.lang === 'en' ? { noteEn: value } : { noteFr: value }) }
          : it,
      ),
    );
  }

  const dirtyItems =
    JSON.stringify(items.map((i) => [i.objectId, i.noteFr, i.noteEn])) !==
    JSON.stringify(detail.items.map((i) => [i.objectId, i.noteFr, i.noteEn]));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Barre d'action */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/listes"
            className="grid h-9 w-9 place-items-center rounded-lg border text-ink/70 hover:bg-ink/5"
            aria-label="Retour aux listes"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== detail.name && updateMeta.mutate({ name })}
              className="w-full truncate rounded-md bg-transparent text-[16px] font-extrabold text-ink outline-none focus:bg-ink/5"
              placeholder="Nom de la liste"
            />
            <div className="text-[12px] text-ink/55">
              {isDynamic ? 'Liste dynamique' : 'Liste statique'} · {items.length} {items.length > 1 ? 'lieux' : 'lieu'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5"
          >
            <Printer className="h-4 w-4" /> Imprimer
          </button>
          <button
            type="button"
            disabled={share.isPending}
            onClick={() => share.mutate(!detail.shareEnabled)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white transition disabled:opacity-60',
              detail.shareEnabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange hover:bg-orange/90',
            )}
          >
            <Link2 className="h-4 w-4" /> {detail.shareEnabled ? 'Lien actif' : 'Partager par lien'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Supprimer définitivement cette liste ?')) remove.mutate();
            }}
            className="grid h-9 w-9 place-items-center rounded-lg border text-red-500 hover:bg-red-50"
            aria-label="Supprimer la liste"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          {/* Lien de partage actif */}
          {shareUrl && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <Link2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <code className="flex-1 truncate text-[12.5px] text-emerald-900">{shareUrl}</code>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
          )}

          {/* Destinataire + intro */}
          <section className="space-y-3">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-ink/50">Destinataire</label>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              onBlur={() => recipient !== (detail.recipientLabel ?? '') && updateMeta.mutate({ recipient_label: recipient })}
              placeholder="ex. Camille & Yann"
              className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-orange"
            />
            <label className="block text-[11px] font-bold uppercase tracking-wide text-ink/50">Mot d'introduction</label>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              onBlur={() => {
                const cur = detail.lang === 'en' ? (detail.introEn ?? '') : (detail.introFr ?? '');
                if (intro !== cur) updateMeta.mutate(detail.lang === 'en' ? { intro_en: intro } : { intro_fr: intro });
              }}
              rows={3}
              placeholder="Un mot chaleureux pour le voyageur…"
              className="w-full resize-y rounded-xl border px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-orange"
            />
          </section>

          {/* Lieux */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wide text-ink/50">
                Lieux de la liste <span className="text-ink/40">({items.length})</span>
              </label>
              {!isDynamic && dirtyItems && (
                <button
                  type="button"
                  disabled={saveItems.isPending}
                  onClick={() => saveItems.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-3 py-1.5 text-[12px] font-bold text-white hover:bg-orange/90 disabled:opacity-60"
                >
                  {saveItems.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Enregistrer les lieux
                </button>
              )}
            </div>

            {isDynamic && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
                Liste <b>dynamique</b> : ces lieux proviennent des filtres de l'explorateur et se mettent à jour
                automatiquement. Ils ne s'éditent pas un par un.
              </div>
            )}

            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-ink/50">
                Aucun lieu. Ajoutez-en depuis l'explorateur (sélection → « Créer une liste »).
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((it, i) => (
                  <li key={it.objectId} className="flex gap-3 rounded-xl border bg-white p-3">
                    <span
                      className="h-14 w-16 shrink-0 rounded-lg bg-ink/10 bg-cover bg-center"
                      style={{ backgroundImage: it.card?.image ? `url("${it.card.image}")` : undefined }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold tabular-nums text-ink/40">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate font-bold text-ink">{it.card?.name ?? it.objectId}</span>
                        {it.card?.type && (
                          <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-bold uppercase text-ink/60">
                            {it.card.type}
                          </span>
                        )}
                        {it.card?.city && <span className="truncate text-[12px] text-ink/50">{it.card.city}</span>}
                      </div>
                      {!isDynamic && (
                        <input
                          value={(detail.lang === 'en' ? it.noteEn : it.noteFr) ?? ''}
                          onChange={(e) => setNote(it.objectId, e.target.value)}
                          placeholder="Note (le coup de cœur du conseiller)…"
                          className="mt-1.5 w-full rounded-lg bg-ink/5 px-2.5 py-1.5 text-[12.5px] outline-none focus:bg-ink/10"
                        />
                      )}
                    </div>
                    {!isDynamic && (
                      <button
                        type="button"
                        onClick={() => removeItem(it.objectId)}
                        className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-lg text-ink/40 hover:bg-red-50 hover:text-red-500"
                        aria-label="Retirer de la liste"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
