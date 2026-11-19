# BounceWars – website with online play

One small Node.js server (no npm packages needed) serves the game AND relays online matches,
so a single link works for everyone, no Claude account needed.

## Run locally
    node server.js        # open http://localhost:8080

## Put it online (Render, free)
1. Create a GitHub repo and upload everything from this folder (Add file > Upload files).
2. On render.com: New > Web Service > pick the repo.
   Runtime: Node. Build command: leave empty (or `npm install`). Start command: `node server.js`. Plan: Free.
   (or use New > Blueprint, it reads `render.yaml`)
3. After the deploy you get a link like https://bouncewars.onrender.com - send it to friends.

Free Render services sleep after ~15 min idle; the first visit then takes ~30-60 s to wake up.
Railway, Fly.io, Koyeb or any VPS with Node 18+ work the same way (run `node server.js`, port from $PORT).

## How online play works
One player taps Play > Online > Create room and shares the 4-character code, the other taps Join room.
No settings are needed: the game connects back to the same address it was loaded from.
