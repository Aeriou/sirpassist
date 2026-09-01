import { toast } from "sonner";
import { signOut as authSignOut } from "./client";

/**
 * Déconnexion robuste : requête serveur Better Auth, puis navigation dure vers
 * l'accueil (relit l'état des cookies à zéro — évite le « je vois Déconnecté
 * mais je suis encore connecté »).
 */
export function doSignOut() {
  toast.message("Déconnexion…");
  authSignOut("/").catch(() => window.location.assign("/"));
}
