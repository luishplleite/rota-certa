import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=(), payment=()');
  next();
});

app.use(express.urlencoded({ extended: false }));

const MemoryStoreSession = MemoryStore(session);

const isProduction = process.env.NODE_ENV === 'production';

console.log(`[SERVER] Environment: NODE_ENV=${process.env.NODE_ENV}, isProduction=${isProduction}`);
console.log(`[SERVER] Cookie config: secure=${isProduction}, sameSite=${isProduction ? 'none' : 'lax'}, proxy=${isProduction}`);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "rotacerta-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStoreSession({
      checkPeriod: 86400000,
    }),
    cookie: {
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
    proxy: isProduction,
  })
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  // Debug de sessão para requisições de API
  if (req.path.startsWith('/api')) {
    console.log(`[DEBUG SESSION] ${req.method} ${req.path}`);
    console.log(`  -> Cookies recebidos:`, req.headers.cookie ? 'SIM' : 'NÃO');
    console.log(`  -> Session ID:`, req.sessionID ? req.sessionID.substring(0, 8) + '...' : 'NENHUM');
    console.log(`  -> Session userId:`, (req.session as any)?.userId || 'NÃO AUTENTICADO');
    console.log(`  -> X-Forwarded-Proto:`, req.headers['x-forwarded-proto'] || 'não definido');
    console.log(`  -> Secure connection:`, req.secure);
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
