type ServiceStatus = "ok" | "degraded" | "failed" | "unknown";

interface DependencyHealth {
    status: ServiceStatus;
    message?: string;
    checkedAt: string;
}

interface HttpMetrics {
    totalRequests: number;
    failedRequests: number;
    lastStatusCode?: number;
    lastPath?: string;
}

interface PdfMetrics {
    totalGenerations: number;
    successfulGenerations: number;
    failedGenerations: number;
    lastError?: string;
}

interface HealthSnapshot {
    status: "ok" | "degraded" | "failed";
    uptimeSeconds: number;
    dependencies: Record<string, DependencyHealth>;
    metrics: {
        http: HttpMetrics;
        pdf: PdfMetrics;
    };
}

class RuntimeMonitor {
    private dependencyHealth: Record<string, DependencyHealth> = {};
    private httpMetrics: HttpMetrics = {
        totalRequests: 0,
        failedRequests: 0,
    };
    private pdfMetrics: PdfMetrics = {
        totalGenerations: 0,
        successfulGenerations: 0,
        failedGenerations: 0,
    };

    constructor() {
        this.setDependencyStatus("postgresql", "unknown", "Not checked yet");
        this.setDependencyStatus("redis", "unknown", "Not checked yet");
        this.setDependencyStatus("cloudinary", "unknown", "Not checked yet");
        this.setDependencyStatus("puppeteer", "unknown", "Not checked yet");
    }

    setDependencyStatus(service: string, status: ServiceStatus, message?: string): void {
        this.dependencyHealth[service] = {
            status,
            message,
            checkedAt: new Date().toISOString(),
        };
    }

    recordHttpRequest(method: string, path: string, statusCode: number): void {
        this.httpMetrics.totalRequests += 1;
        this.httpMetrics.lastStatusCode = statusCode;
        this.httpMetrics.lastPath = `${method} ${path}`;
        if (statusCode >= 400) {
            this.httpMetrics.failedRequests += 1;
        }
    }

    recordPdfGenerationSuccess(): void {
        this.pdfMetrics.totalGenerations += 1;
        this.pdfMetrics.successfulGenerations += 1;
    }

    recordPdfGenerationFailure(error: string): void {
        this.pdfMetrics.totalGenerations += 1;
        this.pdfMetrics.failedGenerations += 1;
        this.pdfMetrics.lastError = error;
    }

    getSnapshot(): HealthSnapshot {
        const dependencyEntries = Object.entries(this.dependencyHealth);
        const failed = dependencyEntries.some(([, value]) => value.status === "failed");
        const degraded = dependencyEntries.some(([, value]) => value.status === "degraded");

        return {
            status: failed ? "failed" : degraded ? "degraded" : "ok",
            uptimeSeconds: Math.round(process.uptime()),
            dependencies: this.dependencyHealth,
            metrics: {
                http: this.httpMetrics,
                pdf: this.pdfMetrics,
            },
        };
    }
}

export const monitoring = new RuntimeMonitor();
export type { DependencyHealth, HealthSnapshot, HttpMetrics, PdfMetrics, ServiceStatus };
