/**
 * Identifiant d'image adressé par contenu : SHA-256 de la data URL, en hex
 * tronqué. Déterministe ⇒ deux constats avec la même photo partagent l'asset.
 */
export async function assetIdOf(dataUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(dataUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 40);
}

export function isDataUrl(s: string | undefined | null): s is string {
  return typeof s === "string" && s.startsWith("data:");
}
