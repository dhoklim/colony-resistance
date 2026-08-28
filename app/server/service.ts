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
  round: number;
  revealed_questions: number;
  settings: string;
  privacy_version: number;
  final_counts: string | null;
  closed_at: string | null;
};
type ParticipantRow = {
  id: string;
  name: string;
  expires_at: number;
  created_at: string;
  completed_at: string | null;
};
type CountRow = { questionId: number; optionIndex: number; count: number };
type AnswerRow = { questionId: number; optionIndex: number };
type EntryRow = ParticipantRow & { answerData: string };
const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;

function isRevealed(event: EventRow, questionId: number): boolean {
  return (event.revealed_questions & (1 << (questionId - 1))) !== 0;
}

function assertCurrentRound(event: EventRow, expected?: number) {
  if (expected === undefined) return;
  if (!Number.isSafeInteger(expected) || expected < 1)
    throw new AppError(400, "행사 정보를 확인해 주세요.");
  if (event.round !== expected)
    throw new AppError(409, "행사가 다시 시작되었습니다. 화면을 새로고침해 주세요.");
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
      round: event.round,
      revealedQuestions: questions.filter((question) => isRevealed(event, question.id)).map((question) => question.id),
      settings: JSON.parse(event.settings) as Settings,
      participantCount: counts?.participants ?? 0,
      completedCount: counts?.completed ?? 0,
      closedAt: event.closed_at,
      privacyVersion: event.privacy_version,
      publicAdmin: this.publicAdmin,
    };
  }

  async start(expectedRound?: number): Promise<PublicEvent> {
    const event = await this.event();
    assertCurrentRound(event, expectedRound);
    if (event.status === "open") return this.getPublicEvent();
    if (event.status !== "draft")
      throw new AppError(409, "마감된 행사는 다시 시작할 수 없습니다.");
    await this.db
      .prepare(
        "UPDATE events SET status = 'open' WHERE id = 1 AND status = 'draft' AND round = ?",
      )
      .bind(event.round)
      .run();
    return this.getPublicEvent();
  }

  async reset(expectedRound: number): Promise<PublicEvent> {
    if (!Number.isSafeInteger(expectedRound) || expectedRound < 1)
      throw new AppError(400, "행사 정보를 확인해 주세요.");
    const event = await this.event();
    if (expectedRound < event.round) return this.getPublicEvent();
    assertCurrentRound(event, expectedRound);
    // Guard every statement so a retry cannot delete a newer round's records.
    await this.db.batch([
      this.db
        .prepare("DELETE FROM draws WHERE event_id = 1 AND EXISTS (SELECT 1 FROM events WHERE id = 1 AND round = ?)")
        .bind(expectedRound),
      this.db
        .prepare("DELETE FROM answers WHERE EXISTS (SELECT 1 FROM events WHERE id = 1 AND round = ?)")
        .bind(expectedRound),
      this.db
        .prepare("DELETE FROM participants WHERE EXISTS (SELECT 1 FROM events WHERE id = 1 AND round = ?)")
        .bind(expectedRound),
      this.db
        .prepare("UPDATE events SET status = 'open', round = round + 1, revealed_questions = 0, final_counts = NULL, closed_at = NULL WHERE id = 1 AND round = ?")
        .bind(expectedRound),
    ]);
    return this.getPublicEvent();
  }

  async reveal(questionId: number, expectedRound?: number): Promise<PublicEvent> {
    if (!Number.isInteger(questionId) || questionId < 1 || questionId > questions.length)
      throw new AppError(400, "공개할 문항을 확인해 주세요.");
    const event = await this.event();
    assertCurrentRound(event, expectedRound);
    if (event.status === "draft")
      throw new AppError(409, "행사를 시작한 뒤 점수를 공개해 주세요.");
    // Bitwise OR keeps independent, concurrent reveals from overwriting each other.
    await this.db
      .prepare("UPDATE events SET revealed_questions = revealed_questions | ? WHERE id = 1 AND round = ? AND status <> 'draft'")
      .bind(1 << (questionId - 1), event.round)
      .run();
    assertCurrentRound(await this.event(), event.round);
    return this.getPublicEvent();
  }

  async register(
    input: unknown,
    tokenHash: string,
    expectedRound?: number,
  ): Promise<ParticipantRow> {
    if (!isRecord(input) || typeof input.nickname !== "string") {
      throw new AppError(400, "닉네임을 입력해 주세요.");
    }
    const name = input.nickname.trim().normalize("NFC");
    if (
      !name ||
      name.length > 40 ||
      /[\u0000-\u001f\u007f]/.test(name) ||
      !/^[a-f0-9]{64}$/.test(tokenHash)
    ) {
      throw new AppError(400, "닉네임은 40자 이내로 입력해 주세요.");
    }
    const event = await this.event();
    assertCurrentRound(event, expectedRound);
    const existing = await this.getParticipantByToken(tokenHash);
    if (existing) {
      if (existing.name !== name)
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
        `INSERT INTO participants (id,name,token_hash,expires_at,consent_version,created_at)
      SELECT ?,?,?,?,?,? FROM events WHERE id = 1 AND status = 'open' AND round = ?
      ON CONFLICT DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        name,
        tokenHash,
        Date.now() + SESSION_LIFETIME,
        0, // Nickname-only registration did not use the legacy consent form.
        new Date().toISOString(),
        event.round,
      )
      .run();
    const participant = await this.getParticipantByToken(tokenHash);
    if (!participant)
      throw new AppError(
        409,
        "참여가 마감되었습니다. 화면을 새로고침해 주세요.",
      );
    if (participant.name !== name)
      throw new AppError(409, "이 브라우저에서는 이미 참여했습니다.");
    return participant;
  }

  async getParticipantByToken(
    tokenHash: string,
  ): Promise<ParticipantRow | null> {
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
    return this.db
      .prepare(
        "SELECT id,name,expires_at,created_at,completed_at FROM participants WHERE token_hash = ? AND expires_at > ?",
      )
      .bind(tokenHash, Date.now())
      .first<ParticipantRow>();
  }

  private async participant(id: string): Promise<ParticipantRow> {
    const row = await this.db
      .prepare(
        "SELECT id,name,expires_at,created_at,completed_at FROM participants WHERE id = ?",
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
      points: isRevealed(event, answer.questionId)
        ? scoreOptions(counts[answer.questionId - 1])[answer.optionIndex]
        : null,
    }));
    return {
      displayName: participant.name,
      code: participant.id.slice(0, 8).toUpperCase(),
      answers,
      completed: answers.length === 10,
      score: questions.every((question) => isRevealed(event, question.id))
        ? answers.reduce((sum, answer) => sum + (answer.points ?? 0), 0)
        : null,
      final: event.final_counts !== null,
    };
  }

  async submitAnswer(
    id: string,
    questionId: number,
    optionIndex: number,
    expectedRound?: number,
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
    const event = await this.event();
    assertCurrentRound(event, expectedRound);
    const now = new Date().toISOString();
    // The status and sequence checks live inside the write, so close/submit races cannot admit a late vote.
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO answers (participant_id,question_id,option_index,created_at)
        SELECT ?,?,?,? FROM events WHERE id = 1 AND status = 'open' AND round = ?
        AND (? = 1 OR (revealed_questions & ?) <> 0)
        AND EXISTS (SELECT 1 FROM participants WHERE id = ?)
        AND (SELECT COUNT(*) FROM answers WHERE participant_id = ?) = ?
        ON CONFLICT (participant_id,question_id) DO NOTHING`,
        )
        .bind(id, questionId, optionIndex, now, event.round, questionId,
          questionId === 1 ? 0 : 1 << (questionId - 2), id, id, questionId - 1),
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
    if (!answer) {
      const current = await this.event();
      assertCurrentRound(current, event.round);
      throw new AppError(
        409,
        current.status !== "open"
          ? "참여가 마감되어 답변을 저장하지 못했습니다."
          : questionId > 1 && !isRevealed(current, questionId - 1)
            ? "운영자가 이전 문항의 점수를 공개하면 다음 문항에 답할 수 있습니다."
            : "문항 순서대로 답변해 주세요.",
      );
    }
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
    const revealed = isRevealed(event, questionId);
    return {
      questionId,
      counts,
      total,
      percentages: counts.map((count) =>
        total ? Math.round((count / total) * 1000) / 10 : 0,
      ),
      points: revealed ? scoreOptions(counts) : [],
      revealed,
      selectedIndex: answer.optionIndex,
      final: event.final_counts !== null,
      updatedAt: event.closed_at ?? new Date().toISOString(),
    };
  }

  async close(expectedRound?: number): Promise<PublicEvent> {
    const event = await this.event();
    assertCurrentRound(event, expectedRound);
    if (event.status === "draft")
      throw new AppError(409, "시작하지 않은 행사를 마감할 수 없습니다.");
    // One SQLite statement freezes the exact same vote set that it closes.
    await this.db
      .prepare(
        `UPDATE events SET status = 'closed', closed_at = ?, final_counts = (
      SELECT json_group_array(json_object('questionId',question_id,'optionIndex',option_index,'count',count))
      FROM (SELECT question_id,option_index,COUNT(*) AS count FROM answers GROUP BY question_id,option_index)
    ) WHERE id = 1 AND status = 'open' AND round = ?`,
      )
      .bind(new Date().toISOString(), event.round)
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
        `SELECT p.id,p.name,p.created_at,p.completed_at,
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
        code: row.id.slice(0, 8).toUpperCase(),
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
          winners: (JSON.parse(row.winners) as DrawResult["winners"]).map(
            (winner) => ({
              id: winner.id,
              name: winner.name,
              code: winner.id.slice(0, 8).toUpperCase(),
              score: winner.score,
            }),
          ),
          eligibleCount: row.eligible_count,
          drawnAt: row.drawn_at,
        }
      : null;
  }

  async draw(expectedRound?: number): Promise<DrawResult> {
    const event = await this.event();
    assertCurrentRound(event, expectedRound);
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
        code: candidate.code,
        score: candidate.score,
      };
    });
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO draws (event_id,winners,candidates,eligible_count,drawn_at)
        SELECT 1,?,?,?,? FROM events WHERE id = 1 AND status = 'closed' AND round = ?
        ON CONFLICT (event_id) DO NOTHING`,
        )
        .bind(
          JSON.stringify(winners),
          JSON.stringify(
            candidates.map((row) => ({ id: row.id, score: row.score })),
          ),
          candidates.length,
          new Date().toISOString(),
          event.round,
        ),
      this.db
        .prepare(
          "UPDATE events SET status = 'drawn' WHERE id = 1 AND status = 'closed' AND round = ? AND EXISTS (SELECT 1 FROM draws WHERE event_id = 1)",
        )
        .bind(event.round),
    ]);
    const result = await this.savedDraw();
    if (!result)
      throw new AppError(409, "행사가 다시 시작되었습니다. 화면을 새로고침해 주세요.");
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
      "닉네임",
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
          row.code,
          row.name,
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
