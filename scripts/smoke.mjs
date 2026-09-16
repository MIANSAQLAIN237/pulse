import { io } from "socket.io-client";

const API = process.env.PULSE_API ?? "http://127.0.0.1:4000";

function cookieHeader(setCookie) {
  return setCookie
    .map((entry) => entry.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function request(path, { method = "GET", body, cookie, hostToken } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (hostToken) headers.Authorization = `Bearer ${hostToken}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const data = await res.json();
  return { ok: res.ok, status: res.status, data, cookie: cookieHeader(setCookie) || cookie || "" };
}

function once(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connect(cookie, extra = {}) {
  return new Promise((resolve, reject) => {
    const socket = io(API, {
      path: "/socket.io",
      transports: ["websocket"],
      extraHeaders: cookie ? { Cookie: cookie } : {},
      ...extra,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => {
      socket.close();
      reject(err);
    });
  });
}

async function joinAndWait(socket, payload) {
  const statePromise = once(socket, "state");
  socket.emit("join", payload);
  return statePromise;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await request("/api/health");
assert(health.data.ok === true, "health failed");
assert(health.cookie.includes("pulse_voter="), "missing voter cookie");
const cookie = health.cookie;

let noVoterFailed = false;
try {
  await connect("");
} catch (err) {
  noVoterFailed = String(err?.message ?? err).includes("NO_VOTER");
}
assert(noVoterFailed, "socket should reject clients without a voter cookie");

const created = await request("/api/polls", {
  method: "POST",
  cookie,
  body: {
    question: "Best snack for standup?",
    options: ["Coffee", "Fruit", "Donuts"],
    hideUntilReveal: true,
    ttlHours: 6,
  },
});
assert(created.status === 201, `create failed: ${JSON.stringify(created.data)}`);
const { code, hostToken } = created.data;

const audienceView = await request(`/api/polls/${code}`, { cookie });
assert(audienceView.data.resultsVisible === false, "audience should not see hidden results");
assert(audienceView.data.isHost === false, "audience GET is not host");

const hostView = await request(`/api/polls/${code}`, { cookie, hostToken });
assert(hostView.data.isHost === true, "bearer token should mark host");
assert(hostView.data.resultsVisible === true, "host should see hidden results");

const voter = await connect(cookie);
const votedState = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("vote state timeout")), 4000);
  voter.on("state", (state) => {
    if (state.youVotedOptionId) {
      clearTimeout(timer);
      resolve(state);
    }
  });
  void joinAndWait(voter, { code }).then((state) => {
    const optionId = state.options[0]?.id;
    if (!optionId) throw new Error("no option");
    voter.emit("vote", { optionId });
  }).catch(reject);
});
assert(Boolean(votedState.youVotedOptionId), "vote did not stick");
assert(votedState.resultsVisible === false, "audience still hidden after vote");
assert(votedState.totalVotes === 0, "hidden audience totals must be 0");

const already = await new Promise((resolve) => {
  voter.once("error", resolve);
  voter.emit("vote", { optionId: votedState.youVotedOptionId });
});
assert(already.code === "ALREADY_VOTED", `expected ALREADY_VOTED, got ${already.code}`);

const afterVoteHost = await request(`/api/polls/${code}`, { cookie, hostToken });
assert(afterVoteHost.data.totalVotes === 1, "host should see 1 vote");

const host = await connect(cookie);
const hostState = await joinAndWait(host, { code, hostToken });
assert(hostState.isHost === true, "socket host token failed");
assert(hostState.totalVotes === 1, "host socket should see 1 vote");

const revealed = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("reveal timeout")), 4000);
  voter.once("state", (state) => {
    clearTimeout(timer);
    resolve(state);
  });
  host.emit("reveal");
});
assert(revealed.resultsVisible === true, "reveal did not show results");
assert(revealed.totalVotes === 1, "revealed total should be 1");

const locked = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("lock timeout")), 4000);
  voter.once("state", (state) => {
    clearTimeout(timer);
    resolve(state);
  });
  host.emit("lock");
});
assert(locked.status === "locked", "lock failed");

const cookie2Health = await request("/api/health");
const voter2 = await connect(cookie2Health.cookie);
await joinAndWait(voter2, { code });
const lockedErr = await new Promise((resolve) => {
  voter2.once("error", resolve);
  voter2.emit("vote", { optionId: locked.options[1]?.id ?? locked.options[0].id });
});
assert(lockedErr.code === "POLL_LOCKED", `expected POLL_LOCKED, got ${lockedErr.code}`);

host.emit("unlock");
await once(voter, "state");

const closed = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("close timeout")), 4000);
  voter.once("state", (state) => {
    clearTimeout(timer);
    resolve(state);
  });
  host.emit("close");
});
assert(closed.status === "closed", "close failed");

voter.close();
voter2.close();
host.close();

const demo = await request("/api/polls/K7MQ", { cookie });
assert(demo.ok, "demo poll K7MQ missing");
assert(demo.data.question.includes("topic"), "demo question mismatch");

const missing = await request("/api/polls/ZZZZ", { cookie });
assert(missing.status === 404, "missing poll should 404");

console.log(`ok ${code} hide/vote/reveal/lock/close`);
