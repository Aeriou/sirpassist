const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function toBase32(bytes: Uint8Array): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function fromBase32(secret: string): Uint8Array {
  const clean = secret.toUpperCase().replace(/=+$/g, "").replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) continue;
    bits += i.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

export function randomTotpSecret(): string {
  return toBase32(crypto.getRandomValues(new Uint8Array(20)));
}

export function totpUri(email: string, secret: string): string {
  const label = encodeURIComponent(`SiprAssist:${email.trim().toLowerCase()}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=SiprAssist&algorithm=SHA1&digits=6&period=30`;
}

async function hotp(secret: string, counter: number): Promise<string> {
  const key = fromBase32(secret);
  const keyCopy = new Uint8Array(key.byteLength);
  keyCopy.set(key);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(4, counter >>> 0);
  view.setUint32(0, Math.floor(counter / 0x1_0000_0000));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyCopy.buffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, msg));
  const offset = sig[sig.length - 1]! & 0x0f;
  const bin =
    ((sig[offset]! & 0x7f) << 24) |
    ((sig[offset + 1]! & 0xff) << 16) |
    ((sig[offset + 2]! & 0xff) << 8) |
    (sig[offset + 3]! & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

export async function totpCode(secret: string, at = Date.now()): Promise<string> {
  return hotp(secret, Math.floor(at / 1000 / 30));
}

export async function verifyTotp(secret: string, code: string, at = Date.now()): Promise<boolean> {
  const trimmed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(trimmed) || !secret) return false;
  for (const delta of [-1, 0, 1]) {
    if ((await totpCode(secret, at + delta * 30_000)) === trimmed) return true;
  }
  return false;
}

export function randomBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  const bytes = crypto.getRandomValues(new Uint8Array(count * 4));
  for (let i = 0; i < count; i++) {
    const n = new DataView(bytes.buffer).getUint32(i * 4).toString(16).padStart(8, "0");
    codes.push(`${n.slice(0, 4)}-${n.slice(4)}`);
  }
  return codes;
}

export async function hashBackupCode(code: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim().toLowerCase()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function consumeBackupCode(
  code: string,
  hashes: string[],
): Promise<{ ok: true; remaining: string[] } | { ok: false }> {
  const hashed = await hashBackupCode(code);
  const idx = hashes.indexOf(hashed);
  if (idx < 0) return { ok: false };
  return { ok: true, remaining: hashes.filter((_, i) => i !== idx) };
}
