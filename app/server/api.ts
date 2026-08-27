import type { EventService } from "./service";
import {
  createSessionToken,
  digest,
  requireAdmin,
  sessionCookie,
  sessionToken,
  type AdminIdentity,
} from "./auth";
import { AppError } from "./errors";
import {
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  responseHeaders,
} from "./http";

export type ApiRoute = "event" | "participant" | "answer" | "admin" | "export";

export class EventApi {
  constructor(
    readonly service: EventService,
    readonly options: {
      canonicalOrigin?: string;
      participantOrigin?: string;
      adminEmails: string[];
      getUser: () => Promise<AdminIdentity | null>;
    },
  ) {}

  async handle(route: ApiRoute, request: Request): Promise<Response> {
    const publicRoute =
      route === "event" || route === "participant" || route === "answer";
    const pagesRequest = publicRoute && this.isPagesRequest(request);
    let response: Response;
    if (request.method === "OPTIONS") {
      response = pagesRequest
        ? new Response(null, { status: 204, headers: responseHeaders })
        : errorResponse(new AppError(403, "허용되지 않은 요청 출처입니다."));
    } else {
      response = await this.dispatch(route, request);
    }
    if (pagesRequest) {
      response.headers.set(
        "Access-Control-Allow-Origin",
        this.options.participantOrigin!,
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS",
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      response.headers.set("Access-Control-Max-Age", "600");
      response.headers.append("Vary", "Origin");
    }
    return response;
  }

  private isPagesRequest(request: Request): boolean {
    return (
      !!this.options.participantOrigin &&
      request.headers.get("origin") === this.options.participantOrigin
    );
  }

  private async dispatch(route: ApiRoute, request: Request): Promise<Response> {
    try {
      if (
        !["GET", "POST"].includes(request.method) ||
        ((route === "event" || route === "export") && request.method !== "GET")
      )
        throw new AppError(405, "지원하지 않는 요청 방식입니다.");
      if (request.method === "POST")
        assertSameOrigin(
          request,
          this.options.canonicalOrigin,
          route === "participant" || route === "answer"
            ? this.options.participantOrigin
            : undefined,
        );
      if (route === "event")
        return json({ event: await this.service.getPublicEvent() });
      if (route === "participant") return await this.participant(request);
      if (route === "answer") return await this.answer(request);
      const user = this.service.publicAdmin
        ? null
        : requireAdmin(await this.options.getUser(), this.options.adminEmails);
      if (route === "export")
        return new Response(await this.service.exportCsv(), {
          headers: {
            ...responseHeaders,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="colony-results.csv"',
          },
        });
      if (request.method === "GET")
        return json(
          await this.service.getAdminSnapshot(
            Number(new URL(request.url).searchParams.get("page") || 1),
          ),
        );
      await this.service.consumeRateLimit(
        user
          ? `admin:${await digest(user.userId)}`
          : `public-admin:${await digest(request.headers.get("cf-connecting-ip") || "shared")}`,
        60,
        60000,
      );
      const body = await readJson(request);
      if (body.action === "settings")
        await this.service.updateSettings(body.settings);
      else {
        const confirmations: Record<string, string> = {
          start: "행사 시작",
          close: "응답 마감",
          draw: "당첨자 추첨",
        };
        if (
          typeof body.action !== "string" ||
          !Object.hasOwn(confirmations, body.action) ||
          body.confirmation !== confirmations[body.action]
        )
          throw new AppError(400, "운영 작업을 확인한 뒤 실행해 주세요.");
        if (body.action === "start") await this.service.start();
        if (body.action === "close") await this.service.close();
        if (body.action === "draw") await this.service.draw();
      }
      return json(await this.service.getAdminSnapshot());
    } catch (error) {
      return errorResponse(error);
    }
  }

  private async participant(request: Request): Promise<Response> {
    const pagesRequest = this.isPagesRequest(request);
    const token = sessionToken(request, !pagesRequest);
    if (request.method === "GET") {
      if (!token) {
        const created = createSessionToken();
        if (pagesRequest)
          return json({ participant: null, sessionToken: created });
        return json({ participant: null }, 200, {
          "Set-Cookie": sessionCookie(created, request),
        });
      }
      const row = await this.service.getParticipantByToken(await digest(token));
      return json({
        participant: row ? await this.service.getParticipant(row.id) : null,
      });
    }
    const body = await readJson(request);
    if (!token)
      throw new AppError(409, "참여 화면을 새로고침한 뒤 다시 시도해 주세요.");
    const tokenHash = await digest(token);
    await this.service.consumeRateLimit(`register:${tokenHash}`, 8, 60000);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip)
      await this.service.consumeRateLimit(
        `register-ip:${await digest(ip)}`,
        120,
        60000,
      );
    const row = await this.service.register(body, tokenHash);
    return json({ participant: await this.service.getParticipant(row.id) });
  }

  private async answer(request: Request): Promise<Response> {
    const token = sessionToken(request, !this.isPagesRequest(request));
    if (!token) throw new AppError(401, "먼저 이벤트에 참여해 주세요.");
    const tokenHash = await digest(token);
    const participant = await this.service.getParticipantByToken(tokenHash);
    if (!participant)
      throw new AppError(
        401,
        "참여 세션이 만료되었습니다. 운영자에게 문의해 주세요.",
      );
    if (request.method === "GET") {
      const questionId = Number(
        new URL(request.url).searchParams.get("questionId"),
      );
      return json({
        distribution: await this.service.getDistribution(
          participant.id,
          questionId,
        ),
      });
    }
    const body = await readJson(request);
    if (
      typeof body.questionId !== "number" ||
      typeof body.optionIndex !== "number"
    )
      throw new AppError(400, "문항과 선택지를 확인해 주세요.");
    await this.service.consumeRateLimit(`answer:${tokenHash}`, 60, 60000);
    const distribution = await this.service.submitAnswer(
      participant.id,
      body.questionId,
      body.optionIndex,
    );
    return json({
      distribution,
      participant: await this.service.getParticipant(participant.id),
    });
  }
}
