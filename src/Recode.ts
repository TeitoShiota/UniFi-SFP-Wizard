// SFF-8472 (SFP/SFP+/SFP28) identity recoding. Pure functions, erasable TypeScript only,
// so Node runs this file directly (tools/recode.mts) and webpack bundles it for the app.

export type Profile = {
    id: string;
    vendor: string;
    class: string;
    sku: string;
    vendorName: string;
    oui: string | null;   // "00:02:c9"; null = keep the module's own OUI (not confirmed for this part)
    pn: string;
    rev: string | null;
    needsRealDump: boolean;
    confidence?: string;  // "confirmed" | "partial", see eeprom-library/README.md
    source: string;
};

const sum = (img: Uint8Array, from: number, to: number) => {
    let s = 0;
    for (let i = from; i <= to; i++) s += img[i];
    return s & 0xff;
};

/** CC_BASE = byte 63 (sum of 0-62), CC_EXT = byte 95 (sum of 64-94). */
export function checksums(img: Uint8Array): { base: boolean; ext: boolean } {
    return {base: sum(img, 0, 62) === img[63], ext: sum(img, 64, 94) === img[95]};
}

/** Rough speed/media class from the A0h compliance bytes. */
export function classify(img: Uint8Array): string {
    const wavelength = (img[60] << 8) | img[61];
    const shortWave = wavelength > 0 && wavelength < 1000;
    const ext = img[36];
    // Byte 8 bit 2/3 = passive/active copper cable (DAC); never mix DAC and optic codings.
    if (img[8] & 0x0c) return "DAC";
    if (ext === 0x02) return "25G-SR";
    if (ext === 0x03) return "25G-LR";
    // Nominal rate 0xFF means "see byte 66" in units of 250 MBd; >= 0x64 is ~25G.
    if (img[12] === 0xff && img[66] >= 0x64) return shortWave ? "25G-SR" : "25G-LR";
    if (img[3] & 0x10) return "10G-SR";
    if (img[3] & 0x20) return "10G-LR";
    if (img[6] & 0x01) return "1G-SX";
    if (img[6] & 0x02) return "1G-LX";
    if (img[6] & 0x08) return "1G-T";
    return "unknown";
}

export function readField(img: Uint8Array, from: number, len: number): string {
    return String.fromCharCode(...img.slice(from, from + len)).trim();
}

function writeField(img: Uint8Array, from: number, len: number, value: string) {
    if (!/^[\x20-\x7e]*$/.test(value) || value.length > len) {
        throw new Error(`Field '${value}' must be printable ASCII, max ${len} chars`);
    }
    img.fill(0x20, from, from + len);
    for (let i = 0; i < value.length; i++) img[from + i] = value.charCodeAt(i);
}

/**
 * Returns a copy of a 512-byte SFF-8472 image with the A0h identity replaced by the profile.
 * A2h (bytes 256-511, diagnostics/thresholds) is left untouched.
 */
export function recode(input: Uint8Array, profile: Profile, opts: { sn?: string } = {}): { image: Uint8Array; warnings: string[] } {
    if (input.length !== 512) throw new Error(`Expected 512-byte SFP image, got ${input.length}`);
    if (input[0] !== 0x03) throw new Error(`Byte 0 is 0x${input[0].toString(16)}, not 0x03 (SFP/SFP+/SFP28)`);
    const cc = checksums(input);
    if (!cc.base || !cc.ext) throw new Error("Input image has bad checksums; refusing to recode a corrupt read");

    const oui = profile.oui === null ? null : profile.oui.split(":").map(h => parseInt(h, 16));
    if (oui !== null && (oui.length !== 3 || oui.some(b => isNaN(b) || b < 0 || b > 255))) throw new Error(`Bad OUI '${profile.oui}'`);

    const img = new Uint8Array(input);
    writeField(img, 20, 16, profile.vendorName);
    if (oui !== null) img.set(oui, 37);
    writeField(img, 40, 16, profile.pn);
    if (profile.rev !== null) writeField(img, 56, 4, profile.rev);
    if (opts.sn !== undefined) writeField(img, 68, 16, opts.sn);
    img[63] = sum(img, 0, 62);
    img[95] = sum(img, 64, 94);

    const warnings: string[] = [];
    const moduleClass = classify(input);
    if (moduleClass !== profile.class) {
        warnings.push(`Module looks like ${moduleClass} but profile is ${profile.class}; recoding does not change what the hardware can do.`);
    }
    if (profile.needsRealDump) {
        warnings.push(`${profile.vendor} platforms may check vendor-specific bytes 96-127; a profile patch may be rejected. Prefer a real dump.`);
    }
    return {image: img, warnings};
}
