import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    include: /bin\/helmsman$|\.ts$/,
    loader: "ts",
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.spec.ts"],
    },
  },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "./lib/core"),
      "@domain": path.resolve(__dirname, "./lib/domain"),
      "@commands": path.resolve(__dirname, "./lib/commands"),
    },
  },
});
