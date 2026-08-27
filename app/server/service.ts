import { questions } from "../lib/questions";
import { drawWinners, escapeCsvCell, scoreOptions } from "../lib/rules";
import type {
  AdminSnapshot,
  Distribution,
  DrawResult,
  EventStatus,
  LeaderboardEntry,
  ParticipantSnapshot,
  PublicEvent,
  Settings,
} from "../lib/contracts";
import { AppError, isRecord } from "./errors";

type EventRow = {
  status: EventStatus;
  settings: string;
  privacy_version: number;
  final_counts: string | null;
  closed_at: string | null;
};
type ParticipantRow = {
  id: string;
  name: string;
  student_id: string;
  expires_at: number;
  created_at: string;
  completed_at: string | null;
};
type CountRow = { questionId: number; optionIndex: number; count: number };
type AnswerRow = { questionId: number; optionIndex: number };
type EntryRow = ParticipantRow & { answerData: string };
const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;

function normalizeSettings(input: unknown): Settings {
  if (
    !isRecord(input) ||
    typeof input.organizer !== "string" ||
    typeof input.privacyContact !== "string" ||
    typeof input.instagramUrl !== "string" ||
    typeof input.retentionDays !== "number"
  ) {
    throw new AppError(400, "운영 안내를 모두 입력해 주세요.");
  }
  const { retentionDays } = input;
  const organizer = input.organizer.trim();
  const privacyContact = input.privacyContact.trim();
  const instagramUrl = input.instagramUrl.trim();
  if (
    !organizer ||
    organizer.length > 80 ||
    !privacyContact ||
    privacyContact.length > 160 ||
    !Number.isInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > 365
  ) {
    throw new AppError(
      400,
      "운영 주체·문의처와 1~365일 범위의 보관 기간을 입력해 주세요.",
    );
  }
  if (instagramUrl) {
    let url: URL;
    try {
      url = new URL(instagramUrl);
    } catch {
      throw new AppError(400, "올바른 인스타그램 주소를 입력해 주세요.");
    }
    if (
      url.protocol !== "https:" ||
      !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw new AppError(
        400,
        "https://www.instagram.com/ 형식의 주소를 입력해 주세요.",
      );
    }
  }
  return { organizer, privacyContact, retentionDays, instagramUrl };
}

function makeCounts(rows: CountRow[]): number[][] {
  const counts = questions.map(() => [0, 0, 0, 0]);
  for (const row of rows)
    counts[row.questionId - 1][row.optionIndex] = row.count;
  return counts;
}

export class EventService {
  constructor(
    readonly db: Pick<D1Database, "prepare" | "batch">,
    readonly publicAdmin = false,
  ) {}

  private async event(): Promise<EventRow> {
    let row = await this.db
      .prepare("SELECT * FROM events WHERE id = 1")
      .first<EventRow>();
    if (!row) {
      await this.db
        .prepare("INSERT OR IGNORE INTO events (id) VALUES (1)")
        .run();
      row = await this.db
        .prepare("SELECT * FROM events WHERE id = 1")
        .first<EventRow>();
    }
    if (!row) throw new Error("Event initialization failed.");
    return row;
  }

  private async counts(event: EventRow): Promise<number[][]> {
    if (event.final_counts !== null)
      return makeCounts(JSON.parse(event.final_counts) as CountRow[]);
    const rows = await this.db
      .prepare(
        "SELECT question_id AS questionId, option_index AS optionIndex, COUNT(*) AS count FROM answers GROUP BY question_id, option_index",
      )
      .all<CountRow>();
    return makeCounts(rows.results);
  }

  async getPublicEvent(): Promise<PublicEvent> {
    const event = await this.event();
    const counts = await this.db
      .prepare(
        "SELECT COUNT(*) AS participants, COUNT(completed_at) AS completed FROM participants",
      )
      .first<{ participants: number; completed: number }>();
    return {
      status: event.status,
      settings: JSON.parse(event.settings) as Settings,
      participantCount: counts?.participants ?? 0,
      completedCount: counts?.completed ?? 0,
      closedAt: event.closed_at,
      privacyVersion: event.privacy_version,
      publicAdmin: this.publicAdmin,
    };
  }

  async updateSettings(input: unknown): Promise<PublicEvent> {
    const settings = normalizeSettings(input);
    await this.event();
    const result = await this.db
      .prepare(
        "UPDATE events SET settings = ?, privacy_version = privacy_version + 1 WHERE id = 1 AND status = 'draft'",
      )
      .bind(JSON.stringify(settings))
      .run();
    if (!result.meta.changes)
      throw new AppError(
        409,
        "행사 시작 후에는 운영 안내를 변경할 수 없습니다.",
      );
    return this.getPublicEvent();
  }

