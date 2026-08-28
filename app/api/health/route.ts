export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    service: "scriptops",
    status: "healthy",
  });
}
