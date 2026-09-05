import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type AuthenticatorTransport,
	type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '../db';
import { challenges, type Passkey } from '../db/schema';
import { fromBase64Url, randomId, toBase64Url } from '../crypto';

export const RP_NAME = 'LC Game';
export const CHALLENGE_COOKIE = 'lc_challenge';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function relyingParty(url: URL): { rpID: string; origin: string } {
	return { rpID: url.hostname, origin: url.origin };
}

async function storeChallenge(db: Db, challenge: string, kind: 'registration' | 'authentication') {
	const id = randomId();
	const now = Date.now();
	await db.delete(challenges).where(lt(challenges.expiresAt, new Date(now)));
	await db.insert(challenges).values({ id, challenge, kind, expiresAt: new Date(now + CHALLENGE_TTL_MS) });
	return id;
}

async function consumeChallenge(db: Db, id: string, kind: 'registration' | 'authentication') {
	const row = await db
		.select()
		.from(challenges)
		.where(and(eq(challenges.id, id), eq(challenges.kind, kind)))
		.get();
	if (row) await db.delete(challenges).where(eq(challenges.id, id));
	if (!row || row.expiresAt.getTime() < Date.now()) throw new Error('challenge expired; try again');
	return row.challenge;
}

const transportsOf = (p: Passkey) => (p.transports ?? []) as AuthenticatorTransport[];

export async function beginRegistration(db: Db, rpID: string, userName: string, existing: Passkey[]) {
	const options = await generateRegistrationOptions({
		rpName: RP_NAME,
		rpID,
		userName,
		attestationType: 'none',
		excludeCredentials: existing.map((p) => ({ id: p.id, transports: transportsOf(p) })),
		authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
	});
	const challengeId = await storeChallenge(db, options.challenge, 'registration');
	return { options, challengeId };
}

export async function finishRegistration(
	db: Db,
	args: { challengeId: string; response: RegistrationResponseJSON; rpID: string; origin: string }
) {
	const expectedChallenge = await consumeChallenge(db, args.challengeId, 'registration');
	const v = await verifyRegistrationResponse({
		response: args.response,
		expectedChallenge,
		expectedOrigin: args.origin,
		expectedRPID: args.rpID
	});
	if (!v.verified || !v.registrationInfo) throw new Error('passkey registration could not be verified');
	const c = v.registrationInfo.credential;
	return {
		id: c.id,
		publicKey: toBase64Url(c.publicKey),
		counter: c.counter,
		transports: (c.transports ?? []) as string[]
	};
}

export async function beginAuthentication(db: Db, rpID: string, passkeys: Passkey[]) {
	const options = await generateAuthenticationOptions({
		rpID,
		allowCredentials: passkeys.map((p) => ({ id: p.id, transports: transportsOf(p) })),
		userVerification: 'preferred'
	});
	const challengeId = await storeChallenge(db, options.challenge, 'authentication');
	return { options, challengeId };
}

export async function finishAuthentication(
	db: Db,
	args: {
		challengeId: string;
		response: AuthenticationResponseJSON;
		rpID: string;
		origin: string;
		passkey: Passkey;
	}
): Promise<number> {
	const expectedChallenge = await consumeChallenge(db, args.challengeId, 'authentication');
	const v = await verifyAuthenticationResponse({
		response: args.response,
		expectedChallenge,
		expectedOrigin: args.origin,
		expectedRPID: args.rpID,
		credential: {
			id: args.passkey.id,
			publicKey: fromBase64Url(args.passkey.publicKey),
			counter: args.passkey.counter,
			transports: transportsOf(args.passkey)
		}
	});
	if (!v.verified) throw new Error('passkey assertion could not be verified');
	return v.authenticationInfo.newCounter;
}
