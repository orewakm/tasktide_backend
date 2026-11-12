export class AppError extends Error {
    statusCode: number;

    // Creates an error that carries an HTTP status code.
    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
    }
}
