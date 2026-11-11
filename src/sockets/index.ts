import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { config } from '../config';
import { AppError } from '../errors/AppError';
import * as authService from '../services/authService';
import * as boardService from '../services/boardService';
import {
    boardRoom,
    broadcastPresence,
    onlineUsers,
    setIo,
    userRoom,
    type IoServer,
} from './realtime';

const boardIdSchema = z.uuid();

type JoinReply =
    | { ok: true; online: { id: string; name: string }[] }
    | { ok: false; error: string };

function logError(err: unknown) {
    console.error('Socket error', err);
}

export function initSockets(httpServer: HttpServer): IoServer {
    const io: IoServer = new Server(httpServer, { cors: { origin: config.CORS_ORIGIN } });

    // Same session as the HTTP API. The client connects with io(url, { auth: { token } }).
    io.use(async (socket, next) => {
        try {
            const token: unknown = socket.handshake.auth?.token;
            if (typeof token !== 'string') return next(new Error('Unauthorized'));
            const user = await authService.resolveSession(token);
            if (!user) return next(new Error('Unauthorized'));
            socket.data.user = { id: user.id, name: user.name, role: user.role };
            socket.data.sessionToken = token;
            next();
        } catch (err) {
            next(err as Error);
        }
    });

    io.on('connection', (socket) => {
        const user = socket.data.user;
        // Personal room for events about the user (invitations, being removed from a board).
        void socket.join(userRoom(user.id));

        // Opening a board. Only members get in; then everyone there gets the new online list.
        socket.on('board:join', async (boardId: unknown, ack?: (reply: JoinReply) => void) => {
            const reply = typeof ack === 'function' ? ack : () => {};
            try {
                const parsed = boardIdSchema.safeParse(boardId);
                if (!parsed.success) return reply({ ok: false, error: 'Invalid board id' });

                try {
                    await boardService.getAccessibleBoard(parsed.data, user);
                } catch (err) {
                    if (err instanceof AppError) return reply({ ok: false, error: err.message });
                    throw err;
                }

                await socket.join(boardRoom(parsed.data));
                reply({ ok: true, online: await onlineUsers(parsed.data) });
                await broadcastPresence(parsed.data);
            } catch (err) {
                logError(err);
                reply({ ok: false, error: 'Could not join board' });
            }
        });

        socket.on('board:leave', async (boardId: unknown) => {
            try {
                const parsed = boardIdSchema.safeParse(boardId);
                if (!parsed.success) return;
                await socket.leave(boardRoom(parsed.data));
                await broadcastPresence(parsed.data);
            } catch (err) {
                logError(err);
            }
        });

        // When a tab closes, update the online list of every board it had open.
        // 'disconnecting' still knows the rooms; by 'disconnect' the socket has left them.
        let openBoards: string[] = [];
        socket.on('disconnecting', () => {
            openBoards = [...socket.rooms]
                .filter((room) => room.startsWith('board:'))
                .map((room) => room.slice('board:'.length));
        });
        socket.on('disconnect', () => {
            for (const boardId of openBoards) broadcastPresence(boardId).catch(logError);
        });
    });

    setIo(io);
    return io;
}
