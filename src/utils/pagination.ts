import type { Request } from "express";

export interface PaginationResult<T> {
    success: boolean;
    message?: string;
    data: T[];
    pagination: {
        totalItems: number;
        itemsPerPage: number;
        currentPage: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
    };
}

// Extracts page, limit, skip, and take parameters from the request query string
export const getPaginationParams = (req: Request) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;

    const skip = (page - 1) * limit;
    const take = limit;

    return { page, limit, skip, take };
};

// Wraps data and pagination metadata into a standardized paginated response shape
export const formatPaginatedResponse = <T>(
    data: T[],
    totalItems: number,
    page: number,
    limit: number,
    message: string = "Data retrieved successfully"
): PaginationResult<T> => {
    const totalPages = Math.ceil(totalItems / limit);

    return {
        success: true,
        message,
        data,
        pagination: {
            totalItems,
            itemsPerPage: limit,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        },
    };
};
