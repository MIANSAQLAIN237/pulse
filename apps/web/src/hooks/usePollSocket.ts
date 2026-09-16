import { useCallback, useEffect, useRef, useState } from "react";
import type {
  JoinPayload,
  PollState,
  PresencePayload,
  SocketErrorPayload,
} from "@pulse/shared";
import { ensureVoterSession } from "../lib/api";
import { getSocket } from "../lib/socket";

export function usePollSocket(code: string, hostToken?: string | null) {
  const [state, setState] = useState<PollState | null>(null);
  const [presence, setPresence] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const payloadRef = useRef<JoinPayload>({ code: code.toUpperCase() });
  payloadRef.current = hostToken
    ? { code: code.toUpperCase(), hostToken }
    : { code: code.toUpperCase() };

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;
    setState(null);
    setError(null);

    const join = () => {
      socket.emit("join", payloadRef.current);
    };

    const onState = (next: PollState) => {
      setState(next);
      setPresence(next.presence);
    };

    const onPresence = (payload: PresencePayload) => {
      setPresence(payload.count);
    };

    const onError = (payload: SocketErrorPayload) => {
      setError(payload.message);
    };

    const onConnect = () => {
      setConnected(true);
      join();
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onReconnect = () => {
      join();
    };

    const onConnectError = (err: Error) => {
      if (cancelled) return;
      if (err.message.includes("NO_VOTER")) {
        void ensureVoterSession()
          .then(() => {
            if (!cancelled) socket.connect();
          })
          .catch(() => {
            if (!cancelled) setError("Could not start a voting session");
          });
        return;
      }
      setError(err.message || "Could not connect");
    };

    socket.on("state", onState);
    socket.on("presence", onPresence);
    socket.on("error", onError);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect", onReconnect);

    void ensureVoterSession()
      .then(() => {
        if (cancelled) return;
        if (socket.connected) {
          setConnected(true);
          join();
        } else {
          socket.connect();
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not start a voting session");
      });

    return () => {
      cancelled = true;
      socket.emit("leave");
      socket.off("state", onState);
      socket.off("presence", onPresence);
      socket.off("error", onError);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect", onReconnect);
    };
  }, [code, hostToken]);

  const vote = useCallback((optionId: string) => {
    getSocket().emit("vote", { optionId });
  }, []);

  const lock = useCallback(() => {
    getSocket().emit("lock");
  }, []);

  const unlock = useCallback(() => {
    getSocket().emit("unlock");
  }, []);

  const reveal = useCallback(() => {
    getSocket().emit("reveal");
  }, []);

  const close = useCallback(() => {
    getSocket().emit("close");
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    state,
    presence,
    error,
    connected,
    vote,
    lock,
    unlock,
    reveal,
    close,
    clearError,
  };
}
