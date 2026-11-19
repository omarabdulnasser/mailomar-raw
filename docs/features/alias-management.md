---
title: Alias Management
description: How to create, edit, search, and delete email aliases.
---

## Viewing Aliases

After you sign in, MailFlare loads your domains. Pick one to see its aliases: from the dropdown
above the list in the extension and on phones, or from the **Aliases** section of the sidebar on
large screens.

- Each alias shows its description (usually the website it's for)
- Rules created outside MailFlare are marked **External** (Email Routing rules only, and only if
  the [rule filter](settings.md#rule-filter) is off)
- Disabled aliases are marked **Disabled**
- Aliases whose destination is missing or unverified are marked **Invalid**

## Creating Aliases

Click **+** (or **Create alias** on large screens) to open the create dialog. You can configure:

### Alias Format

- **Random Characters**: a random string, e.g. `abc12@domain.com`
- **Random Words**: random English words, e.g. `happy_cloud@domain.com`
- **Website Domain** (extension only): the current website's domain as the alias
- **Custom**: your own alias address

### Prefix

- **None**
- **Domain without TLD**: e.g. `github_abc12@domain.com`
- **Domain with TLD**: e.g. `github.com_abc12@domain.com`
- **Full Domain**: e.g. `www.github.com_abc12@domain.com`
- **Custom Prefix**: your own prefix

### Other Options

- **Description**: a note for the alias (the current website in the extension)
- **Destination**: the inbox that receives the alias's mail
- **Save as Default**: remember these choices for next time, and for the context menu and the
  quick-create button

## Editing Aliases

Click the edit icon on an alias to change its description, its destination, or whether it's
enabled.

In the web app in a window at least 1280 pixels wide, clicking an alias opens it next to the list
instead, where you
can edit and delete it. With a [Mailflare Worker](../guides/worker-mode.md), this also shows what
the alias handled: mail forwarded, blocked and sent, and when the last mail arrived.

## Deleting Aliases

Click the trash icon on an alias to delete it. You'll be asked to confirm.

## Bulk Operations

1. Click the select button (checklist icon) to enter selection mode
2. Click aliases to select or deselect them
3. Use the edit or delete buttons to change all selected aliases
4. Bulk edit changes the destination or whether the aliases are enabled
5. Bulk delete removes all selected aliases after confirmation

## Searching

Type in the search field to filter aliases by address or description. In the extension and on
phones, click the search icon first to show it.
