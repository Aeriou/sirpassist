export async function hashPassword(
  password: string,
  salt: string = crypto.randomUUID(),
): Promise<{ salt: string; passwordHash: string }> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`));
  const passwordHash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { salt, passwordHash };
}

export async function verifyPassword(password: string, salt: string, passwordHash: string): Promise<boolean> {
  const next = await hashPassword(password, salt);
  return next.passwordHash === passwordHash;
}
