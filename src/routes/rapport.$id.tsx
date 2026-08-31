import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { RiskBadge, StatusBadge, ThemeChip } from "@/components/risk-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCoords, formatDate, formatShortDate, formatStamp } from "@/lib/format";
import { geoLabel } from "@/lib/geo";
import { LEVEL_META } from "@/lib/kinney";
import { themeById } from "@/lib/code-bien-etre";
import { FDS_REALITY_QUESTIONS, FDS_REALITY_THEMES, hasReality } from "@/lib/fds-reality";
import { useSipr } from "@/lib/store";
import { visitLabel } from "@/lib/workspace";

export const Route = createFileRoute("/rapport/$id")({ component: Rapport });

function Rapport() {
  const { id } = Route.useParams();
  const visit = useSipr((s) => s.visits.find((v) => v.id === id));
  const allAnomalies = useSipr((s) => s.anomalies);
  const anomalies = allAnomalies.filter((a) => a.visitId === id);
  const allFds = useSipr((s) => s.fds);
  const fds = allFds.filter((f) => f.visitId === id);
  const allRps = useSipr((s) => s.rps);
  const rps = allRps.filter((r) => r.visitId === id);
  const profile = useSipr((s) => s.profile);

  if (!visit) return <p className="text-muted">Rapport introuvable.</p>;

  const current = visit;
  const ranked = [...anomalies].sort((a, b) => b.kinney.score - a.kinney.score);
  const advisor = current.signatures?.find((s) => s.role === "conseiller");
  const site = current.signatures?.find((s) => s.role === "site");

  function mail() {
    const subject = encodeURIComponent(`Rapport SIPP — ${visitLabel(current)} — ${current.date}`);
    const body = encodeURIComponent(
      `Rapport de visite SiprAssist\n${visitLabel(current)}\n${current.site}\nConseiller : ${profile.name}\nConstats : ${anomalies.length}\nNotices FDS : ${fds.length}\nAnalyses RPS : ${rps.length}\nOuvrir l'application pour le PDF.`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  return (
    <article className="space-y-6 print:text-black">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-accent">Rapport de visite SIPP</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">{visitLabel(visit)}</h1>
          <p className="text-sm text-muted">
            {visit.site} · {formatDate(visit.date)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimer / PDF
          </Button>
          <Button variant="outline" onClick={mail}>
            <Mail />
            Envoyer
          </Button>
        </div>
      </header>

      <Card className="grid gap-3 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted">Conseiller · </span>
          {profile.name}, {profile.title} (N{profile.level})
        </p>
        <p>
          <span className="text-muted">Interlocuteur · </span>
          {visit.interlocutor || "—"}
        </p>
        <p>
          <span className="text-muted">Organisation · </span>
          {profile.organisation}
        </p>
        <p>
          <span className="text-muted">Constats · </span>
          {anomalies.length}
        </p>
        <p>
          <span className="text-muted">Notices FDS · </span>
          {fds.length ? `${fds.length} liées au dossier` : "aucune liée (bibliothèque informative)"}
        </p>
        <p>
          <span className="text-muted">Analyses RPS · </span>
          {rps.length ? `${rps.length} collective${rps.length > 1 ? "s" : ""} (sans identité)` : "aucune"}
        </p>
        {visit.geo ? (
          <p className="sm:col-span-2">
            <span className="text-muted">Lieu / site (GPS) · </span>
            {geoLabel(visit.geo)} · {formatCoords(visit.geo.lat, visit.geo.lng)}
          </p>
        ) : null}
      </Card>

      {visit.notes ? <p className="text-sm text-muted">{visit.notes}</p> : null}

      <section className="space-y-4">
        {ranked.map((a, i) => (
          <Card key={a.id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span>
              <RiskBadge level={a.kinney.level} score={a.kinney.score} />
              <StatusBadge status={a.status} />
              <ThemeChip id={a.theme} />
            </div>
            <h2 className="font-display text-lg font-semibold">
              <Link to="/anomalie/$id" params={{ id: a.id }} className="hover:text-accent">
                {a.title}
              </Link>
            </h2>
            {a.photo ? (
              <img src={a.photo} alt="" className="h-40 w-full rounded-lg object-cover" />
            ) : null}
            <p className="text-sm">{a.description}</p>
            {a.voice ? (
              <p className="text-xs text-muted">
                Zone · {a.voice.zone || a.location}
                {a.capturedAt ? ` · horodatage ${formatStamp(new Date(a.capturedAt))}` : ""}
              </p>
            ) : null}
            <p className="text-xs text-muted">
              {a.location} · {themeById(a.theme).label} · P {a.kinney.P} × E {a.kinney.E} × G{" "}
              {a.kinney.G} = {a.kinney.score} ({LEVEL_META[a.kinney.level].label})
            </p>
            {a.kinneyWhy ? (
              <p className="text-xs text-subtle">{a.kinneyWhy.legal}</p>
            ) : null}
            <p className="text-sm">
              <span className="text-muted">Mesure · </span>
              {a.correctiveAction}
            </p>
            <p className="text-xs text-muted">
              Constat rédigé par {a.author?.name ?? profile.name}
              {a.author ? `, ${a.author.title} (N${a.author.level})` : ` (N${profile.level})`}
            </p>
            <p className="text-xs text-subtle">
              {a.assignedTo ?? "Non assigné"}
              {a.dueDate ? ` · échéance ${formatShortDate(a.dueDate)}` : ""}
              {a.legalRef ? ` · ${a.legalRef}` : ""}
            </p>
          </Card>
        ))}
      </section>

      {fds.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Notices FDS liées</h2>
          {fds.map((f) => (
            <Card key={f.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display font-semibold">
                  <Link to="/fds/$id" params={{ id: f.id }} className="hover:text-accent">
                    {f.productName}
                  </Link>
                </h3>
                <span className="text-xs text-muted">{f.signalWord}</span>
              </div>
              {f.notice.filter(Boolean).length > 0 ? (
                <ol className="list-decimal space-y-1 pl-4 text-sm">
                  {f.notice.filter(Boolean).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              ) : null}
              {hasReality(f.reality) ? (
                <dl className="space-y-1 text-sm">
                  {FDS_REALITY_QUESTIONS.map((q) => {
                    const answer = (f.reality?.[q.key] ?? "").trim();
                    if (!answer) return null;
                    return (
                      <div key={q.key}>
                        <dt className="text-xs text-muted">{q.label}</dt>
                        <dd>{answer}</dd>
                      </div>
                    );
                  })}
                </dl>
              ) : null}
              {(f.reality?.themes ?? []).length > 0 ? (
                <p className="text-xs text-muted">
                  {(f.reality?.themes ?? [])
                    .map((id) => FDS_REALITY_THEMES.find((t) => t.id === id)?.label ?? id)
                    .join(" · ")}
                </p>
              ) : null}
            </Card>
          ))}
        </section>
      ) : null}

      {rps.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Analyses RPS collectives</h2>
          <p className="text-sm text-muted">
            Lecture d'organisation (poste, équipe) — aucune identité de travailleur.
          </p>
          {rps.map((s) => (
            <Card key={s.id} className="space-y-2">
              <h3 className="font-display font-semibold">
                <Link to="/rps/$id" params={{ id: s.id }} className="hover:text-accent">
                  {s.title}
                </Link>
              </h3>
              <p className="text-sm text-muted">{s.unit}</p>
              <p className="text-sm">{s.diagnosis}</p>
              {s.measures.length > 0 ? (
                <ol className="list-decimal space-y-1 pl-4 text-sm">
                  {s.measures.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ol>
              ) : null}
            </Card>
          ))}
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs font-medium tracking-wide text-muted">Signature conseiller</p>
          <p className="mt-1 text-sm">{advisor?.name ?? profile.name}</p>
          {advisor?.dataUrl ? (
            <img src={advisor.dataUrl} alt="Signature conseiller" className="mt-2 h-16 w-full object-contain" />
          ) : (
            <p className="mt-2 text-xs text-subtle">Non signé</p>
          )}
          {advisor ? (
            <p className="mt-1 font-mono text-xs text-subtle">{formatStamp(new Date(advisor.signedAt))}</p>
          ) : null}
        </Card>
        <Card>
          <p className="text-xs font-medium tracking-wide text-muted">Signature responsable de site</p>
          <p className="mt-1 text-sm">{site?.name ?? visit.interlocutor}</p>
          {site?.dataUrl ? (
            <img src={site.dataUrl} alt="Signature site" className="mt-2 h-16 w-full object-contain" />
          ) : (
            <p className="mt-2 text-xs text-subtle">Non signé</p>
          )}
          {site ? (
            <p className="mt-1 font-mono text-xs text-subtle">{formatStamp(new Date(site.signedAt))}</p>
          ) : null}
        </Card>
      </section>

      <p className="text-xs text-subtle">
        Preuve destinée à une inspection CBE : horodatage et géolocalisation des constats, signatures
        de clôture. Document généré par SiprAssist.
      </p>
    </article>
  );
}
