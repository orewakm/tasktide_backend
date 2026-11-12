import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config';
import { redis } from '../redis';

const TTL_SECONDS = config.SESSION_TTL_HOURS * 60 * 60;

// Builds a session's Redis key from the hash of its token.
function key(token: string) {
    return `session:${createHash('sha256').update(token).digest('hex')}`;
}

// Creates a session in Redis and returns its token.
export async function create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await redis.set(key(token), userId, { expiration: { type: 'EX', value: TTL_SECONDS } });
    return token;
}

// Returns the session's user id and extends its expiry, or null if it has expired.
export async function getUserId(token: string): Promise<string | null> {
    return redis.getEx(key(token), { type: 'EX', value: TTL_SECONDS });
}

// Deletes a session so its token stops working.
export async function remove(token: string): Promise<void> {
    await redis.del(key(token));
}
