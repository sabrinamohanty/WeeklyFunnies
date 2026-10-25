import { writeHoroscopes } from "./horoscope.mjs";

// All 12 signs:
//   node --env-file=.env.local test-horoscopes.mjs
// Or just some:
//   node --env-file=.env.local test-horoscopes.mjs Scorpio Libra
const picked = process.argv.slice(2);
const weekLabel = "Oct 26-Nov 1";

console.log("Writing horoscopes... a few seconds\n");
const started = Date.now();

const readings = await writeHoroscopes({
  signs: picked.length ? picked : undefined,
  weekLabel,
});

readings.forEach((r) => {
  console.log(r.sign + "  (lucky number " + r.lucky + ")");
  console.log("  " + r.text + "\n");
});
console.log("Done in " + ((Date.now() - started) / 1000).toFixed(0) + "s");
