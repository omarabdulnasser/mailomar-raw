import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Link } from "@astryxdesign/core/Link";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    TbEdit,
    TbListCheck,
    TbPlaylistX,
    TbPlus,
    TbRefresh,
    TbSearch,
    TbSearchOff,
    TbTrash,
} from "react-icons/tb";
import { useTranslations } from "use-intl";
import { useLocation } from "wouter";

import { useCloudflareConfig } from "../api/config-context";
import type { Alias } from "../backend/types";
import { ALL_ZONES, useMailflare } from "../backend/use-mailflare";
import { useOnlineStatus } from "../hooks/use-online-status";
import { useAuthStore } from "../stores/auth-store";
import { useSettingsStore } from "../stores/settings-store";
import { useUIStore } from "../stores/ui-store";
import { sort } from "../utils/sort";
import { AliasBulkDeleteDialog } from "./alias-bulk-delete-dialog";
import { AliasBulkEditDialog } from "./alias-bulk-edit-dialog";
import { AliasCard } from "./alias-card";
import { AliasCreateDialog } from "./alias-create-dialog";
import { AliasDeleteDialog } from "./alias-delete-dialog";
import { AliasEditDialog } from "./alias-edit-dialog";
import { PATHS } from "./navigation";
import { VirtualRows } from "./virtual-rows";

type AliasListProps = {
    /** Wide screens: domains are in the sidebar, not in a selector here. */
    hideDomainSelector?: boolean;
    /** Wide screens: opens an alias in the detail pane instead of the edit dialog. */
    onOpenAlias?: (alias: Alias) => void;
    openAliasId?: string | null;
};

