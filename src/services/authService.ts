import bcrypt from 'bcryptjs';
import { config } from '../config';
import * as sessionRepository from '../repositories/sessionRepository';
import * as userRepository from '../repositories/userRepository';
import type { PublicUser } from '../repositories/userRepository';
import { AppError } from '../errors/AppError';
import * as realtime from '../sockets/realtime';

export async function register(name: string, email: string, password: string) {
    const passwordHash = await bcrypt.hash(password, 10);
    try {
        return await userRepository.create(name, email, passwordHash);
    } catch (err) {
        // 23505 is Postgres' unique_violation: the email is already taken.
        // We let the unique index decide instead of checking first (two sign-ups at
        // the same moment could both pass a check), and answer 409 instead of a 500.
        // TR: 23505, Postgres'in unique_violation kodudur: bu email zaten kullanılıyor.
        // TR: Önce kontrol etmek yerine kararı unique index'e bırakıyoruz (aynı anda gelen
        // TR: iki kayıt isteği bir kontrolü birlikte geçebilir) ve 500 yerine 409 dönüyoruz.
        if ((err as { code?: string }).code === '23505') {
            throw new AppError(409, 'Email already in use');
        }
        throw err;
    }
}

// On success a new session is stored in Redis; the token is its key.
// Wrong email and wrong password get the same 401, so nobody can use login
// to find out which emails are registered.
// TR: Başarılı girişte Redis'e yeni bir oturum yazılır; token bu oturumun anahtarıdır.
// TR: Yanlış email ve yanlış şifre aynı 401'i alır, böylece kimse login ile
// TR: hangi email'lerin kayıtlı olduğunu öğrenemez.
export async function login(email: string, password: string) {
    const user = await userRepository.getByEmail(email);
    const isValid = user !== null && (await bcrypt.compare(password, user.password_hash));
    if (!user || !isValid) throw new AppError(401, 'Invalid credentials');

    const token = await sessionRepository.create(user.id);
    return {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
}

// Ends this session only (other devices stay logged in) and closes its sockets.
// TR: Sadece bu oturumu sonlandırır (diğer cihazlarda giriş açık kalır) ve ona ait socket'leri kapatır.
export async function logout(token: string, userId: string) {
    await sessionRepository.remove(token);
    await realtime.disconnectSession(userId, token);
}

// Token -> session in Redis -> user in Postgres. Used by the HTTP auth middleware
// and by the socket handshake.
// We reload the user on every request instead of storing it in the session,
// so a role change or a deleted user takes effect right away.
// TR: Token -> Redis'teki oturum -> Postgres'teki kullanıcı. HTTP auth middleware'i
// TR: ve socket bağlantısı bunu kullanır.
// TR: Kullanıcıyı oturumda saklamak yerine her istekte veritabanından yeniden yüklüyoruz,
// TR: böylece rol değişikliği veya silinen kullanıcı hemen etkili olur.
export async function resolveSession(token: string): Promise<PublicUser | null> {
    const userId = await sessionRepository.getUserId(token);
    if (!userId) return null;
    return userRepository.getById(userId);
}

export async function getProfile(id: string) {
    const user = await userRepository.getById(id);
    if (!user) throw new AppError(404, 'User not found');
    return user;
}

// Runs on startup. ON CONFLICT DO NOTHING means restarts don't create a second
// super admin, and the existing one's password isn't overwritten from the env.
// The email is lowercased because register and login lowercase emails too.
// TR: Uygulama açılırken çalışır. ON CONFLICT DO NOTHING sayesinde yeniden başlatmalar
// TR: ikinci bir süper admin oluşturmaz ve mevcut olanın şifresi env'deki değerle değişmez.
// TR: Email küçük harfe çevrilir, çünkü register ve login de email'leri küçük harfe çevirir.
export async function ensureSuperAdmin() {
    const hash = await bcrypt.hash(config.SUPER_ADMIN_PASSWORD, 10);
    const created = await userRepository.createSuperAdmin(
        config.SUPER_ADMIN_EMAIL.toLowerCase(),
        hash
    );
    console.log(created ? 'Super admin created' : 'Super admin already exists');
}
