import "dotenv/config";
import { createServer } from "node:http";
import { parse as parseCookie } from "cookie";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { closeDb, initDb } from "./db.js";
import { HttpError, jsonError } from "./lib/http-error.js";
import { assertSessionSecret, getOrCreateVoter } from "./lib/tokens.js";
import { pollsRouter } from "./routes/polls.js";
import { seed } from "./seed.js";
import { attachSocket } from "./socket.js";

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

assertSessionSecret();

async function voterCookieMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    req.voterId = await getOrCreateVoter(req, res);
    next();
  } catch (err) {
    next(err);
  }
}

const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json(err.toBody());
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const message = first ? first.message : "Invalid request";
    res.status(400).json(jsonError("VALIDATION_ERROR", message));
    return;
  }
  res.status(500).json(jsonError("INTERNAL", "Internal server error"));
};

async function main(): Promise<void> {
  await initDb();
  await seed();

  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "32kb" }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.cookies = parseCookie(req.headers.cookie ?? "");
    next();
  });
  app.use(voterCookieMiddleware);
  app.use(pollsRouter);
  app.use((_req: Request, res: Response) => {
    res.status(404).json(jsonError("NOT_FOUND", "Not found"));
  });
  app.use(errorHandler);

  const server = createServer(app);
  attachSocket(server);

  server.listen(PORT, () => {
    console.error(`Pulse server listening on ${PORT}`);
  });

  const shutdown = (): void => {
    server.close(() => {
      void closeDb().finally(() => process.exit(0));
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
