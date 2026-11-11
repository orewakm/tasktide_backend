import { z } from 'zod';

// Every env var is checked once, at startup. A missing or wrong value stops the app
// right away with a clear message, instead of breaking later on some random request.
// TR: Tüm ortam değişkenleri başlangıçta bir kez kontrol edilir. Eksik ya da hatalı bir değer
// TR: uygulamayı hemen, anlaşılır bir mesajla durdurur; sonradan rastgele bir istekte patlamaz.
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Env vars are always strings; z.coerce turns them into numbers.
    // TR: Ortam değişkenleri her zaman string'dir; z.coerce onları sayıya çevirir.
    PORT: z.coerce.number().default(8000),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number(),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),

    // Sessions live in Redis. A session expires after this many hours without use.
    // TR: Oturumlar Redis'te tutulur. Bu kadar saat kullanılmayan oturum sona erer.
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168), // 7 days (TR: 7 gün)

    // Frontend origins allowed to call the API and open sockets (comma separated).
    // TR: API'yi çağırmasına ve socket açmasına izin verilen frontend origin'leri (virgülle ayrılmış).
    CORS_ORIGIN: z
        .string()
        .default('http://localhost:3000')
        .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),

    // On startup ensureSuperAdmin() creates this account if it doesn't exist yet.
    // TR: Başlangıçta ensureSuperAdmin() bu hesap yoksa oluşturur.
    SUPER_ADMIN_EMAIL: z.email(),
    SUPER_ADMIN_PASSWORD: z.string().min(8),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
    console.error('Invalid environment variables');
    console.error(z.prettifyError(result.error));
    process.exit(1);
}

// Typed from the schema: config.PORT is a number and CORS_ORIGIN is already a string array.
// TR: Tipi şemadan gelir: config.PORT bir sayıdır, CORS_ORIGIN zaten bir string dizisidir.
export const config = result.data;
