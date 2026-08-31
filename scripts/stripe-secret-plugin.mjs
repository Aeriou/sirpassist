import { readFileSync } from "node:fs";
import { join } from "node:path";

function readSecret() {
  const fromEnv = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (fromEnv.startsWith("sk_")) return fromEnv;
  try {
    const parsed = JSON.parse(readFileSync(join(process.cwd(), ".grok/server-secrets.json"), "utf8"));
    const key = typeof parsed.STRIPE_SECRET_KEY === "string" ? parsed.STRIPE_SECRET_KEY.trim() : "";
    if (key.startsWith("sk_")) return key;
  } catch {
    /* absent */
  }
  try {
    const parsed = JSON.parse(readFileSync("/workspace/.grok/server-secrets.json", "utf8"));
    const key = typeof parsed.STRIPE_SECRET_KEY === "string" ? parsed.STRIPE_SECRET_KEY.trim() : "";
    if (key.startsWith("sk_")) return key;
  } catch {
    /* absent */
  }
  return "";
}

const PLACEHOLDER = "SIPR_STRIPE_SECRET_PLACEHOLDER";

/** Injects the Stripe secret into the server module only — never a VITE_ client var. */
export function stripeSecretPlugin() {
  const secret = readSecret();
  return {
    name: "sipr-stripe-secret",
    enforce: "pre",
    transform(code, id) {
      const norm = id.replace(/\\/g, "/");
      if (!norm.includes("stripe.server")) return;
      if (!secret || !code.includes(PLACEHOLDER)) return;
      return {
        code: code.replaceAll(`"${PLACEHOLDER}"`, JSON.stringify(secret)),
        map: null,
      };
    },
  };
}
