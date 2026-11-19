export type CloudflareVerifyToken = {
    expires_on?: string;
    id: string;
    not_before?: string;
    status: string;
};

export type CloudflareZone = {
    id: string;
    name: string;
    status: string;
    account: {
        id: string;
        name: string;
    };
};

export type CloudflareEmailRoutingStatus = {
    id: string;
    tag: string;
    name: string;
    enabled: boolean;
    created: string;
    modified: string;
    status: "ready" | "unconfigured" | "misconfigured" | "misconfigured/locked" | "unlocked";
    subdomains?: Array<Omit<CloudflareEmailRoutingStatus, "subdomains">>;
};

export type CloudflareEmailDestination = {
    created: string;
    email: string;
    modified: string;
    tag: string;
    verified: string | null;
};

export type CloudflareEmailRule = {
    actions: {
        type: "forward" | "worker";
        value: string[];
    }[];
    matchers: {
        field: "to";
        type: "literal" | "all";
        value: string;
    }[];
    enabled: boolean;
    name: string;
    priority: number;
    tag: string;
};

export type CloudflareResponseResultInfo = {
    count: number;
    page: number;
    per_page: number;
    total_count: number;
};

export type CloudflareSuccessResponse<T> = {
    errors: [];
    messages: { code: number; message: string }[];
    result: T;
    success: true;
    result_info: CloudflareResponseResultInfo;
};

export type CloudflareErrorResponse = {
    errors: { code: number; message: string }[];
    messages: [];
    result: null;
    success: false;
    result_info: CloudflareResponseResultInfo;
};

export type CloudflareBaseResponse<T> = CloudflareSuccessResponse<T> | CloudflareErrorResponse;

export type CloudflareVerifyTokenResponse = CloudflareBaseResponse<CloudflareVerifyToken>;
export type CloudflareListZonesResponse = CloudflareBaseResponse<CloudflareZone[]>;
export type CloudflareListEmailDestinationsResponse = CloudflareBaseResponse<
    CloudflareEmailDestination[]
>;
export type CloudflareListEmailRulesResponse = CloudflareBaseResponse<CloudflareEmailRule[]>;
export type CloudflareCreateEmailRuleResponse = CloudflareBaseResponse<CloudflareEmailRule>;
export type CloudflareEmailRoutingStatusResponse =
    CloudflareBaseResponse<CloudflareEmailRoutingStatus>;
