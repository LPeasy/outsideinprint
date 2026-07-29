# The Things We Say Publication Contract

The Things We Say is Outside In Print's open-ended Affirmation collection.
It has its own publication type and publisher. It is not a Musings option.
Entries publish one at a time when they are ready.

## Source

Each entry begins with at least one exact affirmation from
[affirmations-bank.md](affirmations-bank.md). Record the selection in the
package manifest and the package's post-publication record. Keep the bank
read-only during routine publishing.

The selected affirmation must appear verbatim in at least one canonical
`franklin-pullquote`:

```html
<figure class="franklin-pullquote" aria-label="Affirmation">
  <blockquote>I do the things that I say I’m going to do.</blockquote>
  <figcaption>- Robby V.</figcaption>
</figure>
```

Each piece may use one or two pull quotes. At least one must be the chosen
affirmation.

## Publication Type

New entries belong under `content/essays/affirmations/` and use:

```yaml
section_label: "Affirmation"
library_type: "affirmation"
collections: ["the-things-we-say"]
source_mode: "SOURCE_FREE"
external_factual_claims: "none"
```

The source-free declaration applies only while the piece remains personal
reflection, identity practice, aspiration, or lived experience. If a piece
introduces an empirical, historical, current, legal, medical, financial,
statistical, scientific, or named-actor claim, reopen the evidence controls
appropriate to that claim before publication.

Use the dedicated `oip-publish-affirmation` publisher. Keep the Musings
contract and publisher separate.

## Form

Keep each entry:

- plain;
- positive;
- personal;
- centered on one affirmation;
- grounded in action, experience, or recognition;
- as short as the thought needs.

There is no fixed number of entries and no staged series schedule.

## Front-Page Illustration

Every entry receives one 16:9 front-page illustration. The same PNG serves
as the article hero and its image in the unified Gallery. Those live copies
must be byte-identical.

Use the OIP Watercolor Chiaroscuro style:

- strong sketched linework;
- dark chiaroscuro;
- visible crosshatching;
- transparent watercolor washes;
- a full, controlled palette;
- atmospheric, impressionistic light;
- expressive movement;
- anonymous people, ordinary objects, or timeless symbolic scenes.

Blend the OIP Gallery house linework with the atmospheric light associated
with Monet and the expressive motion associated with Van Gogh, translated
into watercolor. Do not copy a particular work.

This collection does not use the political-cartoon single-accent-color
rule. It also does not require political-cartoon staging. Avoid clutter,
logos, signatures, watermarks, and unnecessary text.

Midpoint art is optional. Use it only when it helps the piece.

## Gallery

The illustration belongs in the existing unified Gallery. Do not create a
separate public gallery, badge, or label for this collection's art.

## Publication Gate

A ready entry must pass:

- exact metadata validation;
- affirmation-bank and pull-quote matching;
- image dimensions and accessibility checks;
- byte-identity checks for hero and Gallery copies;
- collection, homepage, Archive, Library, and Gallery rendering checks;
- the standard Hugo and public-route gates.

The exact package schema and routine `4 + N` publish allowlist live in the
dedicated publisher contract.
