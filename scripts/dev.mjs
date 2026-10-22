import "dotenv/config";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";

const execute = promisify(execFile);
const children = new Set();
let stopping = false;

function launch(program, args, stdio = "inherit") {
  const child = spawn(program, args, { stdio, windowsHide: true });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
process.once("exit", stop);

try {
  if (!process.env.DATABASE_URL) throw new Error("请先在 .env 配置 DATABASE_URL。");
  const database = new URL(process.env.DATABASE_URL);
  if (process.platform === "win32" && process.env.DATABASE_BIND_IP) {
    console.log("正在启动 WSL 数据库，并在开发期间保持 WSL 运行…");
    const distro = "Ubuntu-22.04";
    // This child belongs to the dev session and is terminated with the web server.
    const keeper = launch("wsl.exe", ["-d", distro, "--", "sleep", "infinity"], "ignore");
    keeper.on("error", () => console.error("WSL 保活启动失败，请确认 Ubuntu-22.04 可用。"));
    await execute("wsl.exe", ["-d", distro, "--", "docker", "start", "aiweb-postgres"], {
      timeout: 60000,
      windowsHide: true,
    });
    const { stdout } = await execute("wsl.exe", ["-d", distro, "--", "hostname", "-I"], {
      timeout: 15000,
      windowsHide: true,
    });
    const currentIp = stdout.trim().split(/\s+/)[0];
    if (
      database.hostname !== "localhost" &&
      database.hostname !== "127.0.0.1" &&
      database.hostname !== currentIp
    ) {
      throw new Error(
        `WSL 地址已变化：当前 ${currentIp}，数据库配置为 ${database.hostname}。请按 docs/local-database.md 同步连接地址和容器绑定，保留原数据卷。`,
      );
    }
  }
  let available = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
      query_timeout: 3000,
    });
    try {
      await client.connect();
      await client.query("SELECT 1");
      available = true;
      break;
    } catch {
      if (attempt === 4)
        throw new Error(
          "数据库仍未就绪。请运行 npm run db:check，并检查 WSL 和 aiweb-postgres 容器。网页尚未启动。",
        );
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await client.end().catch(() => {});
    }
  }
  if (available && !stopping) {
    console.log("数据库连接正常，正在启动 Next.js。");
    const web = launch(process.execPath, [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ]);
    await new Promise((resolve, reject) => {
      web.once("error", reject);
      web.once("exit", (code) => {
        process.exitCode = code || 0;
        resolve();
      });
    });
  }
} catch (error) {
  // Subprocess messages can contain environment details; only show our own actionable errors.
  console.error(
    error.code
      ? "无法启动本地数据库，请确认 WSL 与 Docker 可用；运行 npm run db:check 查看结果。"
      : error.message,
  );
  process.exitCode = 1;
} finally {
  stop();
}
