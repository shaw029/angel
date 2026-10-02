# Companion roadmap

The priority is to make Angel more useful and easier to correct while preserving choice. Nothing below proposes blocking sites, enforcing breaks, or automatic navigation. These are future candidates, not shipped capabilities or release commitments.

## Implemented for the 0.3.0 development cycle

Optional user intent; Ask Angel controls; explanations and corrections on both nudge tiers; episode-scoped quiet mode; saved return points; evidence expiration; grounded copy; stale-result rejection; bounded reminders; corrected feedback accounting. See [implementation notes](COMPANION_IMPLEMENTATION.md) and the [changelog](../CHANGELOG.md).

## Next: validate the companion experience

Test real Chrome lifecycle behavior and model abstention using the [release validation scenarios](EVALUATION.md#stable-release-validation). Establish false-interruption and correction rates before adjusting timing. A model saying “unknown” should be a successful outcome when the evidence is weak.

## Richer context with explicit boundaries

Improve navigation and media-transition evidence so an autoplay attribute is not mistaken for an actual chain. Consider narrow site adapters only where observable transitions add reliable information. Keep user-stated intent optional, show what evidence was used, and avoid reading host-page input fields or collecting a cross-tab content history.

## More useful, quieter offers

Evaluate whether save-for-later and return points help people resume what they chose. Explore user-selected reminder timing and accessible placement. Any new action must do what its label promises, remain dismissible, and respect corrections and hard interruption limits.

## Better adaptation

Separate explicit preferences from ambiguous non-response. Evaluate conservative, reversible policy adjustments with meaningful uncertainty bounds and minimum samples. Add a way to inspect/reset learned preferences before growing the profile. Do not optimize for more clicks, more nudges, or assumed compliance.

## Ask Angel's future scope

The current Ask Angel is a controls panel. An optional question-and-answer experience would need a separate design: clearly scoped local context, evidence attribution, uncertainty, cancellation, and bounded generation. It is not part of the current implementation.

## Deferred

A smaller Gemma 3 1B option was evaluated offline and rejected; see the [evaluation record](evaluation/LITE_VS_FULL.md). Model migration is deferred, and the existing model remains unchanged. Cross-device sync, unrestricted chat, and claims of improved resilience are outside this release's scope.
