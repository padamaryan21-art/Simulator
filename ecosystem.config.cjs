/**
 * PM2 process file: runs the dashboard and the worker, restarts them if they crash or the VPS
 * reboots.   pm2 start ecosystem.config.cjs && pm2 save
 *
 * Run exactly ONE copy of each. Some state (Telegram login codes, bulk-generation progress, rate
 * limits) lives in the process, so the app must not be scaled to several instances.
 */
// PM2 reads this file as CommonJS, so require() is intentional here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");

const cwd = __dirname;
const common = {
  cwd,
  instances: 1,
  exec_mode: "fork",
  autorestart: true,
  min_uptime: "20s",
  max_restarts: 20,
  restart_delay: 5000,
  time: true,
  merge_logs: true,
  env: { NODE_ENV: "production" },
};

module.exports = {
  apps: [
    {
      ...common,
      name: "allyono-web",
      script: path.join(cwd, "node_modules/next/dist/bin/next"),
      // Bound to localhost: only the reverse proxy (aaPanel / nginx) can reach it.
      args: "start -p 3000 -H 127.0.0.1",
      max_memory_restart: "1200M",
      out_file: path.join(cwd, "logs/web.out.log"),
      error_file: path.join(cwd, "logs/web.err.log"),
    },
    {
      ...common,
      name: "allyono-worker",
      script: path.join(cwd, "node_modules/tsx/dist/cli.mjs"),
      args: "worker/index.ts",
      max_memory_restart: "1000M",
      // Time to release Telegram sessions and locks on a stop or restart.
      kill_timeout: 30000,
      out_file: path.join(cwd, "logs/worker.out.log"),
      error_file: path.join(cwd, "logs/worker.err.log"),
    },
  ],
};
