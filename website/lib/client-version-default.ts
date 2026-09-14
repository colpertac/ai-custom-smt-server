/** Stock JP client / lobby default (1.666). Safe for client and server. */
export const DEFAULT_CLIENT_VERSION_CODE = 1666

/**
 * Reimagine-style overlay file. ImagineUpdate copies this next to
 * ImagineClient.exe. `<version>` is the integer lobby ClientVersion × 1000.
 */
export const DEFAULT_COMP_CLIENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<config>
    <patch name="noWebAuth">apply</patch>
    <patch name="customPackets">apply</patch>
    <patch name="updaterCheck">skip</patch>
    <version>${DEFAULT_CLIENT_VERSION_CODE}</version>
</config>
`
