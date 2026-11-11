import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config';
import { redis } from '../redis';

const TTL_SECONDS = config.SESSION_TTL_HOURS * 60 * 60;

// The key is a hash of the token, so someone who can read Redis still can't log in with it.
function key(token: string) {
    return `session:${createHash('sha256').update(token).digest('hex')}`;
}

// Creates a session and returns the token the client sends as "Authorization: Bearer <token>".
export async function create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await redis.set(key(token), userId, { expiration: { type: 'EX', value: TTL_SECONDS } });
    return token;
}

// Returns the session's user id (null if missing/expired) and pushes the expiry forward,
// so active users stay logged in and idle sessions expire.
export async function getUserId(token: string): Promise<string | null> {
    return redis.getEx(key(token), { type: 'EX', value: TTL_SECONDS });
}

export async function remove(token: string): Promise<void> {
    await redis.del(key(token));
}
