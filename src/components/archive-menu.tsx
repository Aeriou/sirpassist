import { useState } from "react";
import { toast } from "sonner";
import { FolderDown, Printer, Save, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Field, Input } from "./ui/input";
import {
  archiveJson,
  archiveZip,
  downloadArchivePdf,
  downloadBlob,
  exportToDirectory,
  pickDirectory,
} from "@/lib/export-folder";
import { isoDay } from "@/lib/format";
import { isExample, useSipr, useWorkspaceAnomalies, useWorkspaceFds, useWorkspaceRps, useWorkspaceVisits } from "@/lib/store";

export function ArchiveMenu() {
  const visits = useWorkspaceVisits();
  const anomalies = useWorkspaceAnomalies();
  const fds = useWorkspaceFds();
  const rps = useWorkspaceRps();
  const pgp = useSipr((s) => s.pgp);
  const profile = useSipr((s) => s.profile);
  const clearExamples = useSipr((s) => s.clearExamples);
  const examples =
    visits.filter((v) => isExample(v.id, v.demo)).length +
    anomalies.filter((a) => isExample(a.id, a.demo)).length +
    fds.filter((f) => isExample(f.id, f.demo)).length +
    rps.filter((r) => isExample(r.id, r.demo)).length +
    pgp.lines.filter((l) => isExample(l.id, l.demo)).length;
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [folder, setFolder] = useState(`SiprAssist-${isoDay()}`);
  const [pdf, setPdf] = useState(true);
  const [busy, setBusy] = useState(false);

  function payload() {
    return { profile, visits, anomalies, fds, rps, pgp };
  }

  function saveJson() {
    downloadBlob(`siprassist-${isoDay()}.json`, archiveJson(payload()));
    toast.success("Sauvegarde JSON téléchargée.");
  }

  async function savePdf() {
    setBusy(true);
    try {
      await downloadArchivePdf(payload());
      toast.success("PDF téléchargé.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function saveFolder() {
    setBusy(true);
    try {
      const dir = await pickDirectory();
      if (!dir) {
        downloadBlob(
          `${folder.trim() || `SiprAssist-${isoDay()}`}.zip`,
          await archiveZip(payload(), { pdf }),
        );
        toast.success(
          "Archive ZIP téléchargée — ce navigateur ne permet pas de créer un dossier. Chrome ou Edge le peuvent.",
        );
        setOpen(false);
        return;
      }
      const name = await exportToDirectory(dir, folder, payload(), { pdf });
      toast.success(`Dossier « ${name} » créé (HTML${pdf ? " + PDF" : ""} + sauvegarde).`);
      setOpen(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : "Export annulé.");
    } finally {
      setBusy(false);
    }
  }

  async function saveZip() {
    setBusy(true);
    try {
      downloadBlob(
        `${folder.trim() || `SiprAssist-${isoDay()}`}.zip`,
        await archiveZip(payload(), { pdf }),
      );
      toast.success("Archive ZIP (sauvegarde + HTML + PDF) téléchargée.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ZIP impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {examples > 0 ? (
        <Button variant="outline" className="min-w-0 whitespace-normal sm:whitespace-nowrap" onClick={() => setConfirm(true)}>
          <Trash2 />
          Effacer les exemples
        </Button>
      ) : null}
      <Button variant="secondary" className="min-w-0" onClick={saveJson}>
        <Save />
        Sauvegarder
      </Button>
      <Button variant="outline" className="min-w-0" disabled={busy} onClick={() => void savePdf()}>
        <Printer />
        PDF
      </Button>
      <Button className="min-w-0" onClick={() => setOpen(true)}>
        <FolderDown />
        Dossier
      </Button>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title="Retirer les exemples"
          description="Visites, constats, étiquettes FDS et actions PAA de démonstration. Vos propres fiches restent."
        >
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const n = clearExamples();
                setConfirm(false);
                toast.success(`${n} exemple(s) retiré(s).`);
              }}
            >
              Oui, effacer les exemples
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Annuler
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Exporter vers un dossier"
          description="Choisissez l'emplacement. Le dossier est créé s'il n'existe pas. Sur tablette, une archive ZIP est proposée."
        >
          <Field label="Nom du dossier">
            <Input value={folder} onChange={(e) => setFolder(e.target.value)} />
          </Field>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} />
            Inclure un PDF récapitulatif
          </label>
          <div className="mt-4 flex flex-col gap-2">
            <Button disabled={busy} onClick={() => void saveFolder()}>
              {busy ? "Export…" : "Choisir l'emplacement et exporter"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void saveZip()}>
              Sauvegarder + PDF (ZIP)
            </Button>
            <Button variant="outline" onClick={saveJson}>
              Sauvegarder uniquement (JSON)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
