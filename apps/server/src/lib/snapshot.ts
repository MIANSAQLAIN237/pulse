import {
  deriveStatus,
  resultsVisibleFor,
  type PollOptionState,
  type PollState,
} from "@pulse/shared";

export type SnapshotPoll = {
  code: string;
  question: string;
  hideUntilReveal: boolean;
  locked: boolean;
  revealed: boolean;
  closed: boolean;
  expiresAt: string;
  options: PollOptionState[];
};

export type SnapshotViewer = {
  youVotedOptionId: string | null;
  isHost: boolean;
  presence: number;
};

export function buildSnapshot(poll: SnapshotPoll, viewer: SnapshotViewer): PollState {
  const status = deriveStatus({
    closed: poll.closed,
    locked: poll.locked,
    expiresAt: poll.expiresAt,
  });
  const resultsVisible = resultsVisibleFor({
    hideUntilReveal: poll.hideUntilReveal,
    revealed: poll.revealed,
    isHost: viewer.isHost,
  });
  const realTotal = poll.options.reduce((sum, option) => sum + option.votes, 0);
  const options: PollOptionState[] = poll.options.map((option) => ({
    id: option.id,
    label: option.label,
    votes: resultsVisible ? option.votes : 0,
    position: option.position,
  }));
  return {
    code: poll.code,
    question: poll.question,
    status,
    hideUntilReveal: poll.hideUntilReveal,
    revealed: poll.revealed,
    locked: poll.locked,
    closed: poll.closed,
    expiresAt: poll.expiresAt,
    options,
    totalVotes: resultsVisible ? realTotal : 0,
    youVotedOptionId: viewer.youVotedOptionId,
    isHost: viewer.isHost,
    presence: viewer.presence,
    resultsVisible,
  };
}
