# Leonardo Da Vinci Impromptu Speech Contest

An internal contest tool for **Unidad Educativa Leonardo Da Vinci, Manta**. One persistent event contains Divisions A, B and C. Role pages open directly; role links and the event code are navigation, not authentication.

- Frontend: https://chiispiitas.github.io/da-vinci-speech-contest/
- Source: https://github.com/Chiispiitas/da-vinci-speech-contest
- Wix backend: https://headless-unfrsdxdqli-chiispiitas-140b.wix-site-host.com
- Wix CMS: https://manage.wix.com/dashboard/f41bec76-7208-422c-a5a6-8134638a4eb5

## Run the contest

1. Open **Admin**. Initialize an event once, or reconnect to the existing event. Use the same code in every role link.
2. Review **Participants & topics** and **Judging panel** for each division. The program names two judges for Division C. Deliberately confirm that panel, or assign its third judge before its first draw. Confirm roster and panel.
3. Open a clearly named Judge link on each judge’s device. Open **Emcee** on the emcee’s device and **Audience** on the television/projector. The audience page has a fullscreen control.
4. Draw the participant, then their topic. Each draw automatically takes its animated wheel live, lands on the server-selected result, then switches to **Current contestant**. Participant wheels show the remaining names. Topic wheels show numbered slots; only the drawn prompt is revealed. Other scene changes still use the private preview and **Take live**.
5. Select preparation or speech, take that timer scene live, and start the timer. Pause before switching phases. Timer expiry does not stop a speech, submit scores, apply a penalty, or publish results.
6. Choose **Complete participant** when the speech ends, even if no judges have submitted yet. You can draw the next participant immediately. Unfinished score sheets stay in each judge’s queue; judges can select a participant, finish their saved draft and submit later. Submissions still lock.
Use **Contestant controls** to undo the current participant/topic draw, undo the last completion, or choose a current contestant. Switching pauses the other attempt and keeps each topic and score attached to its original participant. Cancelled draws remain in history and return the participant/topic to their pools. A topic with submitted scores cannot be reassigned; cancel that attempt and start a new one instead. Published divisions remain locked.

7. Review **Scores & awards**, export the event, and explicitly publish each completed division’s results. Take the leaderboard or awards scene live when ready.
8. For a future event, use **Archive & reset** in Settings and type the displayed confirmation. This preserves the preceding event revision as a downloadable archive, resets contest progress, restores the source program’s roster/topics/panels, and retains school appearance. Refresh connected role pages after reset.

The persistent event uses code **DAVINCI26**. App updates preserve its contest progress. See [VALIDATION.md](VALIDATION.md) for checks and remaining verification limits.

## Source program and judging

The supplied `PROGRAM FLOW - 2ND IMPROMPTU SPEECH CONTEST.docx` was treated as reference data, subject to the user’s scope and access requirements. Its private source data is stored in Wix CMS, not the public frontend or repository.

- 26 participants: 8 in A, 8 in B, 10 in C; 10 topics per division.
- Ten criteria, scored individually at 0.25, 0.50, 0.75 or 1.00; each judge totals /10. Results average all assigned judges’ totals without rounding before ranking. Display rounds to two decimals. Equal averages share places; no unsupported tiebreak is invented.
- 60-second preparation; 120–180-second speech. Timing remains visible through overtime. The rubric’s time-management criterion is assessed by judges.
- Short participant names from the program and full score-sheet names are both retained because the document contains spelling differences. Admin can edit them before the division starts.
- The program gives cue cards for preparation while the rubric discourages reading notes during the speech. The app displays this distinction and does not apply automatic deductions.
- The program supplies a reference timetable, but no event date. No date is invented.

## Architecture and safeguards

Only `frontend/` is published to GitHub Pages by `.github/workflows/pages.yml`. `frontend/config.js` contains only the public Wix backend URL. Role links include the event code and selected judge identity.

The separate Wix Headless backend hosts narrow `/api/` routes. Its CMS collections, `DaVinciContestProgram` and `DaVinciContestRevisions`, have **ADMIN-only read, insert, update and remove permissions**. Server-only code elevates the specific documented CMS query/insert operations. Browsers cannot choose arbitrary collections, item IDs, fields or CMS operations. There are no server credentials in the frontend.

Accepted actions insert an immutable event snapshot with a deterministic revision ID. Duplicate IDs fail atomically, so two operators cannot commit the same next revision. Control commands require the current revision and event generation. Judge submissions and speech completion also name an immutable turn ID, allowing concurrent saves to merge safely without moving a score to the next participant. A completed speech is ranked only once every assigned judge has scored it. Publication remains blocked while any required scores are missing. Request fingerprints make identical retries idempotent, including a lost response after a committed save. Reset changes the generation and preserves the archive’s preceding revision.

The audience route constructs a whitelist projection. It returns the selected scene, any explicitly drawn topic, its timer, and explicitly published result snapshots. It does not return the topic pool, private scores, judge notes or draft scene. Draws publish a wheel timeline automatically; every display calculates the same rotation and switches to the saved contestant result at the same server deadline, including after refresh or reconnection. The reveal does not depend on Admin keeping its tab open. Reduced-motion preferences remove the rotation without changing the selected result. Scene publication is separate from result publication. Timers use server deadlines; reconnecting screens keep their last successful scene and show a connection warning.

This is deliberately an unsecured internal tool. Anyone with direct access to Admin can operate the contest; judge links do not prove a person’s identity. Origin checks and private CMS permissions limit the app’s write surface; they do not turn role URLs into authentication.

## School appearance

Settings provides the contest title, control/audience logos, colours and restrained transition options. Official blue and white school logos are bundled locally. The anniversary mark is an optional choice. Small PNG/JPEG/WebP uploads are saved with the event; arbitrary logo URLs and SVG uploads are not accepted.

See [BRANDING.md](BRANDING.md) for original sources. No generated or reconstructed school logo is used.

## Development and validation

Requires Node 24+ for the tests and the Wix backend build. From the repository root:

```text
node --test tests/contest.test.mjs
node --check frontend/app.js
```

Serve the frontend locally with `python -m http.server 8765 --directory frontend`, then open `http://127.0.0.1:8765`. It connects to the configured live backend; use a separate Wix test site for rehearsals that must not affect a real event. The automated tests use synthetic participants and an in-memory repository, with no live writes.

Backend source is in `wix-backend/`. Install using its lockfile, provide the Wix build environment through the supported Wix tooling, run `npx tsc --noEmit` and `npx astro build`, then release the built `dist/` and `.wix/` through Wix’s Headless deployment tooling. The root `wrangler.json` path in the adapter configuration avoids an absolute Windows path issue. Runtime identity is injected by Wix; do not put keys into source control.

Wix site ID: `f41bec76-7208-422c-a5a6-8134638a4eb5`. Public companion app ID: `ff359b56-6e79-46b4-ba79-0f65417f426b`.

The original Spelling Bee supplied the useful private-preview / Take-live / audience-projection pattern. This app has its own repository, backend site and CMS collections. No Spelling Bee live data, accounts, camera code, or video infrastructure is used.
