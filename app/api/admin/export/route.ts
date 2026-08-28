import { createApi } from "../../../server/context";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return createApi().handle("export", request);
}
export const OPTIONS = GET;
