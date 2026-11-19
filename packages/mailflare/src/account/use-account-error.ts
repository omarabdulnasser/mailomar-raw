import { isHTTPError } from "ky";
import { useTranslations } from "use-intl";

/** Error codes better-auth uses in redirects (`?error=`) after a bad link. */
const LINK_ERRORS = new Set([
    "INVALID_TOKEN",
    "EXPIRED_TOKEN",
    "TOKEN_EXPIRED",
    "ATTEMPTS_EXCEEDED",
    "NEW_USER_SIGNUP_DISABLED",
]);

export const isLinkError = (code: string) => LINK_ERRORS.has(code.toUpperCase());

/** Turns failed account calls (better-auth client results, ky errors) into readable text. */
export function useAccountErrorMessage() {
    const t = useTranslations("account");

    return (error: unknown, email = ""): string => {
        const { code, status, message } = (error ?? {}) as {
            code?: string;
            status?: number;
            message?: string;
        };
        const httpStatus = isHTTPError(error) ? error.response.status : status;
        if (httpStatus === 429) return t("errors.too_many");
        if (code === "INVALID_EMAIL_OR_PASSWORD") return t("errors.wrong_password");
        if (code === "EMAIL_NOT_VERIFIED") return t("verify_email_first", { email });
        if (code && isLinkError(code)) return t("errors.link_invalid");
        return t("errors.generic", { error: message || String(error) });
    };
}
