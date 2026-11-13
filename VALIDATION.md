# Verification record

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
