import { Pool, type PoolClient } from 'pg';
import { config } from './config';

// One pool for the whole app. pool.query() borrows a connection and returns it by itself.
// TR: Tüm uygulama için tek bir pool. pool.query() bir bağlantı ödünç alır ve kendisi geri verir.
export const pool = new Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
});

// An idle connection in the pool can fail (Postgres restarted, network dropped).
// With no 'error' listener Node would crash the whole process, so we just log it.
// TR: Pool'daki boşta bekleyen bir bağlantı kopabilir (Postgres yeniden başladı, ağ gitti).
// TR: 'error' listener'ı olmasa Node tüm process'i çökertir, bu yüzden sadece logluyoruz.
pool.on('error', (err) => {
    console.error('Unexpected database error', err);
});

// Runs fn between BEGIN and COMMIT on a single connection. If fn throws, we rollback
// and rethrow so the caller still gets the error. Inside fn, use the `client` it
// receives, not `pool`: a pool query runs on another connection, outside the transaction.
// TR: fn'i tek bir bağlantı üzerinde BEGIN ile COMMIT arasında çalıştırır. fn hata fırlatırsa
// TR: rollback yapıp hatayı tekrar fırlatırız, böylece çağıran taraf hatayı yine alır. fn içinde
// TR: `pool` değil, verilen `client` kullanılmalı: pool sorgusu başka bir bağlantıda, transaction dışında çalışır.
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        // Always give the connection back, or the pool slowly runs out.
        // TR: Bağlantı her durumda geri verilmeli, yoksa pool yavaş yavaş tükenir.
        client.release();
    }
}
