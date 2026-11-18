# EEPROM library

Two tiers:

1. **`profiles.json`**: vendor identity profiles (vendor name, OUI, part number, revision) per vendor and module class.
   A profile is applied to a dump of the *target* module, so the module keeps its own capability bytes and its
   own diagnostics page (A2h). Only A0h bytes 20-59 (and SN 68-83 when asked) change, and both checksums get recomputed.
2. **`dumps/`**: real images read from genuine modules. Use these when the host checks more than the identity
   fields (profiles marked `needsRealDump`, for example Cisco). The CLI also lists `../repository/*.uieeprom`.

Recoding changes identity only. A 10G module recoded with a 25G part number is still a 10G module; the tools warn about it.

## CLI (Node 23.6 or later)

```
node tools/recode.mts list [--class 25G-SR] [--vendor mellanox]
node tools/recode.mts check some.uieeprom
node tools/recode.mts recode my-module.uieeprom mellanox-25g-sr -o out.uieeprom [--sn SERIAL]
node tools/recode.test.mts
```

## App

Pick a profile in **Recode as (vendor profile)** before **Write**. The app patches the selected image
(file, repository or backup) before sending it. A dialog asks for confirmation when the module class does not
match the profile or the profile needs a real dump. Images with bad checksums are never written.

## Adding a real dump

- From the SFP Wizard: insert the genuine module, Read, Save. Copy the `.uieeprom` into `dumps/`.
- From a Linux host: `ethtool -m <iface> raw on > module.bin`, then keep the first 512 bytes
  (`head -c 512 module.bin > dumps/Vendor-PN.uieeprom`).

Run `node tools/recode.mts check dumps/<file>` to confirm the checksums.

## Profile fields

- `oui: null` means no confirmed OUI was found for that part. Recoding then keeps the module's own OUI.
- `confidence: "partial"` means the strings come from real output, but the source does not tie them firmly to
  the listed SKU or class. Test these on the target host before you rely on them.
- `needsRealDump: true` (Cisco): IOS checks a signature in the vendor-specific area. A profile-only patch gives
  `%GBIC_SECURITY_CRYPT-4-VN_DATA_CRC_ERROR` and the port goes err-disabled unless `service unsupported-transceiver` is set.

Known host checks beyond identity strings: Intel 82599 (`ixgbe`) checks the OUI (`allow_unsupported_sfp=1` overrides it).
Intel X710/XL710 (`i40e`) enforces a qualification list in NVM and has rejected genuine Dell 25G-SR optics.
Arista EOS reportedly needs `service unsupported-transceiver` (weak source).

Gaps (no sourced strings found, add real dumps): HPE/Aruba, Juniper SR/SX/LX, Arista optics, all 25G-LR,
Mellanox MMA2P00-AS / MMA2L20-AR, Ubiquiti 1G/10G, MikroTik S+85DLC03D / S+31DLC10D, Intel LR and 25G-SR.

## Adding a profile

Each entry needs `source`: a URL that shows the EEPROM strings (real `ethtool -m`, `show interfaces transceiver`,
`show inventory` output). Do not guess vendor name, OUI or PN: hosts compare the exact strings.
