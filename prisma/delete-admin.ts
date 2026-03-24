import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5434/empire_lms";
const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("🗑️  Deleting admin user...\n");

  // Delete existing admin user
  await db.account.deleteMany({ where: { accountId: "admin@empire-lms.com" } });
  await db.user.deleteMany({ where: { email: "admin@empire-lms.com" } });

  console.log("✅ Admin user deleted.\n");
  console.log("📝 Next steps:");
  console.log("   1. Go to http://localhost:3000/register");
  console.log("   2. Sign up with email: admin@empire-lms.com");
  console.log("   3. Run the following command to make them admin:\n");
  console.log("      npx tsx prisma/make-admin.ts\n");
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Error:", e);
    await db.$disconnect();
    process.exit(1);
  });
