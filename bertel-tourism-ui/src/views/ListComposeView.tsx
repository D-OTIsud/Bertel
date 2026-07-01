'use client';

// Module Listes — composition d'une liste (éditeur à gauche + aperçu brandé live à droite).
// Lecture/écriture via les RPC DEFINER. L'aperçu utilise OtiTemplate (le MÊME rendu que la
// page publique), dans le canal choisi (email étroit / PDF A4 / lien web) et la langue choisie.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, Globe, Link2, Loader2, Mail, Printer, Trash2, X } from 'lucide-react';
import OtiTemplate, { itemsToOtiPois } from '@/features/lists/OtiTemplate';
import { useSessionStore } from '@/store/session-store';
import {
  deleteList,
  getList,
  setListItems,
  shareList,
  updateList,
  type ListTemplate,
  type ObjectListItem,
} from '@/services/lists';
import { cn } from '@/lib/utils';

type Channel = 'email' | 'pdf' | 'web';
const TEMPLATES: Array<{ k: ListTemplate; label: string }> = [
  { k: 'carnet', label: 'Carnet' },
  { k: 'grille', label: 'Grille' },
  { k: 'itineraire', label: 'Itinéraire' },
];

export default function ListComposeView({ listId }: { listId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userName = useSessionStore((s) => s.userName);

  const detailQuery = useQuery({ queryKey: ['list', listId], queryFn: () => getList(listId) });
  const detail = detailQuery.data ?? null;

  const [name, setName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [intro, setIntro] = useState('');
  const [items, setItems] = useState<ObjectListItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [template, setTemplate] = useState<ListTemplate>('carnet');
  const [channel, setChannel] = useState<Channel>('email');
  const [previewLang, setPreviewLang] = useState<'fr' | 'en'>('fr');

  useEffect(() => {
    if (!detail) return;
    setName(detail.name);
    setRecipient(detail.recipientLabel ?? '');
    setIntro(detail.lang === 'en' ? (detail.introEn ?? '') : (detail.introFr ?? ''));
    setItems(detail.items);
    setTemplate(detail.template);
    setPreviewLang(detail.lang);
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
        items.map((it, i) => ({ object_id: it.objectId, position: i, note_fr: it.noteFr, note_en: it.noteEn })),
      ),
    onSuccess: invalidate,
  });
  const share = useMutation({ mutationFn: (enable: boolean) => shareList(listId, enable), onSuccess: invalidate });
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
        <Link href="/listes" className="font-semibold text-orange hover:underline">← Retour aux listes</Link>
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
        it.objectId === objectId ? { ...it, ...(detail?.lang === 'en' ? { noteEn: value } : { noteFr: value }) } : it,
      ),
    );
  }
  function chooseTemplate(k: ListTemplate) {
    setTemplate(k);
    if (k !== detail?.template) updateMeta.mutate({ template: k });
  }

  const dirtyItems =
    JSON.stringify(items.map((i) => [i.objectId, i.noteFr, i.noteEn])) !==
    JSON.stringify(detail.items.map((i) => [i.objectId, i.noteFr, i.noteEn]));

  // Aperçu : nom + intro résolus dans la langue d'aperçu (peut différer de la langue de saisie).
  const previewName = previewLang === 'en' ? (detail.nameEn ?? name) : name;
  const previewIntro =
    previewLang === detail.lang ? intro : previewLang === 'en' ? (detail.introEn ?? '') : (detail.introFr ?? '');
  const previewWidth = channel === 'email' ? 'max-w-[640px]' : channel === 'pdf' ? 'max-w-[794px]' : 'max-w-[1000px]';

  const seg = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Barre d'action */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/listes" className="grid h-9 w-9 place-items-center rounded-lg border text-ink/70 hover:bg-ink/5" aria-label="Retour aux listes">
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

        {/* Modèle + Canal + Langue */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-ink/5 p-0.5">
            <span className="px-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/40">Modèle</span>
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.k}
                type="button"
                onClick={() => chooseTemplate(tpl.k)}
                className={cn(seg, template === tpl.k ? 'bg-white text-orange shadow-sm' : 'text-ink/60 hover:text-ink')}
              >
                {tpl.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg bg-ink/5 p-0.5">
            <button type="button" onClick={() => setChannel('email')} className={cn(seg, channel === 'email' ? 'bg-white text-orange shadow-sm' : 'text-ink/60')}>
              <Mail className="h-3.5 w-3.5" /> Email
            </button>
            <button type="button" onClick={() => setChannel('pdf')} className={cn(seg, channel === 'pdf' ? 'bg-white text-orange shadow-sm' : 'text-ink/60')}>
              <Printer className="h-3.5 w-3.5" /> PDF
            </button>
            <button type="button" onClick={() => setChannel('web')} className={cn(seg, channel === 'web' ? 'bg-white text-orange shadow-sm' : 'text-ink/60')}>
              <Globe className="h-3.5 w-3.5" /> Lien
            </button>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg bg-ink/5 p-0.5">
            {(['fr', 'en'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setPreviewLang(l)} className={cn(seg, previewLang === l ? 'bg-white text-orange shadow-sm' : 'text-ink/60')}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5">
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
            onClick={() => window.confirm('Supprimer définitivement cette liste ?') && remove.mutate()}
            className="grid h-9 w-9 place-items-center rounded-lg border text-red-500 hover:bg-red-50"
            aria-label="Supprimer la liste"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Corps : éditeur | aperçu */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(340px,420px)_1fr]">
        {/* Éditeur */}
        <div className="overflow-y-auto border-r">
          <div className="space-y-6 p-5">
            {shareUrl && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <Link2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <code className="flex-1 truncate text-[12px] text-emerald-900">{shareUrl}</code>
                <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
            )}

            <section className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-ink/50">Destinataire</label>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                onBlur={() => recipient !== (detail.recipientLabel ?? '') && updateMeta.mutate({ recipient_label: recipient })}
                placeholder="ex. Camille & Yann"
                className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-orange"
              />
              <label className="block pt-1 text-[11px] font-bold uppercase tracking-wide text-ink/50">Mot d'introduction</label>
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

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wide text-ink/50">
                  Lieux <span className="text-ink/40">({items.length})</span>
                </label>
                {!isDynamic && dirtyItems && (
                  <button
                    type="button"
                    disabled={saveItems.isPending}
                    onClick={() => saveItems.mutate()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-3 py-1.5 text-[12px] font-bold text-white hover:bg-orange/90 disabled:opacity-60"
                  >
                    {saveItems.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Enregistrer
                  </button>
                )}
              </div>

              {isDynamic && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
                  Liste <b>dynamique</b> : ces lieux proviennent des filtres et se mettent à jour automatiquement.
                </div>
              )}

              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-ink/50">
                  Aucun lieu. Ajoutez-en depuis l'explorateur (sélection → « Créer une liste »).
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((it, i) => (
                    <li key={it.objectId} className="flex gap-3 rounded-xl border bg-white p-2.5">
                      <span
                        className="h-12 w-14 shrink-0 rounded-lg bg-ink/10 bg-cover bg-center"
                        style={{ backgroundImage: it.card?.image ? `url("${it.card.image}")` : undefined }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold tabular-nums text-ink/40">{String(i + 1).padStart(2, '0')}</span>
                          <span className="truncate text-[13px] font-bold text-ink">{it.card?.name ?? it.objectId}</span>
                          {it.card?.city && <span className="truncate text-[11.5px] text-ink/50">{it.card.city}</span>}
                        </div>
                        {!isDynamic && (
                          <input
                            value={(detail.lang === 'en' ? it.noteEn : it.noteFr) ?? ''}
                            onChange={(e) => setNote(it.objectId, e.target.value)}
                            placeholder="Note (coup de cœur)…"
                            className="mt-1.5 w-full rounded-lg bg-ink/5 px-2.5 py-1.5 text-[12px] outline-none focus:bg-ink/10"
                          />
                        )}
                      </div>
                      {!isDynamic && (
                        <button
                          type="button"
                          onClick={() => removeItem(it.objectId)}
                          className="grid h-7 w-7 shrink-0 place-items-center self-start rounded-lg text-ink/40 hover:bg-red-50 hover:text-red-500"
                          aria-label="Retirer"
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

        {/* Aperçu live */}
        <div className="relative hidden min-h-0 flex-col overflow-hidden bg-[#e8e2d6] lg:flex">
          <span className="absolute left-1/2 top-3 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink/80 px-3 py-1 text-[11px] font-bold text-white backdrop-blur">
            {channel === 'email' ? <Mail className="h-3 w-3" /> : channel === 'pdf' ? <Printer className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
            Aperçu {channel === 'email' ? 'email' : channel === 'pdf' ? 'PDF' : 'page web'} · {previewLang.toUpperCase()}
          </span>
          <div className="flex-1 overflow-auto p-6 pt-12">
            <div className={cn('mx-auto w-full overflow-hidden rounded-2xl shadow-xl', previewWidth)}>
              <OtiTemplate
                template={template}
                lang={previewLang}
                accent={detail.accent}
                name={previewName}
                recipient={recipient || null}
                intro={previewIntro}
                coverUrl={detail.coverUrl}
                items={itemsToOtiPois(items, previewLang)}
                narrow={channel === 'email'}
                showMap={detail.showMap}
                advisorName={userName}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
