import config from "../../config/env";
import logger from "../../utils/logger";

export interface ExternalCompany {
    id: number;
    name: string;
    company_code: string | null;
}

export interface ExternalBank {
    id: number;
    name: string;
    swift_code: string | null;
    is_active: boolean;
}

export interface ExternalRole {
    id: number;
    name: string;
    description: string | null;
}

export interface ExternalUser {
    id: number;
    email: string;
    role_id: number;
    is_active: boolean;
}

export interface EmployeeReportModel {
    employee_id: string;
    full_name: string;
    tin_number?: string;
    pension_number?: string;
    job_title?: string;
    department?: string;
    employment_date?: string;
    basic_salary?: number;
    gross_salary?: number;
    taxable_remuneration?: number;
}

export interface SyncReportModel {
    employee_id: string;
    employee_name: string;
    tin_number: string | null;
    pension_number: string | null;
    gender: string | null;
    date_of_birth: string | null;
    place_of_work: string | null;
    job_position: string | null;
    department_name: string | null;
    account_number: string | null;
    employment_date: string | null;
    employment_end_date: string | null;
    probation_end_date: string | null;
    employment_type: string | null;
    contract_reference: string | null;
    basic_salary: number | null;
    basic_earning: number | null;
    gross_salary: number | null;
    taxable_remuneration: number | null;
    transportation_allowance: number | null;
    telephone_allowance: number | null;
    representation_allowance: number | null;
    housing_allowance: number | null;
    meal_allowance: number | null;
    other_payments: number | null;
    cost_sharing_balance: number | null;
    email: string | null;
    manager_name: string | null;
}

export interface ExternalLeaveType {
    id: number;
    name: string;
    code: string;
    default_allowance_days: number | null;
    is_paid: boolean;
}

export interface ExternalLeaveBalance {
    employee_id: string;
    leave_type_id: number;
    total_entitlement: number;
    used_days: number;
    pending_days: number;
    remaining_days: number;
    expiry_date: string | null;
    /** NOTE: EMS returns this as `leaveType` (camelCase) inside the balance object. */
    leaveType: { name: string; code: string };
    fiscal_year: number;
}

export interface ExternalLeaveApplication {
    id: number;
    employee_id: string;
    leave_type_id: number;
    start_date: string;
    end_date: string;
    requested_days: number;
    is_start_half_day: boolean;
    current_status: string;
    company_id: number;
    leaveType: {
        id: number;
        name: string;
        code: string;
        is_paid: boolean | null;
    };
    employee?: {
        id: string;
        full_name: string;
        employments?: Array<{
            basic_salary: string | null;
            gross_salary: string | null;
        }>;
    };
}

interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

/**
 * Client for communicating with the external employee module API.
 * Handles authentication via Bearer token and provides typed methods for fetching
 * companies, banks, roles, users, and employee sync data.
 */
export class ExternalApiClient {
    constructor(private readonly baseUrl: string) { }

    /**
     * Sends an authenticated HTTP request to the external API and parses the JSON response.
     * Automatically attaches the Bearer token and Content-Type header.
     *
     * @param path - The API endpoint path (e.g. "/companies").
     * @param token - The Bearer token for authentication.
     * @param options - Optional fetch options (method, body, headers, etc.).
     * @returns The parsed response data of type T.
     * @throws {Error} If the API returns a non-OK status code.
     */
    private async request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        logger.debug({ method: options?.method || "GET", url }, "external_api.request");

