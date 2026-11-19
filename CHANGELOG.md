# Changelog

## [2.0.0](https://github.com/Curetix/mailflare/compare/v1.5.5...v2.0.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* Mailflare 2 replaces the Plasmo extension and the Mantine web app of 1.x.

### Features

* account self-service and layout polish ([6ab216c](https://github.com/Curetix/mailflare/commit/6ab216c624c78c27356dd1e972cfd81d699c8bd8))
* **core:** all domains in one alias list, a compact toolbar, and a faster list ([3a4fa95](https://github.com/Curetix/mailflare/commit/3a4fa957d6064695c80227550209557c4147ea18))
* **core:** connect the app and extension to a Mailflare Worker ([3c6d6a8](https://github.com/Curetix/mailflare/commit/3c6d6a840633ff122c8af45a176dc332ab48955d))
* **core:** import aliases in every app, with clearer errors and safer bulk edits ([311f2ba](https://github.com/Curetix/mailflare/commit/311f2ba6e6d1d28c3bd157414f3be7dd0a79f41b))
* **core:** import only the aliases that are turned on ([5d963fe](https://github.com/Curetix/mailflare/commit/5d963fee0c554bfe07f6c7ec5638d0c157e8163d))
* **core:** pages and a responsive layout instead of the settings drawer ([1c5f2e6](https://github.com/Curetix/mailflare/commit/1c5f2e611e0ded25dc987b26de969397859af6c4))
* **core:** replace better-psl with tldts for domain parsing ([6c8957d](https://github.com/Curetix/mailflare/commit/6c8957dfdea9db7df167605f397d1d4cdfe1d795))
* **extension:** carry over 1.x data, and bring back the update and access notices ([bc43ef9](https://github.com/Curetix/mailflare/commit/bc43ef9540fcfbc43ee039e568b90e509adc9d57))
* **extension:** restore the quick-create button and restyle in-page alerts ([74bef29](https://github.com/Curetix/mailflare/commit/74bef29b1515e2eadedc7522695ce357995e198d))
* Mailflare 2 as a monorepo, with the app rebuilt on Astryx ([2080e65](https://github.com/Curetix/mailflare/commit/2080e65307e4abbc94244c0d241770bb9b595d92)), closes [#22](https://github.com/Curetix/mailflare/issues/22) [#24](https://github.com/Curetix/mailflare/issues/24) [#32](https://github.com/Curetix/mailflare/issues/32)
* serve the web app from the Worker, with account sign-in ([f39b5e1](https://github.com/Curetix/mailflare/commit/f39b5e1a62a5ebcbfe5ea8f06b93e171b9e80926))
* user mode for Worker accounts, and account sign-in for the extension ([806735c](https://github.com/Curetix/mailflare/commit/806735cec21c653086b8a5534eb5e8149736ebbc)), closes [#33](https://github.com/Curetix/mailflare/issues/33)
* **worker:** add accounts with better-auth ([b68f99b](https://github.com/Curetix/mailflare/commit/b68f99b0e8f283bd8bf0c0952303b6cbe2d92d64)), closes [#33](https://github.com/Curetix/mailflare/issues/33)
* **worker:** add the Mailflare Worker with email routing and alias API ([aede3e4](https://github.com/Curetix/mailflare/commit/aede3e48d7e7337aaf2f4b2cb8ec9a9b6d9a96d1)), closes [#33](https://github.com/Curetix/mailflare/issues/33)
* **worker:** delete expired links, sessions and counters daily ([82bf598](https://github.com/Curetix/mailflare/commit/82bf5987a68a3871758217ef075f79ebb13c3b2b))
* **worker:** deploy the Worker with its app from the repository root ([12ea9d0](https://github.com/Curetix/mailflare/commit/12ea9d022fc86c261e59b17754ea94af07c443bd))
* **worker:** refuse mail that goes in circles between aliases ([2f6344e](https://github.com/Curetix/mailflare/commit/2f6344e18a1ae1722aa0f395bec529a03c04142d))
* **worker:** reply and send from aliases through reverse addresses ([4799ed0](https://github.com/Curetix/mailflare/commit/4799ed0291a8f97c21fdfc7f70f5bf0098d80685))


### Bug Fixes

* **core:** keep each connection's data to itself, and the cached list offline ([c10d04f](https://github.com/Curetix/mailflare/commit/c10d04f3ddc49f4848956d2a97c68d2d0d9d6d58))
* **core:** keep the action buttons of form dialogs reachable ([e928be4](https://github.com/Curetix/mailflare/commit/e928be484df5bf4e2d8587763a287789761d7da8))
* **core:** select aliases with their checkbox ([1ac81f4](https://github.com/Curetix/mailflare/commit/1ac81f4bf0ebcc83c6ca4d93e7533f1431797c11))
* **core:** show only one toast after creating an alias ([14ff479](https://github.com/Curetix/mailflare/commit/14ff47913cb68f34c4b99f0c37970d18f7ad950a))
* **extension:** bring back website aliases in the popup, and harden page helpers ([f85a949](https://github.com/Curetix/mailflare/commit/f85a949943fa073ca349216a35a050e35528171f))
* **extension:** only offer the context menu entry on https pages ([78423c3](https://github.com/Curetix/mailflare/commit/78423c327ef3055c64a69cabc6cd452298f8b3bb))
* **web:** limit the Cloudflare API proxy to the app's own requests ([c3dea11](https://github.com/Curetix/mailflare/commit/c3dea116252af8d12c2339723176514d37dad013))
* **web:** pass proxied API requests on instead of fetching them again ([68ca0a0](https://github.com/Curetix/mailflare/commit/68ca0a0e9be5ae27fab75db5b8281ad02f382b60))
* **web:** switch to a new app version as soon as it is installed ([488016c](https://github.com/Curetix/mailflare/commit/488016c98e2744a79167014ebe48dc246f181978))
* **worker:** close gaps in account sign-up, sessions and admin rights ([0fe2b18](https://github.com/Curetix/mailflare/commit/0fe2b1837c1f4c5f41af0248e36cc395f8a01e14))
* **worker:** deploy before applying migrations ([209ff5e](https://github.com/Curetix/mailflare/commit/209ff5e7c157a277a62e26922d452dd6fac30ed6))
* **worker:** harden replies, contacts and shared-domain addresses ([41b3267](https://github.com/Curetix/mailflare/commit/41b326710b02bbd99b76dfb7774bdf2a9cd5b208))


### Performance

* **web:** keep React in a file of its own ([f16885a](https://github.com/Curetix/mailflare/commit/f16885a7b4f41dd4b9c06b65766391df5dd5158d))