export function AliasList({ hideDomainSelector, onOpenAlias, openAliasId }: AliasListProps) {
    const t = useTranslations("alias_list");
    const tc = useTranslations("common");

    const {
        selectedZoneId,
        setSelectedZoneId,
        zones,
        zoneStatus,
        aliases,
        canManageDomains,
        canEditDomains,
        account,
    } = useMailflare();

    const ruleFilter = useSettingsStore((s) => s.ruleFilter);
    const { isOnline } = useOnlineStatus();
    const aliasSearch = useUIStore((s) => s.aliasSearch);
    const setAliasSearch = useUIStore((s) => s.setAliasSearch);
    const selectedAliases = useUIStore((s) => s.selectedAliases);
    const setAliasSelected = useUIStore((s) => s.setAliasSelected);
    const clearSelection = useUIStore((s) => s.clearSelection);
    const createOpen = useUIStore((s) => s.createOpen);
    const setCreateOpen = useUIStore((s) => s.setCreateOpen);
    const editOpen = useUIStore((s) => s.editOpen);
    const setEditOpen = useUIStore((s) => s.setEditOpen);
    const deleteOpen = useUIStore((s) => s.deleteOpen);
    const setDeleteOpen = useUIStore((s) => s.setDeleteOpen);
    const { lockedWorkerUrl } = useCloudflareConfig();
    const workerUrl = useAuthStore((s) => s.workerUrl);
    const [, navigate] = useLocation();
    const selectEnabled = useUIStore((s) => s.selectEnabled);
    const setSelectEnabled = useUIStore((s) => s.setSelectEnabled);
    const searchVisible = useUIStore((s) => s.searchVisible);
    const setSearchVisible = useUIStore((s) => s.setSearchVisible);
    const aliasToEditId = useUIStore((s) => s.aliasToEditId);
    const setAliasToEditId = useUIStore((s) => s.setAliasToEditId);
    const aliasToDeleteId = useUIStore((s) => s.aliasToDeleteId);
    const setAliasToDeleteId = useUIStore((s) => s.setAliasToDeleteId);
    const scrollPosition = useUIStore((s) => s.scrollPosition);
    const setScrollPosition = useUIStore((s) => s.setScrollPosition);

    const [filteredAliases, setFilteredAliases] = useState<Alias[]>([]);

    // Once the zones are known (not the empty list shown while they load): keep
    // the stored choice if it still exists, otherwise all domains, or the only one.
    const zonesLoaded = zones.isSuccess && !zones.isPlaceholderData;
    useEffect(() => {
        if (!zonesLoaded) return;
        const ids = zones.data.map((zone) => zone.id);
        const valid =
            selectedZoneId === ALL_ZONES
                ? ids.length > 1
                : selectedZoneId !== null && ids.includes(selectedZoneId);
        if (valid) return;
        setSelectedZoneId(ids.length > 1 ? ALL_ZONES : (ids[0] ?? null));
    }, [zonesLoaded, zones.data, selectedZoneId, setSelectedZoneId]);

    // Cached aliases stay listed when a refresh fails (e.g. offline).
    useEffect(() => {
        if (!aliases.data || aliases.data.length === 0) {
            setFilteredAliases([]);
            return;
        }
        const search = aliasSearch.toLowerCase();
        setFilteredAliases(
            sort(
                aliases.data
                    .filter((a) => (ruleFilter ? !a.isExternal : true))
                    .filter(
                        (a) =>
                            search === "" ||
                            a.description.toLowerCase().includes(search) ||
                            a.address.toLowerCase().includes(search),
                    ),
                { order: "desc", by: (item) => item.order },
            ),
        );
    }, [aliases.data, ruleFilter, aliasSearch]);

    const aliasToEdit = filteredAliases.find((a) => a.id === aliasToEditId) ?? null;
    const aliasToDelete = filteredAliases.find((a) => a.id === aliasToDeleteId) ?? null;

    // Stable callbacks, so the (memoized) cards only re-render when their alias changes.
    const openAlias = useRef(onOpenAlias);
    openAlias.current = onOpenAlias;
    const hasDetailPane = !!onOpenAlias;
    const selectedIds = useMemo(
        () => new Set(selectedAliases.map((alias) => alias.id)),
        [selectedAliases],
    );
    const handleOpen = useCallback((alias: Alias) => openAlias.current?.(alias), []);
    const handleEdit = useCallback(
        (alias: Alias) => {
            if (openAlias.current) {
                openAlias.current(alias);
                return;
            }
            setAliasToEditId(alias.id);
            setEditOpen(true);
        },
        [setAliasToEditId, setEditOpen],
    );
    const handleDelete = useCallback(
        (alias: Alias) => {
            setAliasToDeleteId(alias.id);
            setDeleteOpen(true);
        },
        [setAliasToDeleteId, setDeleteOpen],
    );

    // Stable, so the memoized dialogs skip re-rendering while they're closed.
    const closeCreate = useCallback(() => setCreateOpen(false), [setCreateOpen]);
    const closeEdit = useCallback(() => {
        setEditOpen(false);
        setAliasToEditId(null);
    }, [setEditOpen, setAliasToEditId]);
    const closeDelete = useCallback(() => {
        setDeleteOpen(false);
        setAliasToDeleteId(null);
    }, [setDeleteOpen, setAliasToDeleteId]);
    const endSelection = useCallback(() => {
        setSelectEnabled(false);
        clearSelection();
    }, [setSelectEnabled, clearSelection]);
    const closeBulkEdit = useCallback(
        (clear?: boolean) => {
            setEditOpen(false);
            if (clear) endSelection();
        },
        [setEditOpen, endSelection],
    );
    const closeBulkDelete = useCallback(
        (clear?: boolean) => {
            setDeleteOpen(false);
            if (clear) endSelection();
        },
        [setDeleteOpen, endSelection],
    );

    const showsAllZones = selectedZoneId === ALL_ZONES;
    const selectedZone = zones.data?.find((zone) => zone.id === selectedZoneId);
    const zoneOptions = [
        ...((zones.data?.length ?? 0) > 1 ? [{ value: ALL_ZONES, label: t("all_domains") }] : []),
        ...(zones.data?.map((zone) => ({ value: zone.id, label: zone.name })) ?? []),
    ];
    const noZoneSelected = !zones.data || zones.data.length === 0 || selectedZoneId === null;
    const routingNotReady = !!selectedZoneId && zoneStatus.data?.ready === false;

    return (
        <VStack gap={2}>
            <AliasCreateDialog open={createOpen} onClose={closeCreate} />

            <AliasEditDialog
                open={editOpen && !!aliasToEdit && selectedAliases.length === 0}
                onClose={closeEdit}
                alias={aliasToEdit}
            />

            <AliasBulkEditDialog
                open={editOpen && selectedAliases.length > 0}
                onClose={closeBulkEdit}
                selectedAliases={selectedAliases}
            />

            <AliasDeleteDialog
                open={deleteOpen && !!aliasToDelete && selectedAliases.length === 0}
                onClose={closeDelete}
                alias={aliasToDelete}
            />

            <AliasBulkDeleteDialog
                open={deleteOpen && selectedAliases.length > 0}
                onClose={closeBulkDelete}
                selectedAliases={selectedAliases}
            />

            {/* WIDE: the sidebar selects the domain; one row with its name and the actions */}
            {hideDomainSelector && (
                <HStack gap={3} align="center" justify="between" style={{ flexWrap: "wrap" }}>
                    <HStack gap={2} align="end">
                        <Heading level={2}>
                            {showsAllZones ? t("all_domains") : (selectedZone?.name ?? "")}
                        </Heading>
                        {aliases.isSuccess && (
                            <Text type="supporting">
                                {t("count", { count: aliases.data?.length ?? 0 })}
                            </Text>
                        )}
                    </HStack>
                    <HStack gap={2} align="center">
                        <TextInput
                            type="search"
                            label={t("search_placeholder")}
                            isLabelHidden
                            hasClear
                            width={260}
                            placeholder={t("search_placeholder")}
                            value={aliasSearch}
                            onChange={setAliasSearch}
                            isDisabled={!aliases.data || aliases.data.length === 0}
                        />
                        {selectEnabled ? (
                            <>
                                <Button
                                    label={tc("edit")}
                                    icon={<TbEdit />}
                                    isDisabled={selectedAliases.length === 0}
                                    onClick={() => setEditOpen(true)}
                                />
                                <Button
                                    variant="destructive"
                                    label={tc("delete")}
                                    icon={<TbTrash />}
                                    isDisabled={selectedAliases.length === 0}
                                    onClick={() => setDeleteOpen(true)}
                                />
                                <Button
                                    label={t("done_select")}
                                    onClick={() => {
                                        clearSelection();
                                        setSelectEnabled(false);
                                    }}
                                />
                            </>
                        ) : (
                            <>
                                <IconButton
                                    label={t("select")}
                                    tooltip={t("select")}
                                    icon={<TbListCheck />}
                                    isDisabled={filteredAliases.length === 0}
                                    onClick={() => {
                                        clearSelection();
                                        setSelectEnabled(true);
                                    }}
                                />
                                <IconButton
                                    label={t("refresh")}
                                    tooltip={t("refresh")}
                                    icon={<TbRefresh />}
                                    isLoading={aliases.isFetching}
                                    isDisabled={!isOnline || noZoneSelected}
                                    onClick={() => aliases.refetch()}
                                />
                                <Button
                                    variant="primary"
                                    label={t("create")}
                                    icon={<TbPlus />}
                                    isDisabled={!isOnline || noZoneSelected}
                                    onClick={() => setCreateOpen(true)}
                                />
                            </>
                        )}
                    </HStack>
                </HStack>
            )}

            {/* NARROW: the domain filter and the actions (creating is in the top bar) */}
            {!hideDomainSelector && (
                <HStack gap={1} align="center">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <Selector
                            label={t("domain_placeholder")}
                            isLabelHidden
                            width="100%"
                            placeholder={t("domain_placeholder")}
                            value={selectedZoneId ?? undefined}
                            onChange={setSelectedZoneId}
                            isLoading={zones.isFetching}
                            isDisabled={!zones.data || zones.data.length === 0}
                            options={zoneOptions}
                        />
                    </div>
                    <IconButton
                        size="sm"
                        label={selectEnabled ? t("stop_select") : t("select")}
                        tooltip={selectEnabled ? t("stop_select") : t("select")}
                        icon={selectEnabled ? <TbPlaylistX /> : <TbListCheck />}
                        isDisabled={
                            !zones.data ||
                            (!selectEnabled && filteredAliases.length === 0) ||
                            selectedZoneId === null
                        }
                        onClick={() => {
                            clearSelection();
                            setSelectEnabled(!selectEnabled);
                        }}
                    />

                    {selectEnabled ? (
                        <>
                            <IconButton
                                size="sm"
                                label={tc("edit")}
                                tooltip={tc("edit")}
                                icon={<TbEdit />}
                                isDisabled={selectedAliases.length === 0}
                                onClick={() => setEditOpen(true)}
                            />
                            <IconButton
                                size="sm"
                                variant="destructive"
                                label={tc("delete")}
                                tooltip={tc("delete")}
                                icon={<TbTrash />}
                                isDisabled={selectedAliases.length === 0}
                                onClick={() => setDeleteOpen(true)}
                            />
                        </>
                    ) : (
                        <>
                            <IconButton
                                size="sm"
                                label={searchVisible ? t("stop_search") : t("search")}
                                tooltip={searchVisible ? t("stop_search") : t("search")}
                                icon={searchVisible ? <TbSearchOff /> : <TbSearch />}
                                isDisabled={!aliases.data || aliases.data.length === 0}
                                onClick={() => {
                                    setSearchVisible(!searchVisible);
                                    setAliasSearch("");
                                }}
                            />
                            <IconButton
                                size="sm"
                                label={t("refresh")}
                                tooltip={t("refresh")}
                                icon={<TbRefresh />}
                                isLoading={aliases.isFetching}
                                isDisabled={!isOnline || noZoneSelected}
                                onClick={() => aliases.refetch()}
                            />
                        </>
                    )}
                </HStack>
            )}

            {searchVisible && !hideDomainSelector && (
                <TextInput
                    type="search"
                    label={t("search_placeholder")}
                    isLabelHidden
                    hasAutoFocus
                    hasClear
                    placeholder={t("search_placeholder")}
                    value={aliasSearch}
                    onChange={setAliasSearch}
                />
            )}

            {routingNotReady && (
                <Banner
                    status="warning"
                    title={t("email_routing_not_enabled")}
                    endContent={
                        zoneStatus.data?.setupUrl && (
                            <Link href={zoneStatus.data.setupUrl} isExternalLink>
                                {t("email_routing_dashboard")}
                            </Link>
                        )
                    }
                />
            )}

            {!!selectedZoneId && filteredAliases.length === 0 && aliases.isFetching && (
                <HStack justify="center" paddingBlock={4}>
                    <Spinner />
                </HStack>
            )}

            {!zones.isFetching &&
                zones.isSuccess &&
                zones.data.length === 0 &&
                (canManageDomains && account.isSuccess && !canEditDomains ? (
                    <Banner status="info" title={t("no_shared_domains")} />
                ) : canManageDomains ? (
                    <Banner
                        status="info"
                        title={t("no_worker_domains")}
                        endContent={
                            // Domains are managed in the Worker's own app.
                            lockedWorkerUrl ? (
                                <Button
                                    size="sm"
                                    label={t("add_domain")}
                                    onClick={() => navigate(PATHS.adminDomains)}
                                />
                            ) : (
                                workerUrl && (
                                    <Button
                                        size="sm"
                                        label={t("add_domain")}
                                        href={workerUrl}
                                        target="_blank"
                                    />
                                )
                            )
                        }
                    />
                ) : (
                    <Banner status="warning" title={t("no_zones")} />
                ))}

            {zones.isError && (
                <Banner status="error" title={t("zones_error", { error: String(zones.error) })} />
            )}

            {!!selectedZoneId &&
                aliases.isSuccess &&
                !aliases.isFetching &&
                filteredAliases.length === 0 && <Banner status="info" title={t("no_rules")} />}

            {aliases.isError && !zones.isError && (
                <Banner status="error" title={t("rules_error", { error: String(aliases.error) })} />
            )}

            {/* ALIAS LIST: only the cards in view are rendered */}
            {aliases.data && (
                <VirtualRows
                    items={filteredAliases}
                    getKey={(alias) => alias.id}
                    estimateSize={66}
                    gap={8}
                    initialScrollTop={scrollPosition}
                    onScroll={setScrollPosition}
                    renderItem={(alias) => (
                        <AliasCard
                            alias={alias}
                            selectEnabled={selectEnabled}
                            isSelected={selectedIds.has(alias.id)}
                            // The checkbox and the card both report it: setting, not toggling.
                            onSelect={setAliasSelected}
                            onEdit={handleEdit}
                            onOpen={hasDetailPane ? handleOpen : undefined}
                            isOpen={alias.id === openAliasId}
                            onDelete={handleDelete}
                        />
                    )}
                />
            )}
        </VStack>
    );
}
