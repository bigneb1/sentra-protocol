const WALLET_SESSION_KEY = "sentra_wallet_session_v1";

export type WalletSession = {
  address: string;
  message: string;
  signature: `0x${string}`;
  issuedAt: string;
  expiresAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readWalletSession(address?: string | null): WalletSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WALLET_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (
      typeof parsed.address !== "string" ||
      typeof parsed.message !== "string" ||
      typeof parsed.signature !== "string" ||
      typeof parsed.issuedAt !== "string" ||
      typeof parsed.expiresAt !== "string"
    ) {
      return null;
    }
    if (!parsed.signature.startsWith("0x")) return null;
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      clearWalletSession();
      return null;
    }
    if (address && parsed.address.toLowerCase() !== address.toLowerCase()) return null;
    return parsed as WalletSession;
  } catch {
    clearWalletSession();
    return null;
  }
}

export function writeWalletSession(session: WalletSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("sentra-wallet-session"));
}

export function clearWalletSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WALLET_SESSION_KEY);
  window.dispatchEvent(new Event("sentra-wallet-session"));
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function walletSessionHeaders(address?: string | null): HeadersInit | undefined {
  const session = readWalletSession(address);
  if (!session) return undefined;
  return {
    "x-sentra-wallet-address": session.address,
    "x-sentra-wallet-message": base64UrlEncode(session.message),
    "x-sentra-wallet-message-encoding": "base64url",
    "x-sentra-wallet-signature": session.signature,
  };
}
