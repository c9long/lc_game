// Web Crypto helpers that work identically on Cloudflare Workers and Node 24.
const enc = new TextEncoder();
const dec = new TextDecoder();

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
	const b = new Uint8Array(n);
	crypto.getRandomValues(b);
	return b;
}

export function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export function toHex(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += b.toString(16).padStart(2, '0');
	return s;
}

export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
	if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('invalid hex');
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export function toBase64Url(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export function randomId(bytes = 16): string {
	return toBase64Url(randomBytes(bytes));
}

export async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
	return toHex(new Uint8Array(digest));
}

/** Constant-time string comparison for tokens. */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let r = 0;
	for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return r === 0;
}

async function importAesKey(keyHex: string): Promise<CryptoKey> {
	const raw = fromHex(keyHex);
	if (raw.length !== 32) throw new Error('SETTINGS_KEY must be 32 bytes as 64 hex characters');
	return crypto.subtle.importKey('raw', toArrayBuffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-256-GCM; output is base64url(iv || ciphertext). */
export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
	const key = await importAesKey(keyHex);
	const iv = randomBytes(12);
	const ct = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, enc.encode(plaintext))
	);
	const out = new Uint8Array(iv.length + ct.length);
	out.set(iv);
	out.set(ct, iv.length);
	return toBase64Url(out);
}

export async function decrypt(payload: string, keyHex: string): Promise<string> {
	const key = await importAesKey(keyHex);
	const buf = fromBase64Url(payload);
	const iv = buf.slice(0, 12);
	const ct = buf.slice(12);
	const pt = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(iv) },
		key,
		toArrayBuffer(ct)
	);
	return dec.decode(pt);
}
