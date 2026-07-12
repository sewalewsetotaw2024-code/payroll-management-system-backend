// Custom error class with HTTP status code and operational flag for error handling middleware
class CustomError extends Error {
    statusCode: number;
    isOperational: boolean;

    // Creates a CustomError with the given status code, message, and operational flag
    constructor(
        statusCode: number,
        message: string,
        isOperational = true,
        stack = "",
    ) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
        this.statusCode = statusCode;
        this.isOperational = isOperational;
    }
}

export default CustomError;