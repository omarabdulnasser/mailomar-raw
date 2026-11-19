import { Banner } from "@astryxdesign/core/Banner";
import { TbWifiOff } from "react-icons/tb";
import { useTranslations } from "use-intl";

import { useOnlineStatus } from "../hooks/use-online-status";

export function OfflineBanner() {
    const { isOnline } = useOnlineStatus();
    const t = useTranslations("offline");

    if (isOnline) return null;

    return <Banner status="warning" container="section" icon={<TbWifiOff />} title={t("banner")} />;
}
