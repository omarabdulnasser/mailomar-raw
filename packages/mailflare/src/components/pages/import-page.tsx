// Importing aliases from addy.io or SimpleLogin, as a page of the app. Both
// services allow browsers to call their APIs from any site, so this works in
// the web app and the Worker's app as it does in the extension.

import { useTranslations } from "use-intl";

import { ImportWizard } from "../import";
import { PageBody, PageHeader } from "./page-header";

export function ImportPage() {
    const t = useTranslations("import");
    return (
        <PageBody>
            <PageHeader title={t("title")} description={t("page_description")} />
            <ImportWizard standalone={false} />
        </PageBody>
    );
}
