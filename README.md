# Shared To-Do (Netlify)

A no-login, shared to-do app. Anyone with the link can view and update the same list.

## Run locally

1. Install dependencies:
   - `npm install`
2. Start Netlify dev server:
   - `npm run dev`
3. Open the local URL shown in terminal.

## Deploy to Netlify

1. Push this folder to GitHub.
2. In Netlify, create a new site from that repository.
3. Build command: leave empty.
4. Publish directory: `.`
5. Netlify will deploy and host your shared board.

## Notes

- Data is stored in Netlify Blobs.
- No login/auth is used.
- This is a shared board: all users can edit/delete tasks.
