import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(8000),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number(),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),

    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),

    CORS_ORIGIN: z
        .string()
        .default('http://localhost:3000')
        .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),

    SUPER_ADMIN_EMAIL: z.email(),
    SUPER_ADMIN_PASSWORD: z.string().min(8),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
    console.error('Invalid environment variables');
    console.error(z.prettifyError(result.error));
    process.exit(1);
}

export const config = result.data;
