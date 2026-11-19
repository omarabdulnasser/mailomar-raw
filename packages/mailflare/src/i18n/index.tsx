import { type ReactNode, createContext, useContext } from "react";
import { IntlProvider as UseIntlProvider } from "use-intl";

import type enMessages from "./messages/en.json";

export type Messages = typeof enMessages;

type IntlConfig = {
    locale: string;
    messages: Messages;
};

const IntlConfigContext = createContext<IntlConfig | null>(null);

export function IntlProvider({ locale, messages, children }: IntlConfig & { children: ReactNode }) {
    return (
        <IntlConfigContext.Provider value={{ locale, messages }}>
            <UseIntlProvider locale={locale} messages={messages}>
                {children}
            </UseIntlProvider>
        </IntlConfigContext.Provider>
    );
}

export function useIntlConfig() {
    const config = useContext(IntlConfigContext);
    if (!config) throw new Error("useIntlConfig must be used within IntlProvider");
    return config;
}

export { useTranslations, useLocale } from "use-intl";
