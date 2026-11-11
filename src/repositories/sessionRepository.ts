import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config';
import { redis } from '../redis';

// Config is in hours, Redis expiry (EX) is in seconds.
// TR: Config saat cinsinden, Redis'teki süre (EX) ise saniye cinsinden.
const TTL_SECONDS = config.SESSION_TTL_HOURS * 60 * 60;

// The key is a hash of the token, so someone who can read Redis still can't log in with it.
// TR: Anahtar, token'ın hash'idir; bu yüzden Redis'i okuyabilen biri bile onunla giriş yapamaz.
function key(token: string) {
    return `session:${createHash('sha256').update(token).digest('hex')}`;
}

// Creates a session and returns the token the client sends as "Authorization: Bearer <token>".
// 32 random bytes can't realistically be guessed, and base64url keeps the token safe in a header.
// TR: Bir oturum oluşturur ve istemcinin "Authorization: Bearer <token>" olarak gönderdiği token'ı döner.
// TR: 32 rastgele bayt pratikte tahmin edilemez; base64url sayesinde token header içinde sorunsuz kullanılır.
export async function create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await redis.set(key(token), userId, { expiration: { type: 'EX', value: TTL_SECONDS } });
    return token;
}

// Returns the session's user id (null if missing/expired) and pushes the expiry forward,
// so active users stay logged in and idle sessions expire.
// GETEX reads the value and renews the TTL in one command.
// TR: Oturumun kullanıcı id'sini döner (yoksa ya da süresi dolmuşsa null) ve bitiş süresini ileri atar;
// TR: böylece aktif kullanıcılar oturumda kalır, boşta kalan oturumların süresi dolar.
// TR: GETEX değeri okur ve TTL'i tek komutta yeniler.
export async function getUserId(token: string): Promise<string | null> {
    return redis.getEx(key(token), { type: 'EX', value: TTL_SECONDS });
}

// Logout: the token stops working right away.
// TR: Çıkış: token hemen geçersiz olur.
export async function remove(token: string): Promise<void> {
    await redis.del(key(token));
}
