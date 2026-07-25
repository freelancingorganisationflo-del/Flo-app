# Deploying FLO to Vercel

1. Push this project to a GitHub repo.
2. In Vercel: **New Project** → import the repo.
3. Framework preset: **Vite**. Build command `npm run build`, output dir `dist`
   (Vercel usually detects these automatically).
4. Add environment variables under **Settings → Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.
6. In Supabase → **Authentication → URL Configuration**, add your Vercel
   domain (e.g. `https://flo-app.vercel.app`) to the allowed redirect URLs,
   or email confirmation links will send members back to `localhost`.

That's it — no server to run; Supabase is the entire backend and the built
app is static.

### Custom domain
Add it in Vercel → Settings → Domains, then repeat step 6 with the custom
domain once DNS is verified.
