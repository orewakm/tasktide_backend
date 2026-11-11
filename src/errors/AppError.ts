// For errors the client is meant to see (400, 403, 404, 409...). Services throw it
// and errorHandler turns it into { error: message } with this status code.
// Throwing instead of returning lets a service stop from deep inside a call, and Express 5
// passes errors from async handlers to errorHandler by itself, so controllers stay simple.
// TR: İstemcinin görmesi gereken hatalar için (400, 403, 404, 409...). Servisler bunu fırlatır,
// TR: errorHandler da bu status koduyla { error: message } yanıtına çevirir.
// TR: Return yerine throw kullanmak, servisin derindeki bir çağrıdan bile durabilmesini sağlar. Express 5
// TR: async handler'lardaki hataları errorHandler'a kendisi iletir, böylece controller'lar sade kalır.
export class AppError extends Error {
    statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
    }
}
