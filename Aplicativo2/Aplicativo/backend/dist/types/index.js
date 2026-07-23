"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
/** Error personalizado con código HTTP */
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
exports.AppError = AppError;
//# sourceMappingURL=index.js.map