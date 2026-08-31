import { isAdminEmail } from "./plan";
import { hashPassword } from "./password";
import type { SiprUser } from "./types";

const BOOTSTRAP_SALT = "sipr-admin-v1";
const BOOTSTRAP_HASH =
  "b97ab76041b38882ca383b137c96206555fe5ce000686aebcd87969955e06284";

export async function matchesBootstrapPassword(password: string): Promise<boolean> {
  const next = await hashPassword(password, BOOTSTRAP_SALT);
  return next.passwordHash === BOOTSTRAP_HASH;
}

/** Silent Pro — never overwrite salt/hash (password change must stick). */
export function withAdminEntitlements<T extends Pick<SiprUser, "email" | "plan">>(user: T): T {
  if (!isAdminEmail(user.email)) return user;
  return { ...user, plan: "pro" };
}

export async function passwordMatchesUser(
  password: string,
  user: Pick<SiprUser, "email" | "salt" | "passwordHash">,
): Promise<boolean> {
  if (user.salt && user.passwordHash) {
    const next = await hashPassword(password, user.salt);
    if (next.passwordHash === user.passwordHash) return true;
    if (user.passwordHash !== BOOTSTRAP_HASH) return false;
  }
  return isAdminEmail(user.email) && (await matchesBootstrapPassword(password));
}
