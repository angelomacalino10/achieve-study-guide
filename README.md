# Achieve study guide

Real backend build: the site calls two Netlify Functions that generate a
personalized study guide and a quiz live, using the Claude API, grounded in
your actual course guides (chunked per chapter under `/data`).

## One-time setup after pushing this to GitHub

1. In the Netlify dashboard, open this site → **Site configuration →
   Environment variables**.
2. Add a variable:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key
   - Scope: leave it on all scopes (or at least "Functions")
3. Trigger a deploy (pushing this repo does that automatically). Netlify
   will run `npm install` to pull in `@netlify/functions`, then build and
   publish the two functions alongside the static site.

That's it — no other configuration needed. `netlify.toml` already points
Netlify at `netlify/functions` for the functions and `.` (repo root) for the
static site.

## How it's structured

- `index.html` — the front-end. Calls `/api/study-guide` and `/api/quiz`.
- `netlify/functions/study-guide.mts` — generates a personalized study guide.
- `netlify/functions/quiz.mts` — generates a 5-question quiz.
- `netlify/functions/_lib/content.mts` — looks up the right chapter chunk
  for a given course/topic so the AI's answer is grounded in your material.
- `data/*.json` — one file per course, chunked by chapter/topic. Also served
  as static assets so the "Full guide" panel in the UI can show the original
  text.

## Adjusting how much source material gets sent to the AI

Both functions currently send up to 15,000 characters of the matched
chapter as grounding context (`sourceExcerpt` in each `.mts` file). Some of
your guides (particularly the two NCLEX courses) have much longer chapters
than that — raise or lower that number if answers feel too shallow or you
want to control API cost.

## Local testing (optional)

If you have Node.js and want to test before pushing:

```
npm install
npx netlify dev
```

This needs `ANTHROPIC_API_KEY` set in your local shell too (or in a
`.env` file Netlify CLI picks up), since local dev doesn't read the
dashboard's environment variables.
