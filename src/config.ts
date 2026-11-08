import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(8000),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number(),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),

    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().min(1),

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
