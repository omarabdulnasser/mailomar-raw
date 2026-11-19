import {
    MailflareProvider,
    ExtensionStorageAdapter,
    createPersister,
    ImportWizard,
} from "@mailflare/core";
import messages from "@mailflare/core/i18n/messages/en.json";
import React from "react";
import ReactDOM from "react-dom/client";

import { migrateStorage } from "../../utils/migrate-storage";

const storageAdapter = new ExtensionStorageAdapter();
const persister = createPersister(storageAdapter);
// Only English messages exist; format dates and numbers to match them.
const locale = "en";

// 1.x data has to be converted before the app reads it.
await migrateStorage();

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <MailflareProvider
            storageAdapter={storageAdapter}
            persister={persister}
            locale={locale}
            messages={messages}
            isExtension={true}
        >
            <ImportWizard />
        </MailflareProvider>
    </React.StrictMode>,
);
