# Working in this app

## Read the constitution first

`CLAUDE.md` at the **repository root** is Compass's product constitution. It
lists mechanics that must never be implemented — infinite scroll, likes and
public tallies, follower counts, engagement ranking, streak/FOMO notifications,
behavioural advertising, dark patterns, autoplay. If a prompt asks for one of
these, stop and raise it rather than complying.

Every feature must be specced against one test, in a comment or PR note:
**does this improve the user's wellbeing?**

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
writing any code.

Note that `api.expo.dev` and `reactnative.directory` may be blocked by the
network policy in some environments, which makes `npx expo install` fail. When
that happens, install with `npm install` and take native module versions from
`node_modules/expo/bundledNativeModules.json`, which ships with the SDK.

## Layout

| Path | Contents |
|---|---|
| `src/lib/` | Supabase client and env configuration. |
| `src/context/` | `AuthContext` — session state and the auth actions. |
| `src/navigation/` | Route param lists and the root navigator. |
| `src/screens/` | One folder per feature area. |
| `src/components/` | Shared UI primitives. |
| `src/theme/` | Colours, spacing, type scale. |
| `src/types/` | Database row types. |
| `supabase/migrations/` | Schema and RLS policies. |
| `supabase/tests/` | RLS policy tests — `supabase/tests/run.sh`. |

## Two things that will bite you

- **`src/types/database.ts` uses `type` aliases, not `interface`s.** supabase-js
  constrains each table's `Row` to `Record<string, unknown>`; TypeScript gives
  type aliases an implicit index signature but not interfaces. Converting them
  to interfaces makes every query silently infer as `never` instead of
  reporting the real error.
- **Access control lives in RLS, not in screen code.** Don't add ownership
  filters in queries and call it security. Change the policy, add a case to
  `supabase/tests/`, and run the suite.