  async start(): Promise<PublicEvent> {
    const event = await this.event();
    if (event.status === "open") return this.getPublicEvent();
    if (event.status !== "draft")
      throw new AppError(409, "마감된 행사는 다시 시작할 수 없습니다.");
    normalizeSettings(JSON.parse(event.settings));
    await this.db
      .prepare(
        "UPDATE events SET status = 'open' WHERE id = 1 AND status = 'draft'",
      )
      .run();
    return this.getPublicEvent();
  }

  async register(input: unknown, tokenHash: string): Promise<ParticipantRow> {
    if (
      !isRecord(input) ||
      typeof input.name !== "string" ||
      typeof input.studentId !== "string" ||
      input.consent !== true ||
      !Number.isInteger(input.privacyVersion)
    ) {
      throw new AppError(
        400,
        "이름과 학번을 입력하고 개인정보 수집 안내에 동의해 주세요.",
      );
    }
    if (this.publicAdmin && input.publicAdminConsent !== true)
      throw new AppError(
        400,
        "공개 운영실 안내를 확인해야 합니다. 새로고침 후 이름·학번 등의 공개에 동의해 주세요.",
      );
    const name = input.name.trim().normalize("NFC");
    const studentId = input.studentId
      .normalize("NFKC")
      .replace(/[\s-]/g, "")
      .toUpperCase();
    if (
      !name ||
      name.length > 40 ||
      /[\u0000-\u001f\u007f]/.test(name) ||
      !/^[A-Z0-9]{4,20}$/.test(studentId) ||
      !/^[a-f0-9]{64}$/.test(tokenHash)
    ) {
      throw new AppError(
        400,
        "이름은 40자 이내, 학번은 영문·숫자 4~20자로 입력해 주세요.",
      );
    }
    const event = await this.event();
    if (input.privacyVersion !== event.privacy_version)
      throw new AppError(
        400,
        "운영 안내가 변경되었습니다. 새로고침 후 다시 동의해 주세요.",
      );
    const existing = await this.getParticipantByToken(tokenHash);
    if (existing) {
      if (existing.name !== name || existing.student_id !== studentId)
        throw new AppError(409, "이 브라우저에서는 이미 참여했습니다.");
      return existing;
    }
    if (event.status !== "open")
      throw new AppError(
        409,
        event.status === "draft"
          ? "아직 행사가 시작되지 않았습니다."
          : "이벤트 참여가 마감되었습니다.",
      );
    await this.db
      .prepare(
        `INSERT INTO participants (id,name,student_id,token_hash,expires_at,consent_version,created_at)
      SELECT ?,?,?,?,?,?,? FROM events WHERE id = 1 AND status = 'open' AND privacy_version = ?
      ON CONFLICT DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        name,
        studentId,
        tokenHash,
        Date.now() + SESSION_LIFETIME,
        event.privacy_version,
        new Date().toISOString(),
        event.privacy_version,
      )
      .run();
    const participant = await this.getParticipantByToken(tokenHash);
    if (!participant)
      throw new AppError(
        409,
        "이미 등록된 학번이거나 참여가 마감되었습니다. 기존 브라우저에서 이어가거나 운영자에게 문의해 주세요.",
      );
    if (participant.name !== name || participant.student_id !== studentId)
      throw new AppError(409, "이 브라우저에서는 이미 참여했습니다.");
    return participant;
  }

  async getParticipantByToken(
    tokenHash: string,
  ): Promise<ParticipantRow | null> {
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
    return this.db
      .prepare(
        "SELECT id,name,student_id,expires_at,created_at,completed_at FROM participants WHERE token_hash = ? AND expires_at > ?",
      )
      .bind(tokenHash, Date.now())
      .first<ParticipantRow>();
  }

  private async participant(id: string): Promise<ParticipantRow> {
    const row = await this.db
      .prepare(
        "SELECT id,name,student_id,expires_at,created_at,completed_at FROM participants WHERE id = ?",
      )
      .bind(id)
      .first<ParticipantRow>();
    if (!row)
      throw new AppError(
        401,
        "참가 정보를 확인할 수 없습니다. 처음 화면에서 다시 확인해 주세요.",
      );
    return row;
  }

  async getParticipant(id: string): Promise<ParticipantSnapshot> {
    const participant = await this.participant(id);
    const event = await this.event();
    const counts = await this.counts(event);
    const rows = await this.db
      .prepare(
        "SELECT question_id AS questionId, option_index AS optionIndex FROM answers WHERE participant_id = ? ORDER BY question_id",
      )
      .bind(id)
      .all<AnswerRow>();
    const answers = rows.results.map((answer) => ({
      ...answer,
      points: scoreOptions(counts[answer.questionId - 1])[answer.optionIndex],
    }));
    return {
      displayName: participant.name,
      code: participant.id.slice(0, 8).toUpperCase(),
      answers,
      completed: answers.length === 10,
      score: answers.reduce((sum, answer) => sum + answer.points, 0),
      final: event.final_counts !== null,
    };
  }

  async submitAnswer(
    id: string,
    questionId: number,
    optionIndex: number,
  ): Promise<Distribution> {
    if (
      !Number.isInteger(questionId) ||
      questionId < 1 ||
      questionId > 10 ||
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex > 3
    )
      throw new AppError(400, "유효한 문항과 선택지를 선택해 주세요.");
    await this.participant(id);
    await this.event();
    const now = new Date().toISOString();
    // The status and sequence checks live inside the write, so close/submit races cannot admit a late vote.
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO answers (participant_id,question_id,option_index,created_at)
        SELECT ?,?,?,? FROM events WHERE id = 1 AND status = 'open'
        AND (SELECT COUNT(*) FROM answers WHERE participant_id = ?) = ?
        ON CONFLICT (participant_id,question_id) DO NOTHING`,
        )
        .bind(id, questionId, optionIndex, now, id, questionId - 1),
      this.db
        .prepare(
          `UPDATE participants SET completed_at = ? WHERE id = ? AND completed_at IS NULL
        AND (SELECT COUNT(*) FROM answers WHERE participant_id = ?) = 10`,
        )
        .bind(now, id, id),
    ]);
    const answer = await this.db
      .prepare(
        "SELECT option_index AS optionIndex FROM answers WHERE participant_id = ? AND question_id = ?",
      )
      .bind(id, questionId)
      .first<{ optionIndex: number }>();
    if (!answer)
      throw new AppError(
        409,
        (await this.event()).status === "open"
          ? "문항 순서대로 답변해 주세요."
          : "참여가 마감되어 답변을 저장하지 못했습니다.",
      );
    if (answer.optionIndex !== optionIndex)
      throw new AppError(409, "이미 제출한 답변은 변경할 수 없습니다.");
    return this.getDistribution(id, questionId);
  }

  async getDistribution(id: string, questionId: number): Promise<Distribution> {
    if (!Number.isInteger(questionId) || questionId < 1 || questionId > 10)
      throw new AppError(400, "존재하지 않는 문항입니다.");
    const answer = await this.db
      .prepare(
        "SELECT option_index AS optionIndex FROM answers WHERE participant_id = ? AND question_id = ?",
      )
      .bind(id, questionId)
      .first<{ optionIndex: number }>();
    if (!answer)
      throw new AppError(
        403,
        "답변을 제출한 문항의 결과만 확인할 수 있습니다.",
      );
    const event = await this.event();
    const counts = (await this.counts(event))[questionId - 1];
    const total = counts.reduce((sum, count) => sum + count, 0);
    return {
      questionId,
      counts,
      total,
      percentages: counts.map((count) =>
        total ? Math.round((count / total) * 1000) / 10 : 0,
      ),
      points: scoreOptions(counts),
      selectedIndex: answer.optionIndex,
      final: event.final_counts !== null,
      updatedAt: event.closed_at ?? new Date().toISOString(),
    };
  }

  async close(): Promise<PublicEvent> {
    const event = await this.event();
    if (event.status === "draft")
      throw new AppError(409, "시작하지 않은 행사를 마감할 수 없습니다.");
    // One SQLite statement freezes the exact same vote set that it closes.
    await this.db
      .prepare(
        `UPDATE events SET status = 'closed', closed_at = ?, final_counts = (
      SELECT json_group_array(json_object('questionId',question_id,'optionIndex',option_index,'count',count))
      FROM (SELECT question_id,option_index,COUNT(*) AS count FROM answers GROUP BY question_id,option_index)
    ) WHERE id = 1 AND status = 'open'`,
      )
      .bind(new Date().toISOString())
      .run();
    return this.getPublicEvent();
  }

  private async entries(
    counts: number[][],
    completeOnly = false,
    page?: number,
  ): Promise<LeaderboardEntry[]> {
    const rows = await this.db
      .prepare(
        `SELECT p.id,p.name,p.student_id,p.created_at,p.completed_at,
      json_group_array(json_object('questionId',a.question_id,'optionIndex',a.option_index)) FILTER (WHERE a.question_id IS NOT NULL) AS answerData
      FROM participants p LEFT JOIN answers a ON a.participant_id = p.id
      ${completeOnly ? "WHERE p.completed_at IS NOT NULL" : ""}
      GROUP BY p.id ORDER BY p.created_at DESC,p.id ASC ${page ? "LIMIT 50 OFFSET ?" : ""}`,
      )
      .bind(...(page ? [(page - 1) * 50] : []))
      .all<EntryRow>();
    return rows.results.map((row) => {
      const answers = JSON.parse(row.answerData) as AnswerRow[];
      return {
        id: row.id,
        name: row.name,
        studentId: row.student_id,
        completed: answers.length === 10,
        answeredCount: answers.length,
        score: answers.reduce(
          (sum, a) =>
            sum + scoreOptions(counts[a.questionId - 1])[a.optionIndex],
          0,
        ),
        registeredAt: row.created_at,
      };
    });
  }

  private async savedDraw(): Promise<DrawResult | null> {
    const row = await this.db
      .prepare(
        "SELECT winners,eligible_count,drawn_at FROM draws WHERE event_id = 1",
      )
      .first<{ winners: string; eligible_count: number; drawn_at: string }>();
    return row
      ? {
          winners: JSON.parse(row.winners) as DrawResult["winners"],
          eligibleCount: row.eligible_count,
          drawnAt: row.drawn_at,
        }
      : null;
  }

  async draw(): Promise<DrawResult> {
    const event = await this.event();
    const saved = await this.savedDraw();
    if (saved) return saved;
    if (event.status !== "closed" || event.final_counts === null)
      throw new AppError(
        409,
        "응답 마감과 최종 집계가 끝난 뒤 추첨할 수 있습니다.",
      );
    const candidates = (
      await this.entries(await this.counts(event), true)
    ).filter((row) => row.completed);
    if (!candidates.length)
      throw new AppError(
        409,
        "10문항을 완료한 참가자가 없어 추첨할 수 없습니다.",
      );
    const ids = drawWinners(candidates);
    const winners = ids.map((id) => {
      const candidate = candidates.find((row) => row.id === id)!;
      return {
        id: candidate.id,
        name: candidate.name,
        studentId: candidate.studentId,
        score: candidate.score,
      };
    });
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO draws (event_id,winners,candidates,eligible_count,drawn_at)
        SELECT 1,?,?,?,? FROM events WHERE id = 1 AND status = 'closed'
        ON CONFLICT (event_id) DO NOTHING`,
        )
        .bind(
          JSON.stringify(winners),
          JSON.stringify(
            candidates.map((row) => ({ id: row.id, score: row.score })),
          ),
          candidates.length,
          new Date().toISOString(),
        ),
      this.db.prepare(
        "UPDATE events SET status = 'drawn' WHERE id = 1 AND status = 'closed' AND EXISTS (SELECT 1 FROM draws WHERE event_id = 1)",
      ),
    ]);
    const result = await this.savedDraw();
    if (!result) throw new Error("Draw was not persisted.");
    return result;
  }

  async getAdminSnapshot(page = 1): Promise<AdminSnapshot> {
    const event = await this.getPublicEvent();
    const totalPages = Math.max(1, Math.ceil(event.participantCount / 50));
    const safePage = Number.isSafeInteger(page)
      ? Math.min(Math.max(page, 1), totalPages)
      : 1;
    const counts = await this.counts(await this.event());
    return {
      event,
      distributions: counts.map((values, index) => ({
        questionId: index + 1,
        counts: values,
        total: values.reduce((sum, count) => sum + count, 0),
        points: scoreOptions(values),
      })),
      participants: await this.entries(counts, false, safePage),
      page: safePage,
      pageSize: 50,
      totalPages,
      draw: await this.savedDraw(),
    };
  }

  async exportCsv(): Promise<string> {
    const event = await this.event();
    const rows = await this.entries(await this.counts(event));
    const header = [
      "참가코드",
      "이름",
      "학번",
      "완료 문항",
      "군체 저항도",
      "점수 기준",
      "추첨 대상",
    ];
    return (
      "\ufeff" +
      [
        header,
        ...rows.map((row) => [
          row.id.slice(0, 8).toUpperCase(),
          row.name,
          row.studentId,
          String(row.answeredCount),
          String(row.score),
          event.final_counts === null ? "잠정" : "확정",
          row.completed ? "대상" : "미완료",
        ]),
      ]
        .map((row) => row.map(escapeCsvCell).join(","))
        .join("\r\n")
    );
  }

  async consumeRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): Promise<void> {
    const results = await this.db.batch([
      this.db
        .prepare("DELETE FROM rate_limits WHERE window_end < ?")
        .bind(now - windowMs),
      this.db
        .prepare(
          `INSERT INTO rate_limits (key,hits,window_end) VALUES (?,1,?) ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN window_end <= ? THEN 1 ELSE hits + 1 END,
        window_end = CASE WHEN window_end <= ? THEN ? ELSE window_end END RETURNING hits`,
        )
        .bind(key, now + windowMs, now, now, now + windowMs),
    ]);
    const row = results[1].results[0] as { hits: number };
    if (row.hits > limit)
      throw new AppError(
        429,
        "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      );
  }
}
