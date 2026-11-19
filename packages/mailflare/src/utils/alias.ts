import { generate as randomWords } from "random-words";
import { parse as parseDomain } from "tldts";

import type { AliasSettings } from "../stores/alias-settings-store";
import { randomString } from "./random-string";

export type GenerateAliasOptions = Omit<AliasSettings, "destination"> & {
    customPrefix?: string;
    hostname?: string;
};

export function generateAliasAddress({
    format = "characters",
    characterCount = 5,
    wordCount = 2,
    separator = "_",
    prefixFormat = "none",
    customPrefix,
    hostname,
}: GenerateAliasOptions): string {
    let prefix = "";
    if (prefixFormat === "custom" && customPrefix) {
        prefix = customPrefix.trim();
    } else if (hostname) {
        const parsedHostname = parseDomain(hostname);

        if (prefixFormat === "domainWithoutExtension" && parsedHostname.domainWithoutSuffix) {
            prefix = parsedHostname.domainWithoutSuffix;
        } else if (prefixFormat === "domainWithExtension" && parsedHostname.domain) {
            prefix = parsedHostname.domain;
        } else if (prefixFormat === "fullDomain") {
            prefix = parsedHostname.hostname ?? hostname;
        }
    }

    if (prefix !== "" && format !== "domain") {
        prefix = `${prefix}${separator}`;
    }

    switch (format) {
        case "characters":
            return `${prefix}${randomString(characterCount)}`.toLowerCase();
        case "words":
            return `${prefix}${randomWords({ exactly: wordCount, join: separator })}`.toLowerCase();
        case "domain":
            return prefix.toLowerCase();
        default:
            throw new Error("Invalid alias type.");
    }
}
