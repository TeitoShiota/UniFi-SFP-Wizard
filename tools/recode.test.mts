// node tools/recode.test.mts
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {checksums, classify, readField, recode, type Profile} from "../src/Recode.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = new Uint8Array(readFileSync(join(root, "repository/FS-SFP-10GLR-31.uieeprom")));
assert.equal(classify(src), "10G-LR");
assert.deepEqual(checksums(src), {base: true, ext: true});
const dac = new Uint8Array(src); dac[8] = 0x04;
assert.equal(classify(dac), "DAC");

const profile: Profile = {
    id: "test-10g-lr", vendor: "Test", class: "10G-LR", sku: "X", vendorName: "Mellanox",
    oui: "00:02:c9", pn: "TEST-PN", rev: "A2", needsRealDump: false, source: "",
};

const {image, warnings} = recode(src, profile, {sn: "SN123"});
assert.equal(readField(image, 20, 16), "Mellanox");
assert.deepEqual([...image.slice(37, 40)], [0x00, 0x02, 0xc9]);
assert.equal(readField(image, 40, 16), "TEST-PN");
assert.equal(readField(image, 56, 4), "A2");
assert.equal(readField(image, 68, 16), "SN123");
assert.deepEqual(checksums(image), {base: true, ext: true});
assert.deepEqual(image.slice(256), src.slice(256), "A2h must be untouched");
assert.deepEqual(warnings, []);
assert.notEqual(image, src, "input must not be mutated");
assert.equal(readField(src, 20, 16) === "Mellanox", false);

// Null OUI keeps the module's own OUI.
assert.deepEqual(recode(src, {...profile, oui: null}).image.slice(37, 40), src.slice(37, 40));

// Class mismatch and real-dump vendors warn.
assert.equal(recode(src, {...profile, class: "25G-SR", needsRealDump: true}).warnings.length, 2);

// Guards.
const bad = new Uint8Array(src); bad[63] ^= 1;
assert.throws(() => recode(bad, profile), /checksums/);
assert.throws(() => recode(src.slice(0, 256), profile), /512/);
assert.throws(() => recode(src, {...profile, pn: "x".repeat(17)}), /max 16/);
assert.throws(() => recode(src, {...profile, oui: "zz"}), /OUI/);

console.log("recode tests OK");
