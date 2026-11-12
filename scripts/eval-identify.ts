// Compare models on the photo identifier, using photos whose species we know.
//
//   npm run eval:identify -- --models claude-opus-4-8,claude-haiku-5-5            (prints the plan and cost, sends nothing)
//   npm run eval:identify -- --models claude-opus-4-8,claude-haiku-5-5 --yes      (runs it)
//
// It sends each photo in site/img/library (labelled in api/_lib/photoLibrary.ts)
// through the same prompt and answer handling as the live endpoint, once per
// model, and reports how often each model named the right species, how long it
// took, and what it cost. Needs ANTHROPIC_API_KEY in the environment.
//
// Options:  --limit 30   use only the first 30 photos
//           --dir <folder> --labels <file.json>   your own photos instead: a JSON
//               list of { "file": "IMG_1.jpg", "sci": "Vulpes vulpes" }
//
// Read the result with care: the library photos are sharp, well-framed
// Wikimedia shots, easier than a phone photo of a distant bird. A model that
// does badly here will do worse in the field; one that does well here still
// deserves a second run on real player photos before the switch.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { askText, type Usage } from '../api/_lib/claude';
import { detectMediaType, IDENTIFY_SYSTEM, IDENTIFY_USER, normalizeIdentification, parseModelJson } from '../api/_lib/identifyCore';
import { PHOTO_LIBRARY } from '../api/_lib/photoLibrary';

// USD per million tokens (input, output), from platform.claude.com/docs/en/about-claude/pricing
// on 2026-11-12. Check the page before relying on the totals.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-4-8': [5, 25],
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

interface Item {
  file: string;
  sci: string;
}

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const models = (arg('models') ?? 'claude-opus-4-8,claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5').split(',').map((m) => m.trim()).filter(Boolean);
const dir = arg('dir') ?? join(__dirname, '..', 'site', 'img', 'library');
const labels: Item[] = arg('labels')
  ? JSON.parse(readFileSync(arg('labels')!, 'utf8'))
  : PHOTO_LIBRARY.map((p) => ({ file: `${p.slug}.jpg`, sci: p.sci }));
const items = labels.slice(0, Number(arg('limit')) || labels.length);

// JPEG size from its header, to estimate what each photo costs (one token per 28×28 block).
function jpegTokens(buf: Buffer): number {
  for (let i = 2; i + 9 < buf.length; ) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xc2) return Math.ceil(buf.readUInt16BE(i + 7) / 28) * Math.ceil(buf.readUInt16BE(i + 5) / 28);
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return 1600;
}

const genus = (s: string) => s.trim().toLowerCase().split(/\s+/)[0];
const binomial = (s: string) => s.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');

async function main() {
  const photos = items.map((it) => ({ ...it, data: readFileSync(join(dir, it.file)) }));
  const inputTokens = photos.reduce((n, p) => n + jpegTokens(p.data) + 520, 0);
  const outputTokens = photos.length * 450; // the answer, plus thinking on models that think first
  const usd = (n: number) => (n > 0 && n < 0.01 ? 'under $0.01' : `$${n.toFixed(2)}`);
  console.log(`${photos.length} photos × ${models.length} model${models.length === 1 ? '' : 's'}. About ${Math.round(inputTokens / 1000)}K input tokens per model.`);
  let total = 0;
  for (const m of models) {
    const price = PRICES[m];
    const cost = price ? (inputTokens * price[0] + outputTokens * price[1]) / 1e6 : NaN;
    total += cost || 0;
    console.log(`  ${m.padEnd(20)} ≈ ${price ? usd(cost) : 'price unknown'}`);
  }
  console.log(`Estimated total: about ${usd(total)}.`);
  if (!args.includes('--yes')) {
    console.log('\nNothing was sent. Add --yes to run it (this spends real API credit).');
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Set ANTHROPIC_API_KEY first.');

  for (const model of models) {
    const rows: { file: string; want: string; got: string; exact: boolean; sameGenus: boolean; eligible: boolean; usage?: Usage; error?: string }[] = [];
    const queue = [...photos];
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const base64 = p.data.toString('base64');
        try {
          const { text, usage } = await askText({
            job: 'identify',
            model,
            system: IDENTIFY_SYSTEM,
            prompt: [
              { type: 'image', source: { type: 'base64', media_type: detectMediaType(base64) ?? 'image/jpeg', data: base64 } },
              { type: 'text', text: IDENTIFY_USER },
            ],
            maxTokens: 4096,
            timeoutMs: 60_000,
            maxRetries: 2,
          });
          const id = normalizeIdentification(parseModelJson(text));
          const got = id.species.scientificName;
          rows.push({ file: p.file, want: p.sci, got, exact: binomial(got) === binomial(p.sci), sameGenus: genus(got) === genus(p.sci), eligible: id.eligible, usage });
        } catch (err: any) {
          rows.push({ file: p.file, want: p.sci, got: '', exact: false, sameGenus: false, eligible: false, error: String(err?.message ?? err).slice(0, 120) });
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);

    const done = rows.filter((r) => r.usage);
    const inTok = done.reduce((n, r) => n + r.usage!.inputTokens + r.usage!.cacheReadTokens + r.usage!.cacheWriteTokens, 0);
    const outTok = done.reduce((n, r) => n + r.usage!.outputTokens, 0);
    const ms = done.map((r) => r.usage!.ms).sort((a, b) => a - b);
    const price = PRICES[model];
    const cost = price ? (inTok * price[0] + outTok * price[1]) / 1e6 : NaN;
    const pct = (n: number) => `${((100 * n) / rows.length).toFixed(0)}%`;
    console.log(`\n=== ${model} ===`);
    console.log(`right species: ${rows.filter((r) => r.exact).length}/${rows.length} (${pct(rows.filter((r) => r.exact).length)})   right genus: ${pct(rows.filter((r) => r.sameGenus).length)}   scored as wildlife: ${pct(rows.filter((r) => r.eligible).length)}   errors: ${rows.filter((r) => r.error).length}`);
    if (ms.length) console.log(`time per photo: median ${(ms[Math.floor(ms.length / 2)] / 1000).toFixed(1)}s, slowest tenth ${(ms[Math.floor(ms.length * 0.9)] / 1000).toFixed(1)}s`);
    console.log(`tokens: ${inTok} in, ${outTok} out${price ? `   cost: $${cost.toFixed(3)} total, $${((1000 * cost) / Math.max(done.length, 1)).toFixed(2)} per 1,000 photos` : ''}`);
    const misses = rows.filter((r) => !r.exact);
    if (misses.length) console.log(`missed:\n${misses.map((r) => `  ${r.file}: wanted ${r.want}, got ${r.error ? `ERROR ${r.error}` : r.got || '(nothing)'}`).join('\n')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
