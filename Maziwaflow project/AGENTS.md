<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Signed-in screens live under src/routes/_authenticated/ and read/write via the browser Supabase client (RLS enforced) — keeps staff data behind login without extra server layers.
- Signed-in roles are loaded from `profiles.role`; do not default missing or invalid roles to a staff role. Signup form metadata does not grant permissions — authorization remains enforced by Supabase RLS.
