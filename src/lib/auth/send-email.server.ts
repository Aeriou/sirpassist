/**
 * Envoi d'e-mails transactionnels via Resend (server-only, sans SDK — `fetch`).
 *
 * DORMANT tant que `RESEND_API_KEY` n'est pas défini : `sendVerificationEmail`
 * ne fait rien et la vérification d'e-mail reste désactivée (voir server.ts).
 *
 * Pour activer :
 *   1. domaine à soi vérifié dans Resend (enregistrements SPF/DKIM),
 *   2. variables Vercel : RESEND_API_KEY, RESEND_FROM
 *      (ex. `SiprAssist <noreply@mon-domaine.be>`).
 */
const env = (key: string): string | undefined => {
  const v = process.env[key]?.trim();
  return v ? v : undefined;
};

export function emailSendingEnabled(): boolean {
  return Boolean(env("RESEND_API_KEY"));
}

export async function sendVerificationEmail(to: string, url: string): Promise<void> {
  const key = env("RESEND_API_KEY");
  if (!key) return; // dormant
  const from = env("RESEND_FROM") ?? "SiprAssist <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Confirmez votre adresse — SiprAssist",
      html:
        `<p>Bonjour,</p>` +
        `<p>Confirmez cette adresse pour activer votre compte SiprAssist :</p>` +
        `<p><a href="${url}">Confirmer mon adresse</a></p>` +
        `<p>Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.</p>`,
      text: `Confirmez votre adresse SiprAssist : ${url}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
}
