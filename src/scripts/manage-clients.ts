import { createDatabase } from "../database.js";
import { ClientService } from "../services/client-service.js";

const db = createDatabase();
const clientService = new ClientService(db);

const command = process.argv[2];

if (!command || command === "--help" || command === "help") {
  console.log(`
Usage:
  node --experimental-strip-types src/scripts/manage-clients.ts create <name> [--permissions <perms>] [--allowed-ips <ips>] [--expires <iso_date>]
  node --experimental-strip-types src/scripts/manage-clients.ts list
  node --experimental-strip-types src/scripts/manage-clients.ts revoke <client_id>

Examples:
  node --experimental-strip-types src/scripts/manage-clients.ts create "Customer Service" --role customer-service
  node --experimental-strip-types src/scripts/manage-clients.ts create "Third Party University" --permissions "read:exams,read:registrations,read:reports"
  node --experimental-strip-types src/scripts/manage-clients.ts create "Reporting Microservice" --allowed-ips "192.168.1.100,10.0.0.1"
  node --experimental-strip-types src/scripts/manage-clients.ts list
  node --experimental-strip-types src/scripts/manage-clients.ts revoke "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  `);
  process.exit(0);
}

if (command === "create") {
  const name = process.argv[3];
  if (!name) {
    console.error("Error: Client name is required.");
    process.exit(1);
  }

  let permissions = "read:all";
  let role: "customer-service" | undefined;
  let allowedIps: string | null = null;
  let expiresAt: string | null = null;

  for (let i = 4; i < process.argv.length; i++) {
    if (process.argv[i] === "--role" && process.argv[i + 1]) {
      const value = process.argv[++i];
      if (value !== "customer-service") throw new Error("Unknown role. Use customer-service.");
      role = value;
    } else if (process.argv[i] === "--permissions" && process.argv[i + 1]) {
      permissions = process.argv[++i]!;
    } else if (process.argv[i] === "--allowed-ips" && process.argv[i + 1]) {
      allowedIps = process.argv[++i]!;
    } else if (process.argv[i] === "--expires" && process.argv[i + 1]) {
      expiresAt = process.argv[++i]!;
    }
  }

  const result = clientService.createClient({
    name,
    ...(role ? { role } : {}),
    permissions,
    allowedIps,
    expiresAt,
  });

  console.log("\n=======================================================");
  console.log("             API CLIENT CREATED SUCCESSFULLY           ");
  console.log("=======================================================");
  console.log(`Client ID   : ${result.client.id}`);
  console.log(`Name        : ${result.client.name}`);
  console.log(`Status      : ${result.client.status}`);
  console.log(`Permissions : ${result.client.permissions}`);
  console.log(`Allowed IPs : ${result.client.allowed_ips ?? "Any"}`);
  console.log(`Expires At  : ${result.client.expires_at ?? "Never"}`);
  console.log("-------------------------------------------------------");
  console.log("RAW API TOKEN (Save now, this will not be shown again!):");
  console.log(`\n  ${result.apiKey}\n`);
  console.log("Authorization header usage:");
  console.log(`  Authorization: Bearer ${result.apiKey}`);
  console.log("=======================================================\n");
  process.exit(0);
}

if (command === "list") {
  const clients = db.prepare("SELECT id, name, status, allowed_ips, permissions, last_used_at, expires_at, created_at FROM api_clients ORDER BY created_at DESC").all();
  console.log("\nRegistered API Clients:");
  console.table(clients);
  process.exit(0);
}

if (command === "revoke") {
  const clientId = process.argv[3];
  if (!clientId) {
    console.error("Error: Client ID is required.");
    process.exit(1);
  }
  const revoked = clientService.revokeClient(clientId);
  if (revoked) {
    console.log(`Client ${clientId} status set to revoked.`);
  } else {
    console.error(`Client ${clientId} not found.`);
  }
  process.exit(0);
}
