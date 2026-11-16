# Verification record

## Take live starts the wheel

Draws now save a private stationary wheel with no start/deadline timestamps. Only Take live creates the synchronized spin timeline. Tests verify no audience change before publication, stationary preview even after a long delay, full spin after publication, automatic reveal afterward, and no replay from a second Take live. Existing event data is preserved.


## Undo and contestant selection

Verified on 13 November 2026. All 35 tests pass, including undo history, participant/topic pool restoration, completion reopening, separate score ownership across contestant switches, confirmation and stale-update rejection. TypeScript and production build passed. Browser checks used synthetic local participants; the live event was not changed during testing.


## Animated draw and judging update

Verified on 13 November 2026, America/Bogota.

- 31 automated tests pass, including automatic wheel publication and reveal, deterministic pointer alignment for pools of 1–100 entries, identical-retry preservation of the spin, topic-pool privacy, late judge submissions, judge queues, concurrent completion/scoring, and publication blocked by missing scores.
- The updated Wix backend passes TypeScript checking and the production build.
- Browser tests use a separate local contest with explicitly labelled preview participants. The participant and topic wheels appear without Take live, animate, land, and switch automatically to the selected contestant/topic. Completing a speech at 0/2 scores permits the next draw while preserving the earlier judge’s open draft and selected scores.
- The current Wix event was read before deployment; it already had a participant in progress. These changes do not reset, complete, draw, score or otherwise alter that event as part of verification.

Verified on 12 November 2026, America/Bogota.

- 25 automated tests passed using synthetic participants and an in-memory repository. They cover simultaneous initialization/draws, unique topic/participant draws, score validation and duplicate rejection, concurrent judge submissions, lost-response retries, stale updates, private projections, timer recovery, publication, tied averages, bounded logo uploads, and idempotent archive/reset.
- The Wix backend passed TypeScript checking and the production build.
- A live Wix CMS rehearsal used explicitly labelled rehearsal participants and judges. Draws, idempotent retries, timer phases, audience filtering, concurrent judge submissions, the expected 8.75 average, explicit publication, awards, export, archive download and reset passed. The original school roster and panels were restored with zero active draws and scores. One clearly labelled rehearsal archive remains available in Admin.
- The GitHub Pages frontend was opened against the live Wix backend. Initialization, private preview and Take live were checked in the browser.
- Audience layout was inspected at 1280 × 720 with a long prompt/timer and a ten-participant leaderboard using a read-only local layout fixture. No overflow was observed. The score sheet was checked at 390 × 844; ten 0.75 selections produced a 7.50 confirmation naming the selected judge and participant. The fixture was not submitted as a real score.
- School logos were downloaded from the school’s own website and inspected in the actual layouts.
- No physical school television, projector or judge device was tested. A rehearsal on those devices is still appropriate before the event.

## Dependency review

Compatible dependency fixes were applied and unused template code, React styling dependencies and the CLI dependency were removed. The final npm audit reports one underlying high-severity Zod advisory, propagated through four packages in Wix’s Astro/dashboard feedback tooling. npm proposes a breaking Wix integration downgrade; that was not applied. Contest input uses explicit bounded validation and does not invoke Zod. This does not establish that the upstream issue is harmless; review the Wix integration when a compatible upstream fix is available.

Advisory: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5


## Responsive layout review — 13 November 2026

- Fixed the overlapping stage logo and division heading by separating the header, scene body and footer into grid rows. Branding uses the preview container dimensions rather than the browser viewport.
- Reviewed all six Admin pages at desktop and phone widths, plus the home, judge and emcee pages at 375, 768 and 1280 pixels. No page-wide horizontal overflow was found after fixes. Tables and the mobile navigation retain their own horizontal scrolling.
- Fixed mobile navigation links collapsing into tall narrow columns, wrapping card headings and controls, long names, score option labels, and the sticky judge total. Opened the score confirmation dialog on a phone-sized viewport.
- Exercised all 14 audience scenes with synthetic long names and prompts at 1280×720, 1920×1080 and 375×812. Checked branding/body/footer separation and horizontal overflow. Reduced participant/results row spacing to fit ten entries on a 720p screen.
- Checked all scenes in 300, 400 and 1100 pixel-wide previews. All 56 final full-screen/preview combinations at 720p passed the geometry and content-fit checks before publication.
- Verified both prepared wheel previews remain stationary until Take live. All 35 contest tests pass; frontend JavaScript syntax check passes.
- Test contest and layout fixtures were local and synthetic. No production contest draws, scores, scene changes or resets were performed during this review. The temporary layout fixture is excluded from the published frontend.


## Whole competition reset — 15 November 2026

- Added a clearly labeled Reset whole competition button on Contest control and aligned the Settings label and confirmation text.
- Reuses the server reset: archive the current snapshot, restore original rosters/topics/panels across A/B/C, clear turns/live/pending wheels/publications, rotate event generation, keep event code and school settings.
- All 36 tests pass, including a new scenario with published Division A results, a completed Division B speech and an active scored Division C speech. Verified original division data, empty judge queues, retained settings and archived practice data.
- Exercised draw → reset confirmation → reset in the local synthetic event. The preview returns to standby and all divisions require roster/panel review again. No production reset was performed.


## Ceremony and special awards — 16 November 2026

- Added a validated editable standby date, removed separate school/division text from standby, and added a public mechanics scene. Logo assets and wheel behavior are unchanged.
- Removed the audience leaderboard and added a podium layout for ranks 1–3. Old saved leaderboard scenes are projected as podiums and stripped of later ranks.
- Added ceremony shortcuts in the requested order and aligned program/emcee cues.
- Added a separate configurable special-award panel, direct ballot page, three required selections per assigned judge, locked ballots, private judge projections, Admin vote review/tie resolution, explicit publication, and a public winners scene.
- All 41 tests pass, including date validation, invalid ballot/identity/participant rejection, concurrency/idempotent retry, duplicate rejection, panel locking, incomplete ballots, tied publication, privacy, legacy scenes, and reset compatibility. Type checking and the Wix backend build pass.
- Local synthetic UI: changed the date through Settings; submitted and reviewed two distinct judge ballots; reviewed and published the winners in Admin; took mechanics/certificates/podium/special awards live. All five relevant scenes fit 1280×720 and 375×812 without horizontal overflow or content clipping. Verified the same scenes in the private Admin preview.
- No production contest commands, scoring, draws, publication or reset were used in verification. Deployment preserves the existing persistent event; the special-award panel starts unassigned.
