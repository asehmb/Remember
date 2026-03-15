import http from "node:http";
import express, { type Request, type RequestHandler, type Response, type NextFunction } from "express";

export const REST_SERVER_HOST = "127.0.0.1";
export const REST_SERVER_PORT = 47821;

const LOOPBACK_REMOTE_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOST_HEADERS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type RestRouteName = "status" | "search" | "tags" | "ingest";

export interface RestServerRouteHandlers {
  status?: RequestHandler;
  search?: RequestHandler;
  tags?: RequestHandler;
  ingest?: RequestHandler;
}

export interface LocalRestServerOptions {
  host?: string;
  port?: number;
  routes?: RestServerRouteHandlers;
}

function normalizeHostHeader(value: string): string {
  if (value.startsWith("[")) {
    const endOfIpv6Address = value.indexOf("]");
    if (endOfIpv6Address === -1) {
      return value.toLowerCase();
    }

    return value.slice(0, endOfIpv6Address + 1).toLowerCase();
  }

  const hostname = value.split(":", 1)[0];
  return hostname.toLowerCase();
}

function localhostOnlyGuard(req: Request, res: Response, next: NextFunction): void {
  const remoteAddress = req.socket.remoteAddress;
  if (!remoteAddress || !LOOPBACK_REMOTE_ADDRESSES.has(remoteAddress)) {
    res.status(403).json({ error: "This endpoint accepts localhost traffic only" });
    return;
  }

  const hostHeader = req.headers.host;
  if (typeof hostHeader !== "string") {
    res.status(400).json({ error: "Host header is required" });
    return;
  }

  const normalizedHostHeader = normalizeHostHeader(hostHeader);
  if (!LOOPBACK_HOST_HEADERS.has(normalizedHostHeader)) {
    res.status(403).json({ error: "This endpoint accepts localhost traffic only" });
    return;
  }

  next();
}

function unconfiguredRouteHandler(routeName: RestRouteName): RequestHandler {
  return (_req, res) => {
    res.status(501).json({
      error: `Route /${routeName} has not been wired yet`
    });
  };
}

export class LocalRestServer {
  private readonly app = express();
  private readonly host: string;
  private readonly port: number;
  private server: http.Server | null = null;

  private readonly routeHandlers: Record<RestRouteName, RequestHandler> = {
    status: unconfiguredRouteHandler("status"),
    search: unconfiguredRouteHandler("search"),
    tags: unconfiguredRouteHandler("tags"),
    ingest: unconfiguredRouteHandler("ingest")
  };

  constructor(options: LocalRestServerOptions = {}) {
    this.host = options.host ?? REST_SERVER_HOST;
    this.port = options.port ?? REST_SERVER_PORT;

    this.configureApp();
    if (options.routes) {
      this.registerRoutes(options.routes);
    }
  }

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  get isRunning(): boolean {
    return this.server !== null;
  }

  registerRoute(routeName: RestRouteName, handler: RequestHandler): void {
    this.routeHandlers[routeName] = handler;
  }

  registerRoutes(routes: RestServerRouteHandlers): void {
    if (routes.status) {
      this.routeHandlers.status = routes.status;
    }

    if (routes.search) {
      this.routeHandlers.search = routes.search;
    }

    if (routes.tags) {
      this.routeHandlers.tags = routes.tags;
    }

    if (routes.ingest) {
      this.routeHandlers.ingest = routes.ingest;
    }
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    const nextServer = http.createServer(this.app);
    await new Promise<void>((resolve, reject) => {
      const onListening = (): void => {
        nextServer.off("error", onError);
        resolve();
      };

      const onError = (error: Error): void => {
        nextServer.off("listening", onListening);
        reject(error);
      };

      nextServer.once("listening", onListening);
      nextServer.once("error", onError);
      nextServer.listen(this.port, this.host);
    });

    this.server = nextServer;
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const currentServer = this.server;
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      currentServer.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private configureApp(): void {
    this.app.disable("x-powered-by");
    this.app.use(localhostOnlyGuard);
    this.app.use(express.json({ strict: true }));

    this.app.all("/status", this.handleRoute("status"));
    this.app.all("/search", this.handleRoute("search"));
    this.app.all("/tags", this.handleRoute("tags"));
    this.app.all("/ingest", this.handleRoute("ingest"));
  }

  private handleRoute(routeName: RestRouteName): RequestHandler {
    return (req, res, next) => {
      this.routeHandlers[routeName](req, res, next);
    };
  }
}

export function createLocalRestServer(options: LocalRestServerOptions = {}): LocalRestServer {
  return new LocalRestServer(options);
}
