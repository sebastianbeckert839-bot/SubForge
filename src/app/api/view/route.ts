import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Records one page view (called once per browser session by the client). */
export async function POST(): Promise<NextResponse> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    await db.pageView.upsert({
      where: { day },
      update: { count: { increment: 1 } },
      create: { day, count: 1 },
    });
    return NextResponse.json({ ok: true });
  } catch {
    // non-critical — fail soft
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
