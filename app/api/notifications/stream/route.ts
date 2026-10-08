import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { notifications } from "@/lib/schema";
import { count, eq, and, isNull } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.driverDbId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const recipientId = session.driverDbId;

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          const [row] = await db
            .select({ count: count() })
            .from(notifications)
            .where(and(eq(notifications.recipientId, recipientId), isNull(notifications.readAt)));
          const n = row?.count ?? 0;
          controller.enqueue(`data: ${JSON.stringify({ count: n })}\n\n`);
        } catch {
          // Swallow transient DB errors; client will reconnect if stream dies
        }
      };

      // Send immediately on connect
      await send();

      // Poll every 5 seconds
      const interval = setInterval(send, 5000);

      // Clean up when the client disconnects
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
