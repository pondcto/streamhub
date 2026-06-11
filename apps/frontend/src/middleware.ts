import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * StreamHub does not use Next.js Server Actions. Public dev servers often receive
 * scanner POSTs with `Next-Action: x`, which otherwise logs noisy runtime errors.
 */
export function middleware(request: NextRequest) {
  if (request.method === "POST" && request.headers.has("next-action")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\..*).*)"],
};
