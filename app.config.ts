import "./dotenv.config";
import type { ExpoConfig } from "expo/config";

export default ({ config }: { config: ExpoConfig }) => ({
  ...config,
  name: "GlamHub",
  slug: "glamhub",
  extra: {
    env: process.env.EXPO_PUBLIC_ENV,
    ...config.extra,
  },
});

