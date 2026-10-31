"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Mail, TriangleAlert, Users } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import {
  getPortalLaunch,
  invitePortalLaunchGroup,
  selectPortalLaunchActors,
  sendPortalLaunchTest,
  type PortalLaunchResult,
  type PortalLaunchActor,
} from "../../services/portal-launch";
import { registerNavigationGuard } from "../../lib/navigation-guard";

const GROUPS = [
  { label: "Hébergements", types: ["HOT", "HPA", "HLO", "CAMP", "RVA"] },
  { label: "Restaurants", types: ["RES"] },
  { label: "Loisirs et sites de visite", types: ["LOI", "PCU", "PNA"] },
  { label: "Activités", types: ["ASC", "ACT"] },
  { label: "Producteurs", types: ["PRD"] },
  { label: "Services touristiques", types: ["PSV", "COM", "SPU"] },
];
export function PortalLaunchConsole({
  orgId,
  onShowSections,
}: {
  orgId: string;
  onShowSections: () => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["portal-launch", orgId],
    queryFn: () => getPortalLaunch(orgId),
    refetchOnWindowFocus: true,
  });
  const [groups, setGroups] = useState<string[]>([]),
    [commune, setCommune] = useState(""),
    [limit, setLimit] = useState(20),
    [excludeInvited, setExcludeInvited] = useState(true);
  const [preview, setPreview] = useState(false),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [testBusy, setTestBusy] = useState(false);
  const [results, setResults] = useState<PortalLaunchResult[]>([]),
    [notice, setNotice] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<PortalLaunchActor[]>([]);
  const data = query.data;
  const selected = useMemo(
    () =>
      selectPortalLaunchActors(data?.actors ?? [], {
        types: GROUPS.filter((item) => groups.includes(item.label)).flatMap(
          (item) => item.types,
        ),
        commune,
        limit: limit || null,
        excludeInvited,
      }),
    [data, groups, commune, limit, excludeInvited],
  );
  const communes = useMemo(
    () =>
      [
        ...new Set((data?.actors ?? []).flatMap((actor) => actor.communes)),
      ].sort((a, b) => a.localeCompare(b, "fr")),
    [data],
  );
  useEffect(() => {
    if (!busy) return;
    const unregister = registerNavigationGuard(() => false);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [busy]);
  if (query.isPending)
    return <p role="status">Chargement de l’espace partenaire…</p>;
  if (query.isError || !data)
    return (
      <div className="notice" role="alert">
        <p>
          {query.error instanceof Error
            ? query.error.message
            : "La console est indisponible."}
        </p>
        <button className="ghost-button" onClick={() => void query.refetch()}>
          Réessayer
        </button>
      </div>
    );
  const contactsReady = !!data.office.email && !!data.office.phone;
  const blockers = [
    !contactsReady,
    !data.smtp.configured,
    !data.applicationConfigured,
    data.canInvite === false,
  ].filter(Boolean).length;
  const cards = [
    {
      title: "Coordonnées publiques de l’office",
      ready: contactsReady,
      text: contactsReady
        ? "E-mail et téléphone affichés dans l’espace de chaque partenaire."
        : "Complétez l’e-mail et le téléphone publics de votre office.",
      href: `/objects/${encodeURIComponent(orgId)}/edit`,
      action: contactsReady ? "Modifier" : "Compléter",
    },
    {
      title: "E-mail d’invitation",
      ready: true,
      text: "Au nom de l’office, avec le nom de la fiche et le délai de relecture.",
      action: "Voir le nouvel e-mail",
      run: () => setPreview(true),
    },
    {
      title: "Parcours d’invitation testé",
      ready: data.stats.activated > 0,
      check: true,
      text:
        data.stats.activated > 0
          ? "Un premier partenaire a activé son compte."
          : "Vérifiez l’e-mail avec un test, puis le choix du mot de passe avec un compte partenaire.",
      action: "M’envoyer un test",
      run: async () => {
        setTestBusy(true);
        setNotice(null);
        try {
          await sendPortalLaunchTest(orgId);
          setNotice(
            "E-mail de test envoyé à votre adresse de connexion. Son lien ouvre la connexion ; vérifiez ensuite le parcours complet avec un compte partenaire.",
          );
        } catch (error) {
          setNotice(
            error instanceof Error ? error.message : "Le test a échoué.",
          );
        } finally {
          setTestBusy(false);
        }
      },
    },
    {
      title: "Envoi depuis l’adresse de l’office",
      ready: data.smtp.configured,
      text: data.smtp.configured
        ? data.smtp.tested
          ? "Relais de l’office configuré et testé."
          : "Relais activé. Testez sa connexion avant le premier groupe."
        : "Configurez le SMTP de l’office avant toute invitation.",
      href: "/settings?section=org-smtp",
      action: "Configurer",
    },
    {
      title: "Adresse de l’application",
      ready: data.applicationConfigured,
      text: data.applicationConfigured
        ? "Les liens utilisent l’adresse de l’application en ligne."
        : "L’adresse de l’application doit être renseignée sur le serveur avant le lancement.",
      action: null,
    },
    {
      title: "Rubriques ouvertes par type de fiche",
      ready: true,
      text: "Chaque type de fiche voit les rubriques qui le concernent.",
      action: "Ajuster",
      run: onShowSections,
    },
    {
      title: "Relecture des envois",
      ready: true,
      text: "Chaque envoi crée une tâche dans Modération. Délai annoncé : en général sous une semaine.",
      href: "/moderation",
      action: "Ouvrir Modération",
    },
    ...(data.canInvite === false
      ? [
          {
            title: "Droit d’inviter des partenaires",
            ready: false,
            text: "Votre compte peut consulter le suivi. Demandez à un administrateur de vous accorder la gestion des accès partenaires.",
            action: null,
          },
        ]
      : []),
  ];
  const resetFilters = () => setResults([]);
  async function sendGroup() {
    if (busy || blockers || !recipients.length) return;
    setConfirm(false);
    setBusy(true);
    setResults([]);
    setNotice(null);
    try {
      await invitePortalLaunchGroup(recipients, (result) =>
        setResults((current) => [...current, result]),
      );
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({
        queryKey: ["portal-launch", orgId],
      });
    }
  }
  const sent = results.filter((result) => result.sent).length;
  return (
    <div className="portal-launch">
      <header className="portal-launch__head">
        <div>
          <p className="eyebrow">Espace partenaire</p>
          <h2>Lancer l’espace partenaire</h2>
          <p className="muted">
            {data.stats.reachable} partenaires joignables par e-mail peuvent
            mettre à jour leurs fiches eux-mêmes.
          </p>
        </div>
        <span
          className={`status-pill ${blockers ? "status-pill--warning" : "status-pill--ok"}`}
        >
          {blockers
            ? `${blockers} point${blockers > 1 ? "s" : ""} bloquant${blockers > 1 ? "s" : ""}`
            : "Prêt à lancer"}
        </span>
      </header>
      <div className="portal-launch__main">
        <section aria-labelledby="portal-launch-ready">
          <h3 id="portal-launch-ready">Prêt à lancer ?</h3>
          <p className="muted">
            {blockers
              ? "Réglez les points bloquants avant d’envoyer les premières invitations."
              : "Les prérequis sont en place. Commencez par un petit groupe."}
          </p>
          <div className="portal-launch__checks">
            {cards.map((card) => (
              <div key={card.title} className="portal-launch__check">
                {card.ready ? (
                  <CheckCircle2 aria-hidden />
                ) : (
                  <TriangleAlert aria-hidden />
                )}
                <div>
                  <span className="eyebrow">
                    {card.ready
                      ? "Prêt"
                      : card.check
                        ? "À vérifier"
                        : "Bloquant"}
                  </span>
                  <h4>{card.title}</h4>
                  <p>{card.text}</p>
                </div>
                {card.action ? (
                  card.href ? (
                    <a className="ghost-button" href={card.href}>
                      {card.action}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy || testBusy}
                      onClick={() => void card.run?.()}
                    >
                      {card.action}
                    </button>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="portal-launch-adoption">
          <h3 id="portal-launch-adoption">Adoption</h3>
          {data.reminderFailures?<p className="notice" role="status">{data.reminderFailures} relance(s) à vérifier dans le CRM avant un renvoi manuel.</p>:null}
          <p className="muted">Du partenaire joignable au premier envoi.</p>
          <dl className="portal-launch__metrics">
            {[
              ["Joignables par e-mail", data.stats.reachable],
              ["Invités", data.stats.invited],
              ["Compte activé", data.stats.activated],
              ["Premier envoi à l’office", data.stats.submitted],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
                <span className="portal-launch__bar" aria-hidden>
                  <span
                    style={{
                      width: `${(100 * Number(value)) / Math.max(data.stats.reachable, 1)}%`,
                    }}
                  />
                </span>
              </div>
            ))}
          </dl>
          <p className="muted">
            {data.remindersEnabled
              ? "Un partenaire qui n’a pas activé son compte au bout de 7 jours reçoit une relance, une seule."
              : "Les relances automatiques sont désactivées sur ce serveur."}
          </p>
          <div className="portal-launch__review">
            <p>
              En attente de relecture <strong>{data.pending}</strong>
            </p>
            <p>
              Délai moyen de relecture{" "}
              <strong>
                {data.averageReviewDays === null
                  ? "—"
                  : `${data.averageReviewDays} jour${data.averageReviewDays > 1 ? "s" : ""}`}
              </strong>
            </p>
          </div>
        </section>
      </div>
      {notice ? (
        <p role="status" className="notice">
          {notice}
        </p>
      ) : null}
      <section aria-labelledby="portal-launch-group">
        <h3 id="portal-launch-group">
          <Users aria-hidden /> Inviter un groupe
        </h3>
        <p className="muted">
          Commencez petit : 10 à 20 partenaires que vous connaissez bien, le
          temps de roder la relecture.
        </p>
        <fieldset disabled={busy} className="portal-launch__filters">
          <fieldset className="portal-launch__types">
            <legend>Type de fiche</legend>
            <div>
              {GROUPS.map((item) => (
                <label key={item.label}>
                  <input
                    type="checkbox"
                    checked={groups.includes(item.label)}
                    onChange={() => {
                      setGroups((current) =>
                        current.includes(item.label)
                          ? current.filter((label) => label !== item.label)
                          : [...current, item.label],
                      );
                      resetFilters();
                    }}
                  />
                  {item.label}
                  <span className="muted">
                    {
                      data.actors.filter((actor) =>
                        actor.types.some((type) => item.types.includes(type)),
                      ).length
                    }
                  </span>
                </label>
              ))}
            </div>
            <p className="muted">
              Nombre de partenaires joignables par type. Aucun type coché : tous
              les types.
            </p>
          </fieldset>
          <label>
            Commune
            <select
              className="input"
              value={commune}
              onChange={(event) => {
                setCommune(event.target.value);
                resetFilters();
              }}
            >
              <option value="">Toutes les communes</option>
              {communes.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            Taille du groupe
            <select
              className="input"
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                resetFilters();
              }}
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size} partenaires
                </option>
              ))}
              <option value={0}>Tous</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={excludeInvited}
              onChange={(event) => {
                setExcludeInvited(event.target.checked);
                resetFilters();
              }}
            />
            Exclure les partenaires déjà invités
          </label>
        </fieldset>
        <p>
          <strong>
            {selected.length} partenaire{selected.length > 1 ? "s" : ""}
          </strong>{" "}
          recevront l’e-mail de l’office.
        </p>
        <div className="portal-launch__buttons">
          <button
            className="ghost-button"
            disabled={busy}
            onClick={() => setPreview(true)}
          >
            <Mail aria-hidden /> Aperçu de l’e-mail
          </button>
          <button
            className="primary-button"
            disabled={busy || blockers > 0 || !selected.length}
            onClick={() => {
              setRecipients([...selected]);
              setConfirm(true);
            }}
          >
            {busy
              ? `${results.length} invitation(s) traitée(s)…`
              : `Inviter ${selected.length} partenaire${selected.length > 1 ? "s" : ""}`}
          </button>
        </div>
        {blockers ? (
          <p className="muted">
            Possible dès que les {blockers} points bloquants sont réglés.
          </p>
        ) : null}
        {results.length ? (
          <div role="status">
            <p>
              {sent} e-mail{sent > 1 ? "s" : ""} envoyé{sent > 1 ? "s" : ""}
              {results.length > sent
                ? ` · ${results.length - sent} échec(s)`
                : ""}
              .
            </p>
            <ul>
              {results
                .filter((result) => !result.sent || result.trackingFailed)
                .map((result) => (
                  <li key={result.actorId}>
                    {result.name} :{" "}
                    {result.trackingFailed
                      ? "e-mail envoyé, mais le suivi de la relance n’a pas pu être enregistré."
                      : result.error}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </section>
      <Modal
        open={preview}
        onOpenChange={setPreview}
        title="E-mail d’invitation"
        size="wide"
      >
        <iframe
          title="Aperçu de l’e-mail d’invitation"
          srcDoc={data.invitationHtml}
          sandbox=""
          className="portal-launch__email"
        />
      </Modal>
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title={`Inviter ${recipients.length} partenaires`}
        footer={
          <>
            <button className="ghost-button" onClick={() => setConfirm(false)}>
              Annuler
            </button>
            <button className="primary-button" onClick={() => void sendGroup()}>
              Envoyer les invitations
            </button>
          </>
        }
      >
        <p>Ces partenaires recevront l’e-mail de {data.office.name}.</p>
        <ul className="portal-launch__recipients">
          {recipients.map((actor) => (
            <li key={actor.actor_id}>
              <strong>{actor.actor_name}</strong>
              <br />
              {actor.email}
              {actor.user_id ? " · Nouvelle invitation" : ""}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
