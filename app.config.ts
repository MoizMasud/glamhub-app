export default ({ config }: any) => ({
  ...config,
  name: "GlamHub",
  slug: "glamhub",
  extra: {
    env: process.env.EXPO_PUBLIC_ENV,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
});
