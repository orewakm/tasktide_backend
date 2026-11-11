import { pool } from '../db';
import { Board } from './boardRepository';

export type MemberStatus = 'invited' | 'active';

export interface Member {
    id: string;
    name: string;
    email: string;
    status: MemberStatus;
}

// ON CONFLICT DO NOTHING: if the user is already invited or a member (same board_id + user_id,
// the primary key), nothing is inserted and rowCount is 0. We return false and the service answers 409.
// pg types rowCount as number | null, hence the ?? 0.
// TR: ON CONFLICT DO NOTHING: kullanıcı zaten davetliyse veya üyeyse (aynı board_id + user_id,
// TR: yani primary key), hiçbir şey eklenmez ve rowCount 0 olur. false döneriz, servis de 409 yanıtı verir.
// TR: pg, rowCount'u number | null olarak tanımlar, ?? 0 bu yüzden var.
export async function add(boardId: string, userId: string, status: MemberStatus): Promise<boolean> {
    const result = await pool.query(
        `INSERT INTO board_members (board_id, user_id, status)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING`,
        [boardId, userId, status]
    );

    return (result.rowCount ?? 0) > 0;
}

// Pending invitations are listed too; status tells them apart. Deleted accounts are hidden.
// TR: Bekleyen davetler de listelenir, status alanı ikisini ayırt eder. Silinmiş hesaplar gösterilmez.
export async function listMembers(boardId: string): Promise<Member[]> {
    const { rows } = await pool.query<Member>(
        `SELECT u.id, u.name, u.email, m.status
           FROM board_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.board_id = $1 AND u.deleted_at IS NULL
           ORDER BY u.name`,
        [boardId]
    );
    return rows;
}

// Boards the user was invited to and hasn't answered yet. Deleted boards drop out.
// TR: Kullanıcının davet edildiği ama henüz yanıtlamadığı panolar. Silinmiş panolar listede yer almaz.
export async function listInvitations(userId: string): Promise<Board[]> {
    const { rows } = await pool.query<Board>(
        `SELECT b.id, b.name, b.owner_id, b.created_at
   FROM board_members m
   JOIN boards b ON b.id = m.board_id
   WHERE m.user_id = $1 AND m.status = 'invited' AND b.deleted_at IS NULL
   ORDER BY b.created_at DESC`,
        [userId]
    );

    return rows;
}

// Only a pending invitation can be accepted. false means there was nothing to accept.
// TR: Yalnızca bekleyen bir davet kabul edilebilir. false, kabul edilecek bir davet olmadığı anlamına gelir.
export async function accept(boardId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
        `UPDATE board_members SET status = 'active'
        WHERE board_id = $1 AND user_id = $2 AND status = 'invited'`,
        [boardId, userId]
    );

    return (result.rowCount ?? 0) > 0;
}

// status = 'invited' keeps this from removing active members; leaving a board goes through remove().
// TR: status = 'invited' koşulu sayesinde bu sorgu aktif üyeleri silemez; panodan ayrılmak remove() ile yapılır.
export async function decline(boardId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
        `
        DELETE FROM board_members WHERE board_id = $1 AND user_id = $2 AND status = 'invited'`,
        [boardId, userId]
    );

    return (result.rowCount ?? 0) > 0;
}

// Invited users don't count until they accept.
// TR: Davet edilen kullanıcılar kabul edene kadar sayılmaz.
export async function isActiveMember(boardId: string, userId: string): Promise<boolean> {
    const { rows } = await pool.query(
        `SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2 AND status = 'active'`,
        [boardId, userId]
    );
    return rows.length > 0;
}

// Deletes the row whatever its status, so it covers removing a member, leaving the board
// and cancelling an invitation.
// TR: Satırı durumuna bakmadan siler; bir üyeyi çıkarmayı, panodan ayrılmayı ve bir daveti
// TR: iptal etmeyi kapsar.
export async function remove(boardId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
        `
        DELETE FROM board_members WHERE board_id = $1 AND user_id = $2`,
        [boardId, userId]
    );

    return (result.rowCount ?? 0) > 0;
}
