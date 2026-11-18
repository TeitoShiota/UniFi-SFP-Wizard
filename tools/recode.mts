// EEPROM library CLI. Node >= 23.6 (runs TypeScript directly). No dependencies.
//   node tools/recode.mts list [--class 25G-SR] [--vendor mellanox]
//   node tools/recode.mts check <file.uieeprom>...
//   node tools/recode.mts recode <module.uieeprom> <profile-id> [-o out.uieeprom] [--sn SERIAL]
import {readFileSync, writeFileSync, readdirSync, existsSync} from "node:fs";
import {join, dirname, basename} from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {checksums, classify, readField, recode, type Profile} from "../src/Recode.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const profiles: Profile[] = JSON.parse(readFileSync(join(root, "eeprom-library/profiles.json"), "utf8"));
const dumpDirs = [join(root, "eeprom-library/dumps"), join(root, "repository")];

const {positionals, values} = parseArgs({
    allowPositionals: true,
    options: {class: {type: "string"}, vendor: {type: "string"}, o: {type: "string"}, sn: {type: "string"}},
});
const [cmd, ...args] = positionals;

const describe = (path: string) => {
    const img = new Uint8Array(readFileSync(path));
    if (img.length !== 512 && img.length !== 640) return `${basename(path)}: ${img.length} bytes, not an SFP/QSFP image`;
    const cc = checksums(img);
    return `${basename(path)}: ${classify(img)}  vendor='${readField(img, 20, 16)}'  pn='${readField(img, 40, 16)}'  sn='${readField(img, 68, 16)}'  checksums ${cc.base && cc.ext ? "OK" : "BAD"}`;
};

if (cmd === "list") {
    const match = (p: Profile) =>
        (!values.class || p.class.toLowerCase() === values.class.toLowerCase()) &&
        (!values.vendor || p.vendor.toLowerCase().includes(values.vendor.toLowerCase()));
    console.log("Profiles:");
    for (const p of profiles.filter(match)) {
        console.log(`  ${p.id.padEnd(28)} ${p.class.padEnd(7)} ${p.sku.padEnd(20)} ${p.needsRealDump ? "(needs real dump)" : ""}`);
    }
    console.log("Real dumps:");
    for (const dir of dumpDirs.filter(existsSync)) {
        for (const f of readdirSync(dir).filter(f => f.endsWith(".uieeprom") || f.endsWith(".bin"))) {
            console.log("  " + describe(join(dir, f)));
        }
    }
} else if (cmd === "check" && args.length > 0) {
    args.forEach(f => console.log(describe(f)));
} else if (cmd === "recode" && args.length === 2) {
    const [input, id] = args;
    const profile = profiles.find(p => p.id === id);
    if (!profile) throw new Error(`Unknown profile '${id}'. Run 'list'.`);
    const {image, warnings} = recode(new Uint8Array(readFileSync(input)), profile, {sn: values.sn});
    warnings.forEach(w => console.warn("WARNING: " + w));
    const out = values.o ?? `${profile.id}.uieeprom`;
    writeFileSync(out, image);
    console.log(`Wrote ${out}`);
    console.log(describe(out));
} else {
    console.log("usage: node tools/recode.mts list [--class C] [--vendor V] | check <file>... | recode <module.uieeprom> <profile-id> [-o out] [--sn SERIAL]");
    process.exit(1);
}
