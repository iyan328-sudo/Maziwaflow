import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env["CAPACITOR_SERVER_URL"]?.trim();

const config: CapacitorConfig = {
  appId: "com.maziwaflow.mobile",
  appName: "Maziwaflow Mobile",
  webDir: "capacitor",
  ...(serverUrl ? { server: { url: serverUrl } } : {}),
};

export default config;
