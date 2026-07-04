import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // esm + cjs for bundlers/Node; iife for a plain <script> tag (global below).
  format: ["esm", "cjs", "iife"],
  globalName: "DriveStore",
  target: "es2022",
  dts: true,
  clean: true,
});
