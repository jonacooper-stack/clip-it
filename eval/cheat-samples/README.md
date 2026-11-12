# Pictures the identifier should refuse

Twelve made-up "cheat" pictures for testing the photo check in the identifier
(`api/_lib/identifyCore.ts`: a picture that isn't the player's own photograph
of a real scene must not score). The file name starts with what each one is:

- `screenshot-…` a phone screenshot of a social app showing a wildlife photo
- `watermark-…` a wildlife photo with a stock-agency style watermark across it
- `screen-…` a wildlife photo on a computer monitor, as if photographed

They are run by `npm run eval:identify -- --cheats eval/cheat-samples` (and by
the "Compare identifier models" GitHub workflow), which reports how many each
model refuses. They are drawn, not photographed: a real photo of a real screen
is usually easier to spot than these. There are no AI-generated samples;
those have to be collected by hand.

The wildlife photos inside them are public-domain or CC0 pictures from Scout's
library (`site/img/library`: lynx, wolf, wolf-2, bison, american-pika-1,
american-alligator-1; credits in `site/credits.html`). The interface elements,
names and web addresses in them are invented.
