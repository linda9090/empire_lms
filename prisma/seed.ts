import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const prismaClientSingleton = () => {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5434/empire_lms";
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
};

const db = prismaClientSingleton();

/**
 * Hash password using scrypt with lower params for compatibility
 * Format: salt:hash (base64 encoded)
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64");
  const keylen = 32;
  const N = 512; // Lower CPU/memory cost
  const r = 8; // block size
  const p = 1; // parallelization

  const derivedKey = (await scryptAsync(password, salt, keylen, {
    N,
    r,
    p,
  })) as Buffer;

  return `${salt}:${derivedKey.toString("base64")}`;
}

async function main() {
  console.log("🌱 Starting database seed...\n");

  // Check if admin already exists
  const existingAdmin = await db.user.findUnique({
    where: { email: "admin@empire-lms.com" },
  });

  if (existingAdmin) {
    console.log("⚠️  Admin user already exists. Skipping seed.\n");
    console.log("   Email: admin@empire-lms.com");
    console.log(`   Role: ${existingAdmin.role}\n`);
    return;
  }

  // Hash password
  const adminPassword = "Admin1234!";
  const hashedPassword = await hashPassword(adminPassword);

  console.log("📧 Creating admin user...");
  console.log("   Email: admin@empire-lms.com");
  console.log("   Password: Admin1234!");
  console.log("   Role: ADMIN\n");

  // Create admin user with account
  const admin = await db.user.create({
    data: {
      email: "admin@empire-lms.com",
      name: "System Administrator",
      role: "ADMIN",
      emailVerified: true,
      accounts: {
        create: {
          accountId: "admin@empire-lms.com",
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
  });

  console.log("✅ Admin user created successfully!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔑 Admin Credentials");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Password: ${adminPassword}`);
  console.log(`   Role:     ${admin.role}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Count total users
  const userCount = await db.user.count();
  console.log(`📊 Total users in database: ${userCount}\n`);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await db.$disconnect();
    process.exit(1);
  });
