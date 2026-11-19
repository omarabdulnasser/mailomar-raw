export type ImportService = "addy" | "simplelogin";

export type ImportedAlias = {
    email: string;
    localPart: string;
    domain: string;
    enabled: boolean;
    description: string;
    source: ImportService;
};

export type ImportProgress = {
    total: number;
    completed: number;
    failed: number;
    errors: string[];
    status: "idle" | "fetching" | "importing" | "done" | "error";
};

export type ImportResult = {
    imported: number;
    skipped: number;
    failed: number;
    errors: string[];
};
