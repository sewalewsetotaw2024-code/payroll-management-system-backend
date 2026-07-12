import multer, { MulterError } from "multer";
import type { Request, Response, NextFunction } from "express";
import httpStatus from "http-status";

// Multer instance configured with memory storage, 10MB limit, and CSV/Excel file filter
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowedMime = [
            "text/csv",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ];
        const allowedExt = /\.(csv|xlsx|xls)$/i;
        if (allowedMime.includes(file.mimetype) || allowedExt.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only CSV and Excel (.xlsx, .xls) files are allowed"));
        }
    },
});

// Middleware factory — handles single file upload with Multer and returns descriptive error responses
export function handleMulter(fieldName: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err instanceof MulterError) {
                const message =
                    err.code === "LIMIT_FILE_SIZE"
                        ? "File too large. Maximum size is 10MB"
                        : err.message;
                res.status(httpStatus.BAD_REQUEST).json({
                    error: true,
                    code: httpStatus.BAD_REQUEST,
                    message,
                });
                return;
            }
            if (err) {
                res.status(httpStatus.BAD_REQUEST).json({
                    error: true,
                    code: httpStatus.BAD_REQUEST,
                    message: err.message,
                });
                return;
            }
            next();
        });
    };
}
