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
			cardDescription: "为本地图片分析与会话图片轮次准备混合视觉路由",
			enabled: "启用视觉辅助",
			enabledHint: "图片轮次复用原生附件与已配置的视觉模型；纯文字轮次继续使用原文本模型",
			model: "指定模型 (可选)",
			modelHint: "留空时自动选用已配置的图像模型；同名模型可填写 provider/model 来指定服务商",
			modelPlaceholder: "留空 = 自动选择支持图像的模型",
			useAutomatic: "恢复自动选择",
			save: "保存配置",
			discard: "放弃修改",
			unsaved: "未保存",
			readOnly: "此配置当前处于只读模式",
			saving: "正在保存...",
			saveFailed: "保存失败，请检查网络或配置格式",
			routeAuto: "自动选择",
			routePinned: "已指定",
			routeDisabled: "已停用",
			sharedProviderTitle: "复用「设置 → 模型」的配置",
			sharedProviderHint: "图片轮次直接走内核附件与 LLM 通道，Vision Bridge 不另存密钥、接口、提示词或超时参数。",
			routeAutoTitle: "Hybrid / view_image：自动选择图像模型",
			routeAutoHint: "文本模型的图片轮次和 view_image 会从模型目录中选择第一个明确支持图片输入的模型；当前官方内核包含 DeepSeek-V4-Flash-Vision-Exp。",
			routePinnedTitle: "Hybrid / view_image：使用指定模型",
			routePinnedHint: "文本模型的图片轮次和 view_image 固定使用下面的路由；同名模型可用 provider/model 指定；原生多模态模型仍直接接收图片。",
			routeDisabledTitle: "Hybrid Vision Bridge 当前已停用",
			routeDisabledHint: "当前模型仍可使用其原生图片能力；文本模型的自动视觉桥接和 view_image 不可用。",
			visionTurnReady: "本轮包含图片，将使用原生能力或视觉桥接",
			visionTurnImages: "{count} 张图片",
			visionTurnRestore: "后续纯文字轮次继续使用当前选择的模型。",
			collapse: "折叠",
			expand: "展开"
		};
		const en = {
			cardTitle: "Vision Bridge",
			cardDescription: "Prepare a hybrid visual route for local analysis and image turns",
			enabled: "Enable Vision Bridge",
			enabledHint: "Image turns reuse native attachments and your configured vision model; text-only turns keep the original text model",
			model: "Pin a model (optional)",
			modelHint: "Leave empty for automatic selection; use provider/model to disambiguate duplicate ids",
			modelPlaceholder: "Empty = discover an image-capable model",
			useAutomatic: "Back to automatic selection",
			save: "Save Changes",
			discard: "Discard",
			unsaved: "Unsaved",
			readOnly: "This configuration is currently read-only",
			saving: "Saving...",
			saveFailed: "Failed to save configuration",
			routeAuto: "Automatic",
			routePinned: "Pinned",
			routeDisabled: "Disabled",
			sharedProviderTitle: "Uses your Settings → Models configuration",
			sharedProviderHint: "Image turns use the kernel attachment and LLM path. Vision Bridge stores no separate key, endpoint, prompt, or timeout.",
			routeAutoTitle: "Hybrid / view_image: automatic model selection",
			routeAutoHint: "Image turns on text models and view_image pick the first configured model that explicitly declares image input; the current official kernel includes DeepSeek-V4-Flash-Vision-Exp.",
			routePinnedTitle: "Hybrid / view_image: pinned model",
			routePinnedHint: "Image turns on text models and view_image use the pinned route; use provider/model for duplicate ids, while native multimodal models still receive images directly.",
			routeDisabledTitle: "Hybrid Vision Bridge is disabled",
			routeDisabledHint: "The current model keeps its native image capability; automatic text-model bridging and view_image are unavailable.",
			visionTurnReady: "This image turn will use native input or Vision Bridge",
			visionTurnImages: "{count} image(s)",
			visionTurnRestore: "Later text-only turns keep the currently selected model.",
			collapse: "Collapse",
			expand: "Expand"
		};
		//#endregion
		//#region \0dsh-css:C:\Users\Ryan\Desktop\deepseek-harness-portable\apps\vision-bridge\src\client\VisionCard.module.css.mjs
		const css$1 = ".bICbtG_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;margin-bottom:12px;list-style:none;transition:border-color .16s,background .16s}.bICbtG_card:hover{border-color:var(--dsw-alias-label-dimmed)}.bICbtG_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.bICbtG_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.bICbtG_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.bICbtG_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.bICbtG_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.bICbtG_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.bICbtG_chevron{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.bICbtG_chevronOpen{transform:rotate(180deg)}.bICbtG_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.bICbtG_routeBadge{white-space:nowrap;border:1px solid;border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:600;line-height:17px}.bICbtG_route_auto{color:var(--dsw-alias-brand-primary,#2563eb)}.bICbtG_route_pinned{color:var(--dsw-alias-label-success,#15803d)}.bICbtG_route_disabled{color:var(--dsw-alias-label-tertiary,#64748b)}.bICbtG_nativeRoute{color:var(--dsw-alias-brand-primary,#2563eb)}.bICbtG_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.bICbtG_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}.bICbtG_routeSummary{background:var(--dsw-alias-bg-layer-3);border:1px solid;border-radius:9px;align-items:flex-start;gap:10px;margin:12px 0 0;padding:10px 12px;display:flex}.bICbtG_routeDot{background:currentColor;border-radius:50%;flex:none;width:8px;height:8px;margin-top:5px}.bICbtG_routeText{flex-direction:column;gap:2px;min-width:0;font-size:12px;line-height:1.5;display:flex}.bICbtG_routeText strong{color:var(--dsw-alias-label-primary);font-size:13px}.bICbtG_routeText span{color:var(--dsw-alias-label-secondary)}.bICbtG_routeText code{text-overflow:ellipsis;white-space:nowrap;color:currentColor;width:fit-content;max-width:100%;overflow:hidden}.bICbtG_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.bICbtG_field+.bICbtG_field,.bICbtG_fieldRow+.bICbtG_field{border-top:1px solid var(--dsw-alias-border-l2)}.bICbtG_fieldRow{justify-content:space-between;align-items:center;gap:16px;padding:12px 0;display:flex}.bICbtG_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.bICbtG_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.bICbtG_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);box-sizing:border-box;border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.bICbtG_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.bICbtG_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.bICbtG_switch{flex:none;width:38px;height:22px;display:inline-block;position:relative}.bICbtG_switch input{opacity:0;width:0;height:0;position:absolute}.bICbtG_slider{cursor:pointer;background-color:var(--dsw-alias-border-l1,#cbd5e1);border-radius:22px;transition:all .16s;position:absolute;inset:0}.bICbtG_slider:before{content:\"\";background-color:var(--dsw-alias-bg-layer-3,#fff);border-radius:50%;width:16px;height:16px;transition:all .16s;position:absolute;bottom:3px;left:3px;box-shadow:0 1px 3px #00000026}.bICbtG_switch input:checked+.bICbtG_slider{background-color:var(--dsw-alias-brand-primary,#3b82f6)}.bICbtG_switch input:checked+.bICbtG_slider:before{transform:translate(16px)}.bICbtG_switch input:disabled+.bICbtG_slider{opacity:.4;cursor:default}.bICbtG_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.bICbtG_statusMsg,.bICbtG_failed{min-width:0;color:var(--dsw-alias-label-error,#ef4444);flex:1;margin:0;font-size:12px;line-height:1.5}.bICbtG_discard,.bICbtG_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.bICbtG_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.bICbtG_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.bICbtG_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.bICbtG_save:hover:not(:disabled){opacity:.9}.bICbtG_discard:disabled,.bICbtG_save:disabled{opacity:.4;cursor:default}.bICbtG_discard:focus-visible,.bICbtG_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}";
		const tagId$1 = "@dsh-portable/vision-bridge/VisionCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-portable/vision-bridge";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var VisionCard_module_css_default = {
			"body": "bICbtG_body",
			"card": "bICbtG_card",
			"cardOpen": "bICbtG_cardOpen",
			"chevron": "bICbtG_chevron",
			"chevronOpen": "bICbtG_chevronOpen",
			"description": "bICbtG_description",
			"discard": "bICbtG_discard",
			"failed": "bICbtG_failed",
			"field": "bICbtG_field",
			"fieldRow": "bICbtG_fieldRow",
			"footer": "bICbtG_footer",
			"headText": "bICbtG_headText",
			"header": "bICbtG_header",
			"hint": "bICbtG_hint",
			"input": "bICbtG_input",
			"label": "bICbtG_label",
			"name": "bICbtG_name",
			"nativeRoute": "bICbtG_nativeRoute",
			"pending": "bICbtG_pending",
			"readOnly": "bICbtG_readOnly",
			"routeBadge": "bICbtG_routeBadge",
			"routeDot": "bICbtG_routeDot",
			"routeSummary": "bICbtG_routeSummary",
			"routeText": "bICbtG_routeText",
			"route_auto": "bICbtG_route_auto",
			"route_disabled": "bICbtG_route_disabled",
			"route_pinned": "bICbtG_route_pinned",
			"save": "bICbtG_save",
			"slider": "bICbtG_slider",
			"statusMsg": "bICbtG_statusMsg",
			"switch": "bICbtG_switch"
		};
		//#endregion
		//#region src/client/VisionCard.tsx
		/**
		* Visual settings card registered into `settings.plugin.item`.
		* @module @dsh-portable/vision-bridge/client/VisionCard
		*/
		/** Locale key triplet describing one selection state. */
		const ROUTE_COPY = {
			auto: {
				badge: "routeAuto",
				title: "routeAutoTitle",
				hint: "routeAutoHint"
			},
			pinned: {
				badge: "routePinned",
				title: "routePinnedTitle",
				hint: "routePinnedHint"
			},
			disabled: {
				badge: "routeDisabled",
				title: "routeDisabledTitle",
				hint: "routeDisabledHint"
			}
		};
		function VisionCard(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const { t } = props;
			const state = props.useVisionCard((snapshot) => snapshot);
			if (!state.available) return null;
			const title = t("cardTitle");
			const desc = t("cardDescription");
			const blocked = !state.dirty || state.saving || !state.writable;
			const copy = ROUTE_COPY[state.route.kind];
			const selection = state.route.model ?? "";
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
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `${VisionCard_module_css_default.routeBadge} ${VisionCard_module_css_default[`route_${state.route.kind}`]}`,
							children: t(copy.badge)
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
							className: `${VisionCard_module_css_default.routeSummary} ${VisionCard_module_css_default.nativeRoute}`,
							"data-route": "shared-providers",
							role: "status",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: VisionCard_module_css_default.routeDot,
								"aria-hidden": "true"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: VisionCard_module_css_default.routeText,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sharedProviderTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sharedProviderHint") })]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: `${VisionCard_module_css_default.routeSummary} ${VisionCard_module_css_default[`route_${state.route.kind}`]}`,
							"data-route": state.route.kind,
							role: "status",
							"aria-live": "polite",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: VisionCard_module_css_default.routeDot,
								"aria-hidden": "true"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: VisionCard_module_css_default.routeText,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(copy.title) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(copy.hint) }),
									selection !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: selection })
								]
							})]
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
									placeholder: t("modelPlaceholder"),
									onChange: (e) => props.edit("model", e.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: VisionCard_module_css_default.hint,
									children: t("modelHint")
								})
							]
						}),
						state.route.kind === "pinned" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${VisionCard_module_css_default.btn} ${VisionCard_module_css_default.discard}`,
							disabled: !state.writable,
							onClick: props.useAutomaticModel,
							children: t("useAutomatic")
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
		//#region src/client/vision-route.ts
		/**
		* Project input attachment ids into a route preparation plan.
		*
		* `readonly unknown[]` is intentional: this helper is also useful to host
		* adapters and tests without importing the browser-only attachment brand.
		* Empty/absent input follows the normal text route and never asks the host to
		* switch models.
		*/
		function planVisionTurn(imageIds) {
			const imageCount = imageIds?.length ?? 0;
			if (imageCount === 0) return {
				kind: "text",
				imageCount: 0,
				restoreTextRoute: false
			};
			return {
				kind: "vision",
				imageCount,
				restoreTextRoute: true
			};
		}
		/**
		* Summarize the configured vision selection.
		* @param enabled - whether the capability is offered at all.
		* @param model - configured model id or provider/model; empty means discover an image-capable one.
		*/
		function describeVisionRoute(enabled, model) {
			if (!enabled) return { kind: "disabled" };
			const pinnedModel = model.trim();
			if (pinnedModel === "") return { kind: "auto" };
			return {
				kind: "pinned",
				model: pinnedModel
			};
		}
		//#endregion
		//#region \0dsh-css:C:\Users\Ryan\Desktop\deepseek-harness-portable\apps\vision-bridge\src\client\VisionRouteMarker.module.css.mjs
		const css = "._2uuoLq_root{box-sizing:border-box;width:100%;padding:3px var(--dsh-composer-side-clearance,16px) 0;color:var(--dsw-alias-label-tertiary);white-space:nowrap;justify-content:center;align-items:center;gap:6px;font-size:12px;line-height:18px;display:flex}._2uuoLq_root[data-route=vision]{color:var(--dsw-alias-label-secondary)}._2uuoLq_dot{background:var(--dsw-alias-accent-primary,currentColor);border-radius:50%;flex:none;width:6px;height:6px}._2uuoLq_count{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}._2uuoLq_srOnly{clip:rect(0, 0, 0, 0);white-space:nowrap;border:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}";
		const tagId = "@dsh-portable/vision-bridge/VisionRouteMarker.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-portable/vision-bridge";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var VisionRouteMarker_module_css_default = {
			"count": "_2uuoLq_count",
			"dot": "_2uuoLq_dot",
			"root": "_2uuoLq_root",
			"srOnly": "_2uuoLq_srOnly"
		};
		//#endregion
		//#region src/client/VisionRouteMarker.tsx
		function VisionRouteMarker({ input, t, useVisionCard }) {
			const enabled = useVisionCard((state) => state.enabled);
			const plan = planVisionTurn(input.imageIds);
			if (!enabled || plan.kind === "text") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: VisionRouteMarker_module_css_default.root,
				"data-route": plan.kind,
				role: "status",
				"aria-live": "polite",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: VisionRouteMarker_module_css_default.dot,
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("visionTurnReady") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: VisionRouteMarker_module_css_default.count,
						children: t("visionTurnImages", { count: plan.imageCount })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: VisionRouteMarker_module_css_default.srOnly,
						children: t("visionTurnRestore")
					})
				]
			});
		}
		//#endregion
		//#region src/client/vision-card-controller.ts
		/**
		* State controller for the VisionCard settings UI.
		* Connects SettingsScope<VisionSettings> to the React view model.
		* @module @dsh-portable/vision-bridge/client/vision-card-controller
		*/
		/** Field defaults mirroring the host schema, so an unset value renders the same on both sides. */
		const DEFAULTS = {
			enabled: true,
			model: ""
		};
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
			/** Staged edit, then stored value, then the schema default. */
			field(current, key) {
				const staged = this.staged[key];
				if (typeof staged === typeof DEFAULTS[key]) return staged;
				const stored = current[key];
				if (typeof stored === typeof DEFAULTS[key]) return stored;
				return DEFAULTS[key];
			}
			projection() {
				const snap = this.scope.getSnapshot();
				const current = snap.value ?? {};
				const enabled = this.field(current, "enabled");
				const model = this.field(current, "model");
				return {
					available: snap.status === "ready" || snap.status === "loading",
					writable: snap.writable,
					dirty: Object.keys(this.staged).length > 0,
					saving: this.saving,
					failed: this.failed,
					enabled,
					model,
					route: describeVisionRoute(enabled, model)
				};
			}
			edit = (field, value) => {
				this.staged[field] = value;
				this.failed = false;
				this.store.set(this.projection());
			};
			/** Clear the model pin so the host discovers an image-capable model itself. */
			useAutomaticModel = () => {
				this.staged.model = "";
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
					for (const [key, value] of Object.entries(this.staged)) await this.scope.set(key, value);
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
					useAutomaticModel: this.useAutomaticModel
				};
			}
		};
		//#endregion
		//#region src/client/index.ts
		const name = "vision-bridge-client";
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
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
				key: "vision",
				locale: "vision-bridge",
				inject: () => controller.inject()
			}, VisionCard));
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "vision-route",
				order: 1,
				locale: "vision-bridge",
				inject: () => controller.inject()
			}, VisionRouteMarker));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map