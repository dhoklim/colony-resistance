export type EventStatus = "draft" | "open" | "closed" | "drawn";
export type Settings = {
  organizer: string;
  privacyContact: string;
  retentionDays: number;
  instagramUrl: string;
};
export type PublicEvent = {
  status: EventStatus;
  round: number;
  settings: Settings;
  participantCount: number;
  completedCount: number;
  closedAt: string | null;
  privacyVersion: number;
  publicAdmin: boolean;
};
export type Distribution = {
  questionId: number;
  counts: number[];
  total: number;
  percentages: number[];
  points: number[];
  selectedIndex: number;
  final: boolean;
  updatedAt: string;
};
export type ParticipantSnapshot = {
  displayName: string;
  code: string;
  answers: { questionId: number; optionIndex: number; points: number }[];
  completed: boolean;
  score: number;
  final: boolean;
};
export type LeaderboardEntry = {
  id: string;
  name: string;
  code: string;
  completed: boolean;
  answeredCount: number;
  score: number;
  registeredAt: string;
};
export type DrawResult = {
  winners: { id: string; name: string; code: string; score: number }[];
  eligibleCount: number;
  drawnAt: string;
};
export type AdminSnapshot = {
  event: PublicEvent;
  distributions: {
    questionId: number;
    counts: number[];
    total: number;
    points: number[];
  }[];
  participants: LeaderboardEntry[];
  page: number;
  pageSize: number;
  totalPages: number;
  draw: DrawResult | null;
};
