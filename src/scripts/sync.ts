import { runFullSync } from "../services/sync/syncRunner";
import config from "../config/env";

// Entry point — runs a full external sync triggered via CLI with an optional --token flag
async function main() {
    const token = process.argv
        .find((arg) => arg.startsWith("--token="))
        ?.split("=")[1] || config.externalApiToken;

    if (!token) {
        console.error(
            "Usage: npx tsx src/scripts/sync.ts --token=<jwt-or-api-key>\n" +
            "Or set EXTERNAL_API_TOKEN in .env",
        );
        process.exit(1);
    }

    console.log("Starting full sync...");

    try {
        const result = await runFullSync(1, token);
        console.log("Sync completed:", JSON.stringify(result, null, 2));
        process.exit(0);
    } catch (error) {
        console.error("Sync failed:", (error as Error).message);
        process.exit(1);
    }
}

main();
