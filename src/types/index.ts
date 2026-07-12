export interface AppConfig {
    port: number;
    nodeEnv: string;
    databaseUrl: string;
    employeeModuleDatabaseUrl?: string;
    externalApiUrl?: string;
    externalApiToken?: string;
    flags: {
        skipDb: boolean;
    };
    jwt: {
        secret: string;
    };
    cors: {
        origin: string;
        methods: string[];
        allowedHeaders: string[];
        exposedHeaders: string[];
        credentials: boolean;
        maxAge: number;
    };
    cloudinary: {
        cloudName: string;
        apiKey: string;
        apiSecret: string;
    };
    redis: {
        url: string;
        keyPrefix: string;
    };
}
