import { Link } from "@tanstack/react-router";
import { GhsRow } from "@/components/pictograms";
import { Photo } from "@/components/photo";
import { Badge } from "@/components/ui/badge";
import { filledQuestionCount, hasReality } from "@/lib/fds-reality";
import type { FdsNotice } from "@/lib/types";

export function FdsCard({ notice, visitName }: { notice: FdsNotice; visitName?: string }) {
  const asked = filledQuestionCount(notice.reality);
  return (
    <Link
      to="/fds/$id"
      params={{ id: notice.id }}
      className="block overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]"
    >
      {notice.photo || notice.photoAssetId ? (
        <Photo
          dataUrl={notice.photo}
          assetId={notice.photoAssetId}
          className="h-36 w-full object-cover"
        />
      ) : null}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate font-display font-semibold">{notice.productName}</h3>
          <Badge tone={notice.signalWord === "DANGER" ? "high" : "mid"}>{notice.signalWord}</Badge>
        </div>
        <GhsRow codes={notice.pictograms} />
        <div className="flex flex-wrap gap-1.5">
          {notice.visitId ? (
            <Badge tone="accent">{visitName || "Dossier"}</Badge>
          ) : (
            <Badge tone="neutral">Informative</Badge>
          )}
          {hasReality(notice.reality) ? (
            <Badge tone="low">{asked > 0 ? `${asked}/5 questions` : "Points de poste"}</Badge>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
