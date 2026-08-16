window.__ModuleLoader__.load({
	id: "@dsh-portable/vision-bridge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region src/client/locales.ts
		/**
		* Localization strings for vision-bridge client components.
		* @module @dsh-portable/vision-bridge/client/locales
		*/
		const zh = {
			cardTitle: "视觉辅助 (Vision Bridge)",
			cardDescription: "通过外部 OpenAI 兼容的视觉多模态大模型查看与分析图片文件",
			enabled: "启用视觉辅助",
			enabledHint: "开启后，模型可调用 view_image 工具查看图片",
			provider: "服务商预设",
			providerOpenAI: "OpenAI 官方 (gpt-4o-mini / gpt-4o)",
			providerOllama: "本地 Ollama (llava / minicpm-v)",
			providerCompatible: "自定义 OpenAI 兼容接口",
			model: "模型名称",
			modelHint: "例如 gemini-3.7-flash, mimo-v2.5, gpt-4o-mini",
			baseURL: "接口地址 (Base URL)",
			baseURLHint: "兼容 OpenAI 格式的完整 API 地址",
			apiKey: "API 密钥",
			apiKeyHint: "留空表示不修改或无需密钥 (如本地 Ollama)",
			promptOverride: "系统提示词 (可选)",
			promptOverrideHint: "自定义发送给视觉模型的提示词指令",
			save: "保存配置",
			discard: "放弃修改",
			unsaved: "未保存",
			overridden: "已覆盖默认值",
			reset: "重置",
			readOnly: "此配置当前处于只读模式",
			saving: "正在保存...",
			saveFailed: "保存失败，请检查网络或配置格式",
			collapse: "折叠",
			expand: "展开"
		};
		const en = {
			cardTitle: "Vision Bridge",
			cardDescription: "Inspect and describe image files using an external OpenAI-compatible vision model",
			enabled: "Enable Vision Bridge",
			enabledHint: "Allows the model to call the view_image tool to inspect images",
			provider: "Provider Preset",
			providerOpenAI: "OpenAI Official (gpt-4o-mini / gpt-4o)",
			providerOllama: "Local Ollama (llava / minicpm-v)",
			providerCompatible: "Custom OpenAI Compatible",
			model: "Model Name",
			modelHint: "e.g. gemini-3.7-flash, mimo-v2.5, gpt-4o-mini",
			baseURL: "Base URL",
			baseURLHint: "OpenAI-compatible completions endpoint base URL",
			apiKey: "API Key",
			apiKeyHint: "Leave blank to keep unchanged or if no key required (e.g. Ollama)",
			promptOverride: "System Prompt (Optional)",
			promptOverrideHint: "Custom instruction sent to the vision model",
			save: "Save Changes",
			discard: "Discard",
			unsaved: "Unsaved",
			overridden: "Overridden",
			reset: "Reset",
			readOnly: "This configuration is currently read-only",
			saving: "Saving...",
			saveFailed: "Failed to save configuration",
			collapse: "Collapse",
			expand: "Expand"
		};
		//#endregion
		//#region \0dsh-css:C:\Users\Ryan\Desktop\deepseek-harness-portable\apps\vision-bridge\src\client\VisionCard.module.css.mjs
		const css = ".bICbtG_card{background:var(--dsh-surface-card,#ffffff0d);border:1px solid var(--dsh-border-subtle,#ffffff1a);border-radius:8px;margin-bottom:12px;list-style:none;transition:border-color .2s;overflow:hidden}.bICbtG_card:hover{border-color:var(--dsh-border-hover,#fff3)}.bICbtG_cardOpen{border-color:var(--dsh-border-active,#3b82f680)}.bICbtG_header{cursor:pointer;text-align:left;width:100%;color:inherit;background:0 0;border:none;justify-content:space-between;align-items:center;padding:14px 16px;display:flex}.bICbtG_headText{flex-direction:column;gap:4px;display:flex}.bICbtG_name{color:var(--dsh-text-primary,#fff);font-size:14px;font-weight:600}.bICbtG_description{color:var(--dsh-text-secondary,#fff9);font-size:12px}.bICbtG_chevron{opacity:.7;width:16px;height:16px;transition:transform .2s}.bICbtG_chevronOpen{transform:rotate(180deg)}.bICbtG_pending{color:#facc15;background:#eab30833;border-radius:4px;padding:2px 6px;font-size:11px;font-weight:500}.bICbtG_body{border-top:1px solid var(--dsh-border-subtle,#ffffff14);flex-direction:column;gap:14px;padding:16px;display:flex}.bICbtG_field{flex-direction:column;gap:6px;display:flex}.bICbtG_fieldRow{justify-content:space-between;align-items:center;display:flex}.bICbtG_label{color:var(--dsh-text-primary,#fff);font-size:13px;font-weight:500}.bICbtG_hint{color:var(--dsh-text-muted,#ffffff80);font-size:11px}.bICbtG_input,.bICbtG_select,.bICbtG_textarea{background:var(--dsh-surface-input,#00000040);border:1px solid var(--dsh-border-input,#ffffff26);width:100%;color:var(--dsh-text-primary,#fff);box-sizing:border-box;border-radius:6px;outline:none;padding:8px 10px;font-size:13px}.bICbtG_input:focus,.bICbtG_select:focus,.bICbtG_textarea:focus{border-color:var(--dsh-primary,#3b82f6)}.bICbtG_input:disabled,.bICbtG_select:disabled{opacity:.5;cursor:not-allowed}.bICbtG_switch{width:38px;height:22px;display:inline-block;position:relative}.bICbtG_switch input{opacity:0;width:0;height:0}.bICbtG_slider{cursor:pointer;background-color:#fff3;border-radius:22px;transition:all .2s;position:absolute;inset:0}.bICbtG_slider:before{content:\"\";background-color:#fff;border-radius:50%;width:16px;height:16px;transition:all .2s;position:absolute;bottom:3px;left:3px}input:checked+.bICbtG_slider{background-color:#3b82f6}input:checked+.bICbtG_slider:before{transform:translate(16px)}.bICbtG_footer{border-top:1px solid var(--dsh-border-subtle,#ffffff14);justify-content:flex-end;align-items:center;gap:10px;margin-top:10px;padding-top:10px;display:flex}.bICbtG_btn{cursor:pointer;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:500;transition:background .15s}.bICbtG_discard{color:var(--dsh-text-primary,#fff);background:#ffffff1a}.bICbtG_discard:hover:not(:disabled){background:#ffffff2e}.bICbtG_save{color:#fff;background:#3b82f6}.bICbtG_save:hover:not(:disabled){background:#2563eb}.bICbtG_btn:disabled{opacity:.4;cursor:not-allowed}.bICbtG_statusMsg{margin-right:auto;font-size:12px}.bICbtG_error{color:#ef4444}.bICbtG_readOnly{color:#eab308;margin:0;font-size:12px}";
		const tagId = "@dsh-portable/vision-bridge/VisionCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-portable/vision-bridge";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var VisionCard_module_css_default = {
			"headText": "bICbtG_headText",
			"chevronOpen": "bICbtG_chevronOpen",
			"hint": "bICbtG_hint",
			"switch": "bICbtG_switch",
			"btn": "bICbtG_btn",
			"description": "bICbtG_description",
			"body": "bICbtG_body",
			"fieldRow": "bICbtG_fieldRow",
			"select": "bICbtG_select",
			"header": "bICbtG_header",
			"field": "bICbtG_field",
			"name": "bICbtG_name",
			"label": "bICbtG_label",
			"chevron": "bICbtG_chevron",
			"cardOpen": "bICbtG_cardOpen",
			"slider": "bICbtG_slider",
			"footer": "bICbtG_footer",
			"input": "bICbtG_input",
			"textarea": "bICbtG_textarea",
			"error": "bICbtG_error",
			"card": "bICbtG_card",
			"save": "bICbtG_save",
			"statusMsg": "bICbtG_statusMsg",
			"pending": "bICbtG_pending",
			"discard": "bICbtG_discard",
			"readOnly": "bICbtG_readOnly"
		};
		//#endregion
		//#region src/client/VisionCard.tsx
		/**
		* Visual settings card registered into `settings.plugin.item`.
		* @module @dsh-portable/vision-bridge/client/VisionCard
		*/
		function VisionCard(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const { t } = props;
			const state = props.useVisionCard((snapshot) => snapshot);
			if (!state.available) return null;
			const title = t("cardTitle");
			const desc = t("cardDescription");
			const blocked = !state.dirty || state.saving || !state.writable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: `${VisionCard_module_css_default.card} ${open ? VisionCard_module_css_default.cardOpen : ""}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: VisionCard_module_css_default.header,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${title}`,
					onClick: () => setOpen(!open),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: VisionCard_module_css_default.headText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: VisionCard_module_css_default.name,
								children: title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: VisionCard_module_css_default.description,
								children: desc
							})]
						}),
						state.dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: VisionCard_module_css_default.pending,
							children: t("unsaved")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
							className: `${VisionCard_module_css_default.chevron} ${open ? VisionCard_module_css_default.chevronOpen : ""}`,
							viewBox: "0 0 16 16",
							fill: "currentColor",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
								fillRule: "evenodd",
								d: "M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z",
								clipRule: "evenodd"
							})
						})
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: VisionCard_module_css_default.body,
					children: [
						!state.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: VisionCard_module_css_default.readOnly,
							role: "status",
							children: t("readOnly")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: VisionCard_module_css_default.fieldRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: VisionCard_module_css_default.label,
								children: t("enabled")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: VisionCard_module_css_default.hint,
								children: t("enabledHint")
							})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: VisionCard_module_css_default.switch,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: state.enabled,
									disabled: !state.writable,
									onChange: (e) => props.edit("enabled", e.target.checked)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: VisionCard_module_css_default.slider })]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: VisionCard_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: VisionCard_module_css_default.label,
								children: t("provider")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: VisionCard_module_css_default.select,
								value: state.provider,
								disabled: !state.writable,
								onChange: (e) => props.selectProviderPreset(e.target.value),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "compatible",
										children: t("providerCompatible")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "openai",
										children: t("providerOpenAI")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "ollama",
										children: t("providerOllama")
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: VisionCard_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: VisionCard_module_css_default.label,
									children: t("baseURL")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "text",
									className: VisionCard_module_css_default.input,
									value: state.baseURL,
									disabled: !state.writable,
									placeholder: "https://api.openai.com/v1",
									onChange: (e) => props.edit("baseURL", e.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: VisionCard_module_css_default.hint,
									children: t("baseURLHint")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: VisionCard_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: VisionCard_module_css_default.label,
									children: t("model")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "text",
									className: VisionCard_module_css_default.input,
									value: state.model,
									disabled: !state.writable,
									placeholder: "gpt-4o-mini",
									onChange: (e) => props.edit("model", e.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: VisionCard_module_css_default.hint,
									children: t("modelHint")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: VisionCard_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: VisionCard_module_css_default.label,
									children: t("apiKey")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "password",
									className: VisionCard_module_css_default.input,
									value: state.apiKey,
									disabled: !state.writable,
									placeholder: t("apiKeyHint"),
									onChange: (e) => props.edit("apiKey", e.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: VisionCard_module_css_default.hint,
									children: t("apiKeyHint")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: VisionCard_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: VisionCard_module_css_default.label,
								children: t("promptOverride")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: VisionCard_module_css_default.textarea,
								rows: 2,
								value: state.prompt,
								disabled: !state.writable,
								placeholder: t("promptOverrideHint"),
								onChange: (e) => props.edit("prompt", e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: VisionCard_module_css_default.footer,
							children: [
								state.failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: `${VisionCard_module_css_default.statusMsg} ${VisionCard_module_css_default.error}`,
									children: t("saveFailed")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${VisionCard_module_css_default.btn} ${VisionCard_module_css_default.discard}`,
									disabled: !state.dirty || state.saving,
									onClick: props.discard,
									children: t("discard")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${VisionCard_module_css_default.btn} ${VisionCard_module_css_default.save}`,
									disabled: blocked,
									onClick: props.save,
									children: t(state.saving ? "saving" : "save")
								})
							]
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/vision-card-controller.ts
		/**
		* State controller for the VisionCard settings UI.
		* Connects SettingsScope<VisionSettings> to the React view model.
		* @module @dsh-portable/vision-bridge/client/vision-card-controller
		*/
		var VisionCardController = class {
			scope;
			store;
			staged = {};
			saving = false;
			failed = false;
			constructor(scope) {
				this.scope = scope;
				this.store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(this.projection());
				this.scope.subscribe(() => {
					this.store.set(this.projection());
				});
			}
			projection() {
				const snap = this.scope.getSnapshot();
				const current = snap.value ?? {};
				const enabled = typeof this.staged.enabled === "boolean" ? this.staged.enabled : current.enabled ?? true;
				const provider = typeof this.staged.provider === "string" ? this.staged.provider : current.provider ?? "compatible";
				const model = typeof this.staged.model === "string" ? this.staged.model : current.model ?? "gpt-4o-mini";
				const baseURL = typeof this.staged.baseURL === "string" ? this.staged.baseURL : current.baseURL ?? "https://api.openai.com/v1";
				const apiKey = typeof this.staged.apiKey === "string" ? this.staged.apiKey : "";
				const prompt = typeof this.staged.prompt === "string" ? this.staged.prompt : current.prompt ?? "";
				const dirty = Object.keys(this.staged).length > 0;
				return {
					available: snap.status === "ready" || snap.status === "loading",
					writable: snap.writable,
					dirty,
					saving: this.saving,
					failed: this.failed,
					enabled,
					provider,
					model,
					baseURL,
					apiKey,
					prompt
				};
			}
			edit = (field, value) => {
				this.staged[field] = value;
				this.failed = false;
				this.store.set(this.projection());
			};
			selectProviderPreset = (preset) => {
				this.staged.provider = preset;
				if (preset === "openai") {
					this.staged.baseURL = "https://api.openai.com/v1";
					this.staged.model = "gpt-4o-mini";
				} else if (preset === "ollama") {
					this.staged.baseURL = "http://127.0.0.1:11434/v1";
					this.staged.model = "llava";
				}
				this.failed = false;
				this.store.set(this.projection());
			};
			discard = () => {
				this.staged = {};
				this.failed = false;
				this.store.set(this.projection());
			};
			save = async () => {
				if (Object.keys(this.staged).length === 0 || this.saving) return;
				this.saving = true;
				this.failed = false;
				this.store.set(this.projection());
				try {
					for (const [key, value] of Object.entries(this.staged)) {
						if (key === "apiKey" && (value === "" || value === void 0)) continue;
						await this.scope.set(key, value);
					}
					this.staged = {};
				} catch (_err) {
					this.failed = true;
				} finally {
					this.saving = false;
					this.store.set(this.projection());
				}
			};
			inject() {
				return {
					hooks: { visionCard: this.store },
					edit: this.edit,
					save: this.save,
					discard: this.discard,
					selectProviderPreset: this.selectProviderPreset
				};
			}
		};
		//#endregion
		//#region src/client/index.ts
		const name = "vision-bridge-client";
		const inject = [
			"slots",
			"locale",
			"settingsScope"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("vision-bridge", {
				zh,
				en
			}), "vision-bridge: dictionaries");
			const controller = new VisionCardController(ctx.settingsScope.bind({ namespace: "vision" }));
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: "vision",
				order: 35,
				locale: "vision-bridge",
				inject: () => controller.inject()
			}, VisionCard));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map