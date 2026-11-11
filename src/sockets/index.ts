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

// A client can send anything over a socket, so the board id is checked like HTTP input.
// A non-uuid string would otherwise make the Postgres query throw.
// TR: İstemci socket üzerinden her şeyi gönderebilir, bu yüzden pano id'si HTTP girdisi gibi kontrol edilir.
// TR: Aksi halde uuid olmayan bir string Postgres sorgusunun hata fırlatmasına yol açar.
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
    // Rejecting with next(new Error(...)) gives the client a 'connect_error' with that message.
    // TR: HTTP API ile aynı oturum. İstemci io(url, { auth: { token } }) ile bağlanır.
    // TR: next(new Error(...)) ile reddetmek, istemciye bu mesajla bir 'connect_error' gönderir.
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
            // Redis or Postgres failed during the check. Without this catch next() would
            // never run and the client would just hang, so we reject the connection.
            // TR: Kontrol sırasında Redis veya Postgres hata verdi. Bu catch olmasa next() hiç
            // TR: çağrılmaz ve istemci öylece beklerdi, bu yüzden bağlantıyı reddediyoruz.
            next(err as Error);
        }
    });

    io.on('connection', (socket) => {
        const user = socket.data.user;
        // Personal room for events about the user (invitations, being removed from a board).
        // TR: Kullanıcıyla ilgili event'ler için kişisel oda (davetler, panodan çıkarılma).
        void socket.join(userRoom(user.id));

        // Opening a board. Only members get in; then everyone there gets the new online list.
        // TR: Pano açma. Sadece üyeler girebilir; ardından odadaki herkes yeni çevrimiçi listesini alır.
        socket.on('board:join', async (boardId: unknown, ack?: (reply: JoinReply) => void) => {
            // The client may emit without an ack callback; a no-op keeps reply() safe to call.
            // TR: İstemci ack callback'i vermeden de emit edebilir; boş fonksiyon sayesinde reply() her zaman güvenle çağrılır.
            const reply = typeof ack === 'function' ? ack : () => {};
            try {
                const parsed = boardIdSchema.safeParse(boardId);
                if (!parsed.success) return reply({ ok: false, error: 'Invalid board id' });

                // Not a member or no such board: send back the same message the HTTP API gives.
                // Any other error is unexpected and goes to the outer catch.
                // TR: Üye değil ya da böyle bir pano yok: HTTP API'nin verdiği mesajın aynısını döndür.
                // TR: Diğer hatalar beklenmedik, dıştaki catch'e gider.
                try {
                    await boardService.getAccessibleBoard(parsed.data, user);
                } catch (err) {
                    if (err instanceof AppError) return reply({ ok: false, error: err.message });
                    throw err;
                }

                // Join first, so the user shows up in the online list they get back.
                // TR: Önce odaya katıl, böylece kullanıcı geri aldığı çevrimiçi listesinde kendini de görür.
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
        // TR: Bir sekme kapanınca, açık olduğu her panonun çevrimiçi listesini güncelle.
        // TR: 'disconnecting' anında odalar hâlâ biliniyor; 'disconnect' geldiğinde socket odalardan çıkmış olur.
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

    // Services emit through realtime.ts and never import this file. This file imports
    // services itself, so the other way around would be an import cycle.
    // TR: Servisler event'leri realtime.ts üzerinden gönderir, bu dosyayı hiç import etmez. Bu dosya
    // TR: servisleri zaten import ettiği için tersi bir import döngüsü olurdu.
    setIo(io);
    return io;
}
