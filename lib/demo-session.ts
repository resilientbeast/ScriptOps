import "server-only";

import type { NextRequest } from "next/server";

import { decodeDemoCookie } from "@/lib/demo-cookie-core";
import {
  DEMO_COOKIE_NAME,
  getDemoCookieSecret,
} from "@/lib/demo-cookie";

export function readDemoId(request: NextRequest): string | null {
  return decodeDemoCookie(
    request.cookies.get(DEMO_COOKIE_NAME)?.value,
    getDemoCookieSecret(),
  );
}

