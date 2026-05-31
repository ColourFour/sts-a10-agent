import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/sts-a10-agent/",
  plugins: [react()],
  test: {
    environment: "node",
  },
});
