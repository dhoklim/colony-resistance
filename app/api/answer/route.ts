import { createApi } from "../../server/context";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return createApi().handle("answer", request);
}
export async function POST(request: Request) {
  return createApi().handle("answer", request);
}
