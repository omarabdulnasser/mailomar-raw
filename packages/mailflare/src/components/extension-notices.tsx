import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { useToast } from "@astryxdesign/core/Toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { TbLockAccess } from "react-icons/tb";
import { useTranslations } from "use-intl";

import { useCloudflareConfig } from "../api/config-context";
import { useStorage } from "../storage/context";
import { StorageKeys } from "../storage/storage";
import { useAuthStore } from "../stores/auth-store";

/**
 * Users can withdraw the extension's access to the Cloudflare API (Firefox
 * also lets them decline it at install). Without it, signing in with a
 * Cloudflare token can't work; Workers don't need it.
 */
export function CloudflareAccessBanner() {
    const { cloudflareAccess } = useCloudflareConfig();
    const workerUrl = useAuthStore((s) => s.workerUrl);
    const t = useTranslations("extension.access");
    const [missing, setMissing] = useState(false);
    const [denied, setDenied] = useState(false);

    useEffect(() => {
        if (!cloudflareAccess) return;
        let active = true;
        cloudflareAccess.has().then((granted) => {
            if (active) setMissing(!granted);
        });
        return () => {
            active = false;
        };
    }, [cloudflareAccess]);

    // The request has to start right in the click: browsers only show it
    // for a user action.
    const request = useCallback(() => {
        cloudflareAccess
            ?.request()
            .then((granted) => {
                setMissing(!granted);
                setDenied(!granted);
            })
            .catch(() => setDenied(true));
    }, [cloudflareAccess]);

    if (!cloudflareAccess || !missing || workerUrl) return null;

    return (
        <Banner
            status="warning"
            container="section"
            icon={<TbLockAccess />}
            title={t("title")}
            description={denied ? t("denied") : t("description")}
            endContent={<Button label={t("allow")} variant="secondary" onClick={request} />}
        />
    );
}

/** Says so once when the extension opens on a new version. */
export function useUpdateNotice() {
    const { appVersion } = useCloudflareConfig();
    const storage = useStorage();
    const toast = useToast();
    const t = useTranslations("extension");
    const checked = useRef(false);

    useEffect(() => {
        if (!appVersion || checked.current) return;
        checked.current = true;
        storage.get<string>(StorageKeys.Version).then(async (previous) => {
            if (previous === appVersion) return;
            // First install: nothing to announce.
            if (previous) toast({ body: t("updated", { version: appVersion }) });
            await storage.set(StorageKeys.Version, appVersion);
        });
    }, [appVersion, storage, toast, t]);
}
