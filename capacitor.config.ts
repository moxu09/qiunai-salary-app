import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.wearestilllhere.qiunai.staff",
  appName: "秋奈電競員工",
  webDir: "www",
  server: {
    url: "https://qiunai.wearestilllhere.com",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;