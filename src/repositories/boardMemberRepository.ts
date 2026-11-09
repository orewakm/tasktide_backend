import { pool } from '../db';
import { Board } from './boardRepository';

export type MemberStatus = 'invited' | 'active';

export interface Member {
    id: string;
    name: string;
    email: string;
    status: MemberStatus;
}

export async function add(boardId: string, userId: string, status: MemberStatus): Promise<boolean> {
    const result = await pool.query(
        `INSERT INTO board_members (board_id, user_id, status)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING`,
        [boardId, userId, status]
    );

    return (result.rowCount ?? 0) > 0;
}

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

export async function accept(boardId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
        `UPDATE board_members SET status = 'active'
        WHERE board_id = $1 AND user_id = $2 AND status = 'invited'`,
        [boardId, userId]
    );

    return (result.rowCount ?? 0) > 0;
}

export async function decline(boardId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
        `
        DELETE FROM board_members WHERE board_id = $1 AND user_id = $2 AND status = 'invited'`,
        [boardId, userId]
    );

    return (result.rowCount ?? 0) > 0;
}

export async function isActiveMember(boardId: string, userId: string): Promise<boolean> {
    const { rows } = await pool.query(
        `SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2 AND status = 'active'`,
        [boardId, userId]
    );
    return rows.length > 0;
}

export async function remove(boardId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
        `
        DELETE FROM board_members WHERE board_id = $1 AND user_id = $2`,
        [boardId, userId]
    );

    return (result.rowCount ?? 0) > 0;
}
