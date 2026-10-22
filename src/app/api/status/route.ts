import { aiConfigured } from "@/server/ai/provider";

export async function GET() {
  return Response.json(
    {
      data: {
        aiConfigured: aiConfigured(),
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        databaseConfigured: Boolean(process.env.DATABASE_URL),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
