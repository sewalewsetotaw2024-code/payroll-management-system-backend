declare namespace Express {
    interface Request {
        user?: {
            id: string;
            role: string;
            company_id?: string;
        };
    }
}