        const res = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                ...options?.headers,
            },
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            logger.error({ status: res.status, url, response: body }, "external_api.failed");
            throw new Error(`Employee Module API error ${res.status} ${res.statusText} — ${body}`);
        }

        return res.json() as Promise<T>;
    }

    /**
     * Fetches the list of companies from the external system.
     *
     * @param token - The Bearer token for authentication.
     * @returns An array of external company records.
     */
    async getCompanies(token: string): Promise<ExternalCompany[]> {
        const res = await this.request<{
            status: string;
            data: { companies: ExternalCompany[] };
        }>("/companies", token);
        return res.data.companies;
    }

    /**
     * Fetches the list of banks from the external system.
     *
     * @param token - The Bearer token for authentication.
     * @returns An array of external bank records.
     */
    async getBanks(token: string): Promise<ExternalBank[]> {
        const res = await this.request<{
            status: string;
            data: { banks: ExternalBank[] };
        }>("/banks", token);
        return res.data.banks;
    }

    /**
     * Fetches the list of application roles from the external system.
     * Handles both array and wrapped response formats.
     *
     * @param token - The Bearer token for authentication.
     * @returns An array of external role records.
     */
    async getRoles(token: string): Promise<ExternalRole[]> {
        const res = await this.request<{
            status: string;
            data: ExternalRole[];
        }>("/roles", token);
        // The API returns data as a direct array: { status, data: [ ... ] }
        const data = res.data;
        return Array.isArray(data) ? data : [];
    }

    /**
     * Fetches all application users from the external system with pagination support.
     * Optionally filters to only active users.
     *
     * @param token - The Bearer token for authentication.
     * @param activeOnly - Whether to filter for active users only (defaults to true).
     * @returns An array of all external user records across all pages.
     */
    async getUsers(token: string, activeOnly = true): Promise<ExternalUser[]> {
        const all: ExternalUser[] = [];
        let page = 1;
        const limit = 500;

        while (true) {
            const qs = `?limit=${limit}&page=${page}${activeOnly ? "&is_active=true" : ""}`;
            const res = await this.request<{
                status: string;
                data: { users: ExternalUser[]; pagination: PaginationMeta };
            }>(`/users${qs}`, token);
            const users = res.data?.users || [];
            all.push(...users);
            const pagination = res.data?.pagination;
            if (!pagination || page >= pagination.totalPages) break;
            page++;
        }

        return all;
    }

    /**
     * Fetches the employee sync report from the external system.
     * This endpoint provides all employee data needed for synchronization.
     *
     * @param token - The Bearer token for authentication.
     * @returns An array of sync report records containing full employee details.
     */
    
    async getSyncReport(token: string, companyId: number): Promise<SyncReportModel[]> {
        const res = await this.request<{
            status: string;
            data: SyncReportModel[];
        }>(`/employees/sync-report?company_id=${companyId}`, token);
        return res.data || [];
    }

    /**
     * Fetches all employees from the external system with pagination support.
     *
     * @param token - The Bearer token for authentication.
     * @returns An array of all employee report records across all pages.
     */
    async getEmployees(token: string): Promise<EmployeeReportModel[]> {
        const all: EmployeeReportModel[] = [];
        let page = 1;
        const limit = 200;

        while (true) {
            const res = await this.request<{
                status: string;
                data: { employees: EmployeeReportModel[]; pagination: PaginationMeta };
            }>(`/employees?limit=${limit}&page=${page}`, token);
            const employees = res.data?.employees || [];
            all.push(...employees);
            const pagination = res.data?.pagination;
            if (!pagination || page >= pagination.totalPages) break;
            page++;
        }

        return all;
    }

    async getLeaveTypes(token: string): Promise<ExternalLeaveType[]> {
        const res = await this.request<{
            status: string;
            data: { leaveTypes: ExternalLeaveType[] };
        }>("/leave-types", token);
        return res.data?.leaveTypes || [];
    }

    async getLeaveBalances(token: string, companyId: number, fiscalYear?: number): Promise<ExternalLeaveBalance[]> {
        let path = `/leave-balances?company_id=${companyId}`;
        if (fiscalYear) path += `&fiscal_year=${fiscalYear}`;

        const res = await this.request<{
            status: string;
            data: {
                fiscal_year?: number;
                employees?: Array<{
                    id: string;
                    leaveBalances?: ExternalLeaveBalance[];
                }>;
            };
        }>(path, token);

        // EMS returns { data: { employees: [ { id, leaveBalances: [...] } ] } }
        // Flatten: collect all leaveBalances across all employees into a single array.
        const allBalances: ExternalLeaveBalance[] = [];
        for (const emp of res.data?.employees || []) {
            for (const bal of emp.leaveBalances || []) {
                allBalances.push({
                    ...bal,
                    // Ensure employee_id is set (balance may or may not carry it)
                    employee_id: bal.employee_id || emp.id,
                });
            }
        }
        return allBalances;
    }

    async getLeaveApplications(token: string, companyId: number, startDate: string, endDate: string): Promise<ExternalLeaveApplication[]> {
        // Build query — only include date params when they are non-empty
        // to avoid sending "start_date=&end_date=" which creates Invalid Date on the EMS side.
        let path = `/leave-applications?status=APPROVED&company_id=${companyId}`;
        if (startDate) path += `&start_date=${startDate}`;
        if (endDate) path += `&end_date=${endDate}`;

        const res = await this.request<{
            status: string;
            data: { applications: ExternalLeaveApplication[] };
        }>(path, token);
        // EMS returns { status, data: { applications, pagination } }
        return res.data?.applications || [];
    }

    async getLeaveSettings(token: string, companyId: number): Promise<Record<string, unknown>> {
        const path = `/leave-settings?company_id=${companyId}`;
        const res = await this.request<{
            status: string;
            data: Record<string, unknown>;
        }>(path, token);
        return res.data || {};
    }
}

export const externalApiClient = new ExternalApiClient(
    config.externalApiUrl || "http://localhost:5000/api/v1",
);
